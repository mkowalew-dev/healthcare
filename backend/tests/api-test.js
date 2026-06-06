'use strict';

// CareConnect API authentication test
// Flow: unauthenticated request (expect 401) → login → GET / POST / PATCH with token
//
// Usage:
//   node tests/api-test.js
//   API_URL=http://your-host:3001 node tests/api-test.js

const BASE = process.env.API_URL || 'http://localhost:3001';

const C = {
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
  reset:  '\x1b[0m',
};

// Known seed IDs (populated by npm run seed)
const PATIENT_ID  = '66666666-0000-0000-0000-000000000001'; // John Smith
const PROVIDER_ID = '33333333-0000-0000-0000-000000000001'; // Dr. Michael Chen

let passed = 0;
let failed = 0;

async function req(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function ok(label) {
  console.log(`  ${C.green}✓${C.reset} ${label}`);
  passed++;
}

function fail(label, detail = '') {
  console.log(`  ${C.red}✗${C.reset} ${label}${detail ? ` — ${C.red}${detail}${C.reset}` : ''}`);
  failed++;
}

function section(title) {
  console.log(`\n${C.bold}${title}${C.reset}`);
}

async function run() {
  console.log(`\n${C.bold}${C.cyan}━━━  CareConnect API Authentication Tests  ━━━${C.reset}`);
  console.log(`${C.cyan}Target: ${BASE}${C.reset}`);

  // ── 1. Unauthenticated requests must be rejected ──────────────────────────
  section('1. Unauthenticated access → must return 401');

  for (const [method, path, body] of [
    ['GET',   '/api/patients'],
    ['GET',   '/api/appointments'],
    ['POST',  '/api/appointments', { patientId: PATIENT_ID, providerId: PROVIDER_ID }],
    ['PATCH', `/api/appointments/00000000-0000-0000-0000-000000000001/status`, { status: 'confirmed' }],
  ]) {
    const { status } = await req(method, path, { body });
    status === 401
      ? ok(`${method} ${path} → 401 Unauthorized`)
      : fail(`${method} ${path}`, `expected 401, got ${status}`);
  }

  // ── 2. Login ──────────────────────────────────────────────────────────────
  section('2. POST /api/auth/login');

  const { status: loginStatus, data: loginData } = await req('POST', '/api/auth/login', {
    body: { email: 'provider@careconnect.demo', password: 'Demo123!' },
  });

  let token;
  if (loginStatus === 200 && loginData?.token) {
    token = loginData.token;
    ok(`Login as provider@careconnect.demo → 200 OK  (role: ${loginData.user?.role})`);
  } else {
    fail('Login', `expected 200 with token, got ${loginStatus}`);
    console.log(`\n${C.red}Cannot continue without a token.${C.reset}\n`);
    process.exit(1);
  }

  // ── 3. GET with token ─────────────────────────────────────────────────────
  section('3. GET requests (authenticated)');

  {
    const { status, data } = await req('GET', '/api/patients', { token });
    status === 200 && Array.isArray(data)
      ? ok(`GET /api/patients → 200 OK  (${data.length} patients)`)
      : fail('GET /api/patients', `expected 200 array, got ${status}`);
  }

  {
    const { status, data } = await req('GET', `/api/patients/${PATIENT_ID}`, { token });
    status === 200 && data?.id
      ? ok(`GET /api/patients/:id → 200 OK  (${data.first_name} ${data.last_name})`)
      : fail('GET /api/patients/:id', `expected 200, got ${status}`);
  }

  {
    const { status, data } = await req('GET', '/api/appointments', { token });
    status === 200 && Array.isArray(data)
      ? ok(`GET /api/appointments → 200 OK  (${data.length} appointments)`)
      : fail('GET /api/appointments', `expected 200 array, got ${status}`);
  }

  {
    const { status, data } = await req('GET', '/api/vitals', { token });
    status === 200 && Array.isArray(data)
      ? ok(`GET /api/vitals → 200 OK  (${data.length} records)`)
      : fail('GET /api/vitals', `expected 200 array, got ${status}`);
  }

  // ── 4. POST with token ────────────────────────────────────────────────────
  section('4. POST request (authenticated)');

  let newAppointmentId;
  {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const { status, data } = await req('POST', '/api/appointments', {
      token,
      body: {
        patientId:       PATIENT_ID,
        providerId:      PROVIDER_ID,
        scheduledAt:     tomorrow,
        type:            'office_visit',
        chiefComplaint:  'API test appointment',
        durationMinutes: 30,
      },
    });
    if (status === 201 && data?.id) {
      newAppointmentId = data.id;
      ok(`POST /api/appointments → 201 Created  (id: ${data.id})`);
    } else {
      fail('POST /api/appointments', `expected 201, got ${status}: ${JSON.stringify(data)}`);
    }
  }

  // ── 5. PATCH with token ───────────────────────────────────────────────────
  section('5. PATCH request (authenticated)');

  if (newAppointmentId) {
    const { status, data } = await req('PATCH', `/api/appointments/${newAppointmentId}/status`, {
      token,
      body: { status: 'confirmed' },
    });
    status === 200 && data?.status === 'confirmed'
      ? ok(`PATCH /api/appointments/:id/status → 200 OK  (status: ${data.status})`)
      : fail('PATCH /api/appointments/:id/status', `expected 200 confirmed, got ${status}: ${JSON.stringify(data)}`);
  } else {
    fail('PATCH /api/appointments/:id/status', 'skipped — no appointment created in step 4');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  const colour = failed === 0 ? C.green : C.red;
  console.log(`\n${C.bold}Results: ${C.green}${passed}/${total} passed${C.reset}${failed > 0 ? `, ${C.red}${failed} failed${C.reset}` : ''}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(`\n${C.red}Fatal:${C.reset}`, err.message);
  process.exit(1);
});
