// =============================================================================
// Cypress API Test — service-zaper (Label Taat Zakat)
// Target: http://service-zaper-53046748745.asia-southeast2.run.app
//
// Flow: health → login → validasi negatif → keamanan → RBAC →
//       CRUD (sector → company → commitment → invoice → receipt →
//       transaction → certificate) → notifikasi → audit → logout
// =============================================================================

const BASE = 'http://service-zaper-53046748745.asia-southeast2.run.app/api/v1';

// ─── Kredensial ───────────────────────────────────────────────────────────────
const CREDS = {
  admin:   { email: 'admin@baznas.go.id',   password: 'Admin@12345' },
  ro:      { email: 'ro1@baznas.go.id',     password: 'RO@12345'   },
  layanan: { email: 'layanan@baznas.go.id', password: 'Layanan@12345' },
  kepala:  { email: 'kepala@baznas.go.id',  password: 'Kepala@12345' },
};

// ─── Token store (diisi saat runtime) ────────────────────────────────────────
let tokenAdmin   = '';
let tokenRo      = '';
let tokenLayanan = '';
let tokenKepala  = '';

// ─── ID store — diisi dari response CREATE lalu dipakai di test berikutnya ───
let sectorId     = 0;
let companyId    = 0;
let commitmentId = 0;
let invoiceId    = 0;
let receiptId    = 0;
let transactionId= 0;
let certId       = 0;

// ─── Helper: auth header ──────────────────────────────────────────────────────
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// ─── Helper: assert envelope standar ─────────────────────────────────────────
function assertEnvelope(body: Record<string, unknown>, expectSuccess: boolean) {
  expect(body).to.have.property('success', expectSuccess);
  expect(body).to.have.property('status_code');
  expect(body).to.have.property('message');
  expect(body).to.have.property('data');
}

// =============================================================================
// BLOK 1 — SMOKE & HEALTH
// =============================================================================
describe('[1] Smoke — Health', () => {
  it('GET /health → 200 dan envelope lengkap', () => {
    cy.request(`${BASE}/health`).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.have.property('status');
      expect(res.body).to.have.property('message');
    });
  });
});

// =============================================================================
// BLOK 2 — AUTENTIKASI
// =============================================================================
describe('[2] Auth — Login semua role', () => {
  it('POST /auth/login (admin) → 200 dan dapat access_token', () => {
    cy.request({ method: 'POST', url: `${BASE}/auth/login`, body: CREDS.admin }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data).to.have.property('access_token').and.not.be.empty;
      expect(res.body.data).to.have.property('refresh_token').and.not.be.empty;
      tokenAdmin = res.body.data.access_token;
    });
  });

  it('POST /auth/login (ro) → 200', () => {
    cy.request({ method: 'POST', url: `${BASE}/auth/login`, body: CREDS.ro }).then((res) => {
      expect(res.status).to.eq(200);
      tokenRo = res.body.data.access_token;
    });
  });

  it('POST /auth/login (tim_layanan) → 200', () => {
    cy.request({ method: 'POST', url: `${BASE}/auth/login`, body: CREDS.layanan }).then((res) => {
      expect(res.status).to.eq(200);
      tokenLayanan = res.body.data.access_token;
    });
  });

  it('POST /auth/login (kepala_divisi) → 200', () => {
    cy.request({ method: 'POST', url: `${BASE}/auth/login`, body: CREDS.kepala }).then((res) => {
      expect(res.status).to.eq(200);
      tokenKepala = res.body.data.access_token;
    });
  });

  it('GET /auth/me → 200 dan data user valid', () => {
    cy.request({ method: 'GET', url: `${BASE}/auth/me`, headers: auth(tokenAdmin) }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data).to.have.property('email');
      expect(res.body.data).to.have.property('roles').and.be.an('array');
    });
  });
});

// =============================================================================
// BLOK 3 — VALIDASI NEGATIF
// =============================================================================
describe('[3] Validasi Negatif — Auth', () => {
  it('POST /auth/login body kosong → 400', () => {
    cy.request({ method: 'POST', url: `${BASE}/auth/login`, body: {}, failOnStatusCode: false }).then((res) => {
      expect(res.status).to.eq(400);
    });
  });

  it('POST /auth/login tanpa password → 400', () => {
    cy.request({
      method: 'POST', url: `${BASE}/auth/login`,
      body: { email: 'admin@baznas.go.id' }, failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
    });
  });

  it('POST /auth/login password salah → 401', () => {
    cy.request({
      method: 'POST', url: `${BASE}/auth/login`,
      body: { email: 'admin@baznas.go.id', password: 'salah-banget' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(401);
    });
  });

  it('POST /auth/login email tidak terdaftar → 401', () => {
    cy.request({
      method: 'POST', url: `${BASE}/auth/login`,
      body: { email: 'nobody@nowhere.test', password: 'x' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(401);
    });
  });
});

// =============================================================================
// BLOK 4 — KEAMANAN (SQL Injection & XSS)
// =============================================================================
describe('[4] Keamanan — SQL Injection & XSS', () => {
  it('SQLi pada login body → ditolak 400/401', () => {
    cy.request({
      method: 'POST', url: `${BASE}/auth/login`,
      body: { email: "a@a.com' OR 1=1 --", password: 'x' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.oneOf([400, 401]);
    });
  });

  it('XSS pada login body → ditolak 400/401', () => {
    cy.request({
      method: 'POST', url: `${BASE}/auth/login`,
      body: { email: '<script>alert(1)</script>', password: 'x' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.oneOf([400, 401]);
    });
  });

  it('SQLi pada query param /companies → 400', () => {
    cy.request({
      method: 'GET', url: `${BASE}/companies?search=test' OR 1=1 --`,
      headers: auth(tokenAdmin), failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
    });
  });

  it('XSS pada query param /companies → 400', () => {
    cy.request({
      method: 'GET', url: `${BASE}/companies?search=<script>alert(1)</script>`,
      headers: auth(tokenAdmin), failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
    });
  });

  it('SQLi pada body POST /companies → 400', () => {
    cy.request({
      method: 'POST', url: `${BASE}/companies`,
      headers: auth(tokenAdmin),
      body: { name: '"; DROP TABLE users; --', email: 'x@x.com' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
    });
  });
});

// =============================================================================
// BLOK 5 — AUTENTIKASI: tanpa token / token invalid
// =============================================================================
describe('[5] AuthN — Tanpa Token & Token Invalid', () => {
  const protectedEndpoints: [string, string][] = [
    ['GET',   '/auth/me'],
    ['GET',   '/users/'],
    ['GET',   '/companies/'],
    ['GET',   '/sectors/'],
    ['GET',   '/targets/'],
    ['GET',   '/commitments/'],
    ['GET',   '/invoices/'],
    ['GET',   '/receipts/'],
    ['GET',   '/transactions/'],
    ['GET',   '/taat-zakat/'],
    ['GET',   '/bsz-claims/'],
    ['GET',   '/audit-logs/'],
    ['GET',   '/notifications/'],
    ['GET',   '/dashboard/zakat-stats'],
    ['GET',   '/dashboard/anniversaries'],
    ['GET',   '/finance-numbering/list'],
  ];

  protectedEndpoints.forEach(([method, path]) => {
    it(`${method} ${path} tanpa token → 401`, () => {
      cy.request({ method, url: `${BASE}${path}`, failOnStatusCode: false }).then((res) => {
        expect(res.status).to.eq(401);
      });
    });
  });

  it('GET /auth/me dengan token invalid → 401', () => {
    cy.request({
      method: 'GET', url: `${BASE}/auth/me`,
      headers: { Authorization: 'Bearer invalid.token.value' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(401);
    });
  });
});

// =============================================================================
// BLOK 6 — RBAC: 403 Forbidden
// =============================================================================
describe('[6] RBAC — 403 Forbidden', () => {
  it('tim_layanan POST /companies → 403', () => {
    cy.request({
      method: 'POST', url: `${BASE}/companies`,
      headers: auth(tokenLayanan),
      body: { name: 'Test', email: 't@t.com' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(403);
    });
  });

  it('tim_layanan DELETE /companies/1 → 403', () => {
    cy.request({
      method: 'DELETE', url: `${BASE}/companies/1`,
      headers: auth(tokenLayanan), failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(403);
    });
  });

  it('ro DELETE /companies/1 → 403', () => {
    cy.request({
      method: 'DELETE', url: `${BASE}/companies/1`,
      headers: auth(tokenRo), failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(403);
    });
  });

  it('tim_layanan POST /invoices → 403', () => {
    cy.request({
      method: 'POST', url: `${BASE}/invoices`,
      headers: auth(tokenLayanan),
      body: { companyId: 1, invoiceDate: '2025-01-01', dueDate: '2025-02-01', amount: 1000000 },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(403);
    });
  });

  it('tim_layanan POST /users → 403', () => {
    cy.request({
      method: 'POST', url: `${BASE}/users`,
      headers: auth(tokenLayanan),
      body: { name: 'Test', email: 't@t.com', password: 'Test@12345', roles: ['ro'] },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(403);
    });
  });
});

// =============================================================================
// BLOK 7 — GET LIST UTAMA (200 + envelope)
// =============================================================================
describe('[7] GET List Utama — 200 & Envelope', () => {
  const listEndpoints = [
    '/companies', '/users', '/sectors', '/targets', '/commitments',
    '/invoices', '/receipts', '/transactions', '/taat-zakat', '/bsz-claims',
    '/notifications', '/notifications/unread-count', '/audit-logs',
    '/finance-numbering/list', '/dashboard/zakat-stats', '/dashboard/anniversaries',
    '/targets/realization',
  ];

  listEndpoints.forEach((ep) => {
    it(`GET ${ep} → 200`, () => {
      cy.request({ method: 'GET', url: `${BASE}${ep}`, headers: auth(tokenAdmin) }).then((res) => {
        expect(res.status).to.eq(200);
        assertEnvelope(res.body, true);
      });
    });
  });

  it('GET /companies tidak ada → 404', () => {
    cy.request({
      method: 'GET', url: `${BASE}/companies/99999999`,
      headers: auth(tokenAdmin), failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.oneOf([404, 400]);
    });
  });

  it('GET /route-tidak-ada → 404', () => {
    cy.request({
      method: 'GET', url: `${BASE}/tidak-ada-route-xyz`,
      headers: auth(tokenAdmin), failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(404);
    });
  });
});

// =============================================================================
// BLOK 8 — CRUD SECTOR
// =============================================================================
describe('[8] CRUD — Sector', () => {
  it('POST /sectors → 201 dan simpan sectorId', () => {
    cy.request({
      method: 'POST', url: `${BASE}/sectors`,
      headers: auth(tokenAdmin),
      body: { name: `Sektor Cypress ${Date.now()}`, description: 'Test dari Cypress' },
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      assertEnvelope(res.body, true);
      sectorId = res.body.data.id ?? res.body.data?.sector?.id ?? 0;
    });
  });

  it('GET /sectors → 200', () => {
    cy.request({ method: 'GET', url: `${BASE}/sectors`, headers: auth(tokenAdmin) }).then((res) => {
      expect(res.status).to.eq(200);
    });
  });

  it('PUT /sectors/:id → 200', () => {
    cy.wrap(null).then(() => {
      if (!sectorId) return;
      cy.request({
        method: 'PUT', url: `${BASE}/sectors/${sectorId}`,
        headers: auth(tokenAdmin),
        body: { name: `Sektor Cypress Updated ${Date.now()}`, description: 'Updated' },
      }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });
});

// =============================================================================
// BLOK 9 — CRUD COMPANY
// =============================================================================
describe('[9] CRUD — Company', () => {
  it('POST /companies → 201 dan simpan companyId', () => {
    cy.request({
      method: 'POST', url: `${BASE}/companies`,
      headers: auth(tokenAdmin),
      body: {
        code:          `CYP${Date.now()}`,
        name:          'PT Cypress Testing',
        companyType:   'pt',
        npwp:          '12.345.678.9-012.345',
        npwz:          `Z${Date.now()}`,
        address:       'Jl. Cypress No. 1',
        city:          'Jakarta',
        province:      'DKI Jakarta',
        postalCode:    '10000',
        phone:         '021-99999999',
        email:         `cypress${Date.now()}@test.com`,
        leaderName:    'Direktur Test',
        picName:       'PIC Test',
        picPosition:   'Finance Manager',
        picPhone:      '08119999999',
        picEmail:      `pic${Date.now()}@test.com`,
        sector:        sectorId || 1,
        employeeCount: 50,
        roId:          null,
        notes:         'Dibuat oleh Cypress test',
      },
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201]);
      assertEnvelope(res.body, true);
      companyId = res.body.data.id ?? res.body.data?.company?.id ?? 0;
    });
  });

  it('GET /companies/:id → 200', () => {
    cy.wrap(null).then(() => {
      if (!companyId) return;
      cy.request({ method: 'GET', url: `${BASE}/companies/${companyId}`, headers: auth(tokenAdmin) }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.data).to.have.property('name');
      });
    });
  });

  it('PATCH /companies/:id/status → 200', () => {
    cy.wrap(null).then(() => {
      if (!companyId) return;
      cy.request({
        method: 'PATCH', url: `${BASE}/companies/${companyId}/status`,
        headers: auth(tokenAdmin),
        body: { status: 'existing' },
      }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });

  it('GET /companies/search?keyword=Cypress → 200', () => {
    cy.request({
      method: 'GET', url: `${BASE}/companies/search?keyword=Cypress`,
      headers: auth(tokenAdmin),
    }).then((res) => {
      expect(res.status).to.eq(200);
    });
  });
});

// =============================================================================
// BLOK 10 — CRUD COMMITMENT
// =============================================================================
describe('[10] CRUD — Commitment', () => {
  it('POST /commitments → 201 dan simpan commitmentId', () => {
    cy.wrap(null).then(() => {
      if (!companyId) return;
      cy.request({
        method: 'POST', url: `${BASE}/commitments`,
        headers: auth(tokenAdmin),
        body: {
          companyId,
          commitmentDate: '2025-01-01',
          validUntil:     '2025-12-31',
          totalAmount:    10000000,
          programs:       [{ programId: 1, amount: 10000000 }],
          notes:          'Commitment dari Cypress',
        },
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        assertEnvelope(res.body, true);
        commitmentId = res.body.data.id ?? res.body.data?.commitment?.id ?? 0;
      });
    });
  });

  it('GET /commitments/:id → 200', () => {
    cy.wrap(null).then(() => {
      if (!commitmentId) return;
      cy.request({ method: 'GET', url: `${BASE}/commitments/${commitmentId}`, headers: auth(tokenAdmin) }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });

  it('POST /commitments body kosong → 400/422', () => {
    cy.request({
      method: 'POST', url: `${BASE}/commitments`,
      headers: auth(tokenAdmin),
      body: {}, failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.oneOf([400, 422]);
    });
  });
});

// =============================================================================
// BLOK 11 — CRUD INVOICE
// =============================================================================
describe('[11] CRUD — Invoice', () => {
  it('POST /invoices → 201 dan simpan invoiceId', () => {
    cy.wrap(null).then(() => {
      if (!companyId) return;
      cy.request({
        method: 'POST', url: `${BASE}/invoices`,
        headers: auth(tokenAdmin),
        body: {
          commitmentId:     commitmentId || null,
          companyId,
          invoiceDate:      '2025-01-15',
          dueDate:          '2025-02-15',
          amount:           10000000,
          taxAmount:        0,
          hasStampDuty:     0,
          stampDutyAmount:  0,
          notes:            'Invoice dari Cypress',
        },
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        assertEnvelope(res.body, true);
        invoiceId = res.body.data.id ?? res.body.data?.invoice?.id ?? 0;
      });
    });
  });

  it('GET /invoices/:id → 200', () => {
    cy.wrap(null).then(() => {
      if (!invoiceId) return;
      cy.request({ method: 'GET', url: `${BASE}/invoices/${invoiceId}`, headers: auth(tokenAdmin) }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.data).to.have.property('id');
      });
    });
  });

  it('PATCH /invoices/:id/sign → 200', () => {
    cy.wrap(null).then(() => {
      if (!invoiceId) return;
      cy.request({
        method: 'PATCH', url: `${BASE}/invoices/${invoiceId}/sign`,
        headers: auth(tokenAdmin),
        body: { isSigned: 1, signedBy: 'Admin Cypress' },
      }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });

  it('POST /invoices body kosong → 400/422', () => {
    cy.request({
      method: 'POST', url: `${BASE}/invoices`,
      headers: auth(tokenAdmin),
      body: {}, failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.oneOf([400, 422]);
    });
  });
});

// =============================================================================
// BLOK 12 — CRUD RECEIPT
// =============================================================================
describe('[12] CRUD — Receipt', () => {
  it('POST /receipts → 201 dan simpan receiptId', () => {
    cy.wrap(null).then(() => {
      if (!companyId) return;
      cy.request({
        method: 'POST', url: `${BASE}/receipts`,
        headers: auth(tokenAdmin),
        body: {
          invoiceId:     invoiceId || null,
          companyId,
          receiptDate:   '2025-01-20',
          amount:        10000000,
          paymentMethod: 'transfer',
          bankName:      'Bank BSI',
          accountNumber: '712.277.7700',
          notes:         'Receipt dari Cypress',
        },
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        assertEnvelope(res.body, true);
        receiptId = res.body.data.id ?? res.body.data?.receipt?.id ?? 0;
      });
    });
  });

  it('GET /receipts/:id → 200', () => {
    cy.wrap(null).then(() => {
      if (!receiptId) return;
      cy.request({ method: 'GET', url: `${BASE}/receipts/${receiptId}`, headers: auth(tokenAdmin) }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });

  it('PATCH /receipts/:id/sign → 200', () => {
    cy.wrap(null).then(() => {
      if (!receiptId) return;
      cy.request({
        method: 'PATCH', url: `${BASE}/receipts/${receiptId}/sign`,
        headers: auth(tokenAdmin),
        body: { isSigned: 1, signedBy: 'Admin Cypress' },
      }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });

  it('POST /receipts body kosong → 400/422', () => {
    cy.request({
      method: 'POST', url: `${BASE}/receipts`,
      headers: auth(tokenAdmin),
      body: {}, failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.oneOf([400, 422]);
    });
  });
});

// =============================================================================
// BLOK 13 — CRUD TRANSACTION
// =============================================================================
describe('[13] CRUD — Transaction', () => {
  it('POST /transactions → 201 dan simpan transactionId', () => {
    cy.wrap(null).then(() => {
      if (!companyId) return;
      cy.request({
        method: 'POST', url: `${BASE}/transactions`,
        headers: auth(tokenAdmin),
        body: {
          receiptId:       receiptId || null,
          companyId,
          transactionDate: '2025-01-20',
          amount:          10000000,
          zakatType:       'zakat_mal',
          jenisDana:       'Zakat Perusahaan',
          npwzNumber:      `NPWZ${Date.now()}`,
          notes:           'Transaksi dari Cypress',
        },
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        assertEnvelope(res.body, true);
        transactionId = res.body.data.id ?? res.body.data?.transaction?.id ?? 0;
      });
    });
  });

  it('GET /transactions/:id → 200', () => {
    cy.wrap(null).then(() => {
      if (!transactionId) return;
      cy.request({ method: 'GET', url: `${BASE}/transactions/${transactionId}`, headers: auth(tokenAdmin) }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });

  it('GET /transactions/by-company/:companyId → 200', () => {
    cy.wrap(null).then(() => {
      if (!companyId) return;
      cy.request({ method: 'GET', url: `${BASE}/transactions/by-company/${companyId}`, headers: auth(tokenAdmin) }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });
});

// =============================================================================
// BLOK 14 — TAAT ZAKAT CERTIFICATE
// =============================================================================
describe('[14] Taat Zakat Certificate', () => {
  it('POST /taat-zakat/issue → 201 dan simpan certId', () => {
    cy.wrap(null).then(() => {
      if (!companyId || !receiptId) return;
      cy.request({
        method: 'POST', url: `${BASE}/taat-zakat/issue`,
        headers: auth(tokenAdmin),
        body: {
          companyId,
          receiptId,
          issuedAt:   '2025-01-21',
          validFrom:  '2025-01-21',
          validUntil: '2025-12-31',
          notes:      'Sertifikat dari Cypress',
        },
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 201]);
        certId = res.body.data.id ?? res.body.data?.certificate?.id ?? 0;
      });
    });
  });

  it('GET /taat-zakat/detail/:id → 200', () => {
    cy.wrap(null).then(() => {
      if (!certId) return;
      cy.request({ method: 'GET', url: `${BASE}/taat-zakat/detail/${certId}`, headers: auth(tokenAdmin) }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });

  it('GET /taat-zakat → 200', () => {
    cy.request({ method: 'GET', url: `${BASE}/taat-zakat`, headers: auth(tokenAdmin) }).then((res) => {
      expect(res.status).to.eq(200);
    });
  });
});

// =============================================================================
// BLOK 15 — NOTIFIKASI & AUDIT LOG
// =============================================================================
describe('[15] Notifikasi & Audit Log', () => {
  it('GET /notifications → 200', () => {
    cy.request({ method: 'GET', url: `${BASE}/notifications`, headers: auth(tokenAdmin) }).then((res) => {
      expect(res.status).to.eq(200);
    });
  });

  it('GET /notifications/unread-count → 200', () => {
    cy.request({ method: 'GET', url: `${BASE}/notifications/unread-count`, headers: auth(tokenAdmin) }).then((res) => {
      expect(res.status).to.eq(200);
    });
  });

  it('PATCH /notifications/read-all → 200', () => {
    cy.request({ method: 'PATCH', url: `${BASE}/notifications/read-all`, headers: auth(tokenAdmin) }).then((res) => {
      expect(res.status).to.eq(200);
    });
  });

  it('GET /audit-logs → 200', () => {
    cy.request({ method: 'GET', url: `${BASE}/audit-logs`, headers: auth(tokenAdmin) }).then((res) => {
      expect(res.status).to.eq(200);
    });
  });
});

// =============================================================================
// BLOK 16 — REFRESH TOKEN & LOGOUT
// =============================================================================
describe('[16] Auth — Refresh Token & Logout', () => {
  let refreshToken = '';

  it('POST /auth/login ulang → dapat refresh_token', () => {
    cy.request({ method: 'POST', url: `${BASE}/auth/login`, body: CREDS.admin }).then((res) => {
      expect(res.status).to.eq(200);
      refreshToken = res.body.data.refresh_token;
      tokenAdmin   = res.body.data.access_token;
    });
  });

  it('POST /auth/refresh-token → 200 dan dapat token baru', () => {
    cy.wrap(null).then(() => {
      if (!refreshToken) return;
      cy.request({
        method: 'POST', url: `${BASE}/auth/refresh-token`,
        body: { refresh_token: refreshToken },
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.data).to.have.property('access_token').and.not.be.empty;
      });
    });
  });

  it('POST /auth/logout → 200', () => {
    cy.wrap(null).then(() => {
      if (!tokenAdmin) return;
      cy.request({
        method: 'POST', url: `${BASE}/auth/logout`,
        headers: auth(tokenAdmin),
      }).then((res) => {
        expect(res.status).to.eq(200);
      });
    });
  });
});
