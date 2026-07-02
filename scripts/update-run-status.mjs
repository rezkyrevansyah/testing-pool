// update-run-status.mjs
// Updates the status of a test_run row in Supabase.
// Usage: node scripts/update-run-status.mjs <status>
// Called from GitHub Actions steps.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const status = process.argv[2]
if (!status) {
  console.error('Usage: node update-run-status.mjs <status>')
  process.exit(1)
}

const update = {
  status,
}

if (status === 'running') {
  update.github_run_id = process.env.GH_RUN_ID ? parseInt(process.env.GH_RUN_ID) : null
  update.github_run_url = process.env.GH_RUN_URL ?? null
  update.started_at = new Date().toISOString()
}

const { error } = await supabase
  .from('test_runs')
  .update(update)
  .eq('id', process.env.RUN_ID)

if (error) {
  console.error('Failed to update run status:', error.message)
  process.exit(1)
}

console.log(`Run ${process.env.RUN_ID} → status: ${status}`)
