// report-results.mjs
// Reads cypress/results/results.json (Cypress JSON reporter output) and writes
// test_results + test_cases rows to Supabase, then updates the test_run summary.
// Called from GitHub Actions after Cypress completes.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const runId = process.env.RUN_ID
const suiteName = process.env.SUITE_NAME
const cypressPassed = process.env.CYPRESS_OUTCOME === 'success'

const resultsPath = 'cypress/results/results.json'

async function markError(message) {
  console.error(message)
  await supabase.from('test_runs').update({
    status: 'error',
    completed_at: new Date().toISOString(),
  }).eq('id', runId)
}

/**
 * Parse HTTP method, URL, and status code from a Cypress test title.
 * Handles patterns like:
 *   "GET /health → 200 dan envelope lengkap"
 *   "POST /auth/login (admin) → 200 dan dapat access_token"
 *   "DELETE /users/1 should return 204"
 */
function parseHttpFromTitle(title) {
  if (!title) return { http_method: null, http_url: null, http_status: null }

  // Match HTTP method + URL path
  const methodUrlMatch = title.match(/\b(GET|POST|PUT|PATCH|DELETE)\b\s+(\/[^\s→\u2192→,)]+)/i)

  // Match HTTP status code: "→ 200", "→200", "return 201", "returns 404", "status 422"
  const statusMatch = title.match(/(?:[→\u2192]|returns?|status)\s*(\d{3})\b/i)

  return {
    http_method: methodUrlMatch ? methodUrlMatch[1].toUpperCase() : null,
    http_url: methodUrlMatch ? methodUrlMatch[2] : null,
    http_status: statusMatch ? parseInt(statusMatch[1], 10) : null,
  }
}

async function main() {
  if (!existsSync(resultsPath)) {
    await markError('No results file found — Cypress may have failed to launch.')
    return
  }

  let report
  try {
    report = JSON.parse(readFileSync(resultsPath, 'utf8'))
  } catch (err) {
    await markError(`Failed to parse results.json: ${err.message}`)
    return
  }

  // Cypress JSON reporter: report.results[] has one entry per spec file
  const specFiles = report.results ?? []

  if (specFiles.length === 0) {
    await markError('results.json has no spec entries.')
    return
  }

  let totalPassed = 0
  let totalFailed = 0
  let totalPending = 0
  let totalDuration = 0

  for (const specFile of specFiles) {
    const specFileName = specFile.file?.split('/').pop() ?? specFile.spec
    const exactPath = `${suiteName}/${specFileName}`

    console.log(`Looking up spec: "${exactPath}" (filename: "${specFileName}")`)

    // Flexible lookup: exact path first, then fallback to filename match
    let specRow = null

    const { data: exactMatch } = await supabase
      .from('specs')
      .select('id, path')
      .eq('path', exactPath)
      .maybeSingle()

    if (exactMatch) {
      specRow = exactMatch
      console.log(`  ✓ Found by exact path: ${exactMatch.path}`)
    } else {
      // Fallback: match by filename only (handles path prefix differences)
      const { data: fuzzyMatch } = await supabase
        .from('specs')
        .select('id, path')
        .ilike('path', `%${specFileName}`)
        .maybeSingle()

      if (fuzzyMatch) {
        specRow = fuzzyMatch
        console.log(`  ✓ Found by filename fallback: ${fuzzyMatch.path}`)
      }
    }

    if (!specRow) {
      console.warn(`  ✗ Spec not found in DB: ${exactPath} — skipping`)
      continue
    }

    const stats = specFile.stats ?? {}
    const passed = stats.passes ?? 0
    const failed = stats.failures ?? 0
    const pending = stats.pending ?? 0
    const duration = stats.duration ?? 0

    // Insert test_result row for this spec
    const { data: resultRow, error: resultErr } = await supabase
      .from('test_results')
      .insert({
        run_id: runId,
        spec_id: specRow.id,
        status: failed > 0 ? 'failed' : 'passed',
        duration_ms: duration,
      })
      .select('id')
      .single()

    if (resultErr || !resultRow) {
      console.error(`  ✗ Failed to insert test_result for ${exactPath}:`, resultErr?.message)
      continue
    }

    // Collect all individual tests recursively from nested suites
    const allTests = []
    for (const suite of specFile.suites ?? []) {
      collectTests(suite, allTests)
    }

    // Insert each test case with HTTP metadata parsed from title
    for (const test of allTests) {
      const caseStatus = test.pass ? 'passed' : test.pending ? 'pending' : 'failed'
      const httpMeta = parseHttpFromTitle(test.fullTitle ?? test.title ?? '')

      await supabase.from('test_cases').insert({
        result_id: resultRow.id,
        title: test.fullTitle ?? test.title,
        status: caseStatus,
        duration_ms: test.duration ?? null,
        error_message: test.err?.message ?? null,
        error_stack: test.err?.stack ?? null,
        http_method: httpMeta.http_method,
        http_url: httpMeta.http_url,
        http_status: httpMeta.http_status,
      })
    }

    totalPassed += passed
    totalFailed += failed
    totalPending += pending
    totalDuration += duration

    console.log(`  ✓ ${specFileName}: ${passed} passed, ${failed} failed, ${pending} pending`)
  }

  // Update the test_run summary
  const finalStatus = cypressPassed ? 'passed' : 'failed'
  const { error: updateErr } = await supabase.from('test_runs').update({
    status: finalStatus,
    total_tests: totalPassed + totalFailed + totalPending,
    passed_tests: totalPassed,
    failed_tests: totalFailed,
    skipped_tests: totalPending,
    duration_ms: totalDuration,
    completed_at: new Date().toISOString(),
  }).eq('id', runId)

  if (updateErr) {
    console.error('Failed to update test_run:', updateErr.message)
    process.exit(1)
  }

  console.log(`\nRun ${runId} → ${finalStatus}: ${totalPassed} passed, ${totalFailed} failed, ${totalPending} pending`)
}

// Recursively collect all tests from nested suites
function collectTests(suite, out) {
  for (const test of suite.tests ?? []) {
    out.push(test)
  }
  for (const child of suite.suites ?? []) {
    collectTests(child, out)
  }
}

main().catch((err) => {
  console.error('Fatal error in report-results:', err)
  process.exit(1)
})
