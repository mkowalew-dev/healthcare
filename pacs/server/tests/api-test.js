'use strict';

// PACS API authentication test
// Flow: unauthenticated request (expect 401) → login → GET / POST with token
//
// Usage:
//   node tests/api-test.js
//   API_URL=http://your-host:3021 node tests/api-test.js

const BASE = process.env.API_URL || 'http://localhost:3021';

const C = {
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
  reset:  '\x1b[0m',
};

// Known seed study UIDs (always available — seeded on every startup)
const STUDY_UID = '2.25.100000000000000000001';

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
  console.log(`\n${C.bold}${C.cyan}━━━  PACS API Authentication Tests  ━━━${C.reset}`);
  console.log(`${C.cyan}Target: ${BASE}${C.reset}`);

  // ── 0. Health check (no auth required) ───────────────────────────────────
  section('0. Health check (no auth required)');

  {
    const { status, data } = await req('GET', '/health');
    status === 200 && data?.status === 'healthy'
      ? ok(`GET /health → 200 OK  (${data.studies?.total ?? 0} studies indexed)`)
      : fail('GET /health', `expected 200 healthy, got ${status}`);
  }

  // ── 1. Unauthenticated requests must be rejected ──────────────────────────
  section('1. Unauthenticated access → must return 401');

  for (const [method, path, body] of [
    ['GET',  '/api/worklist'],
    ['GET',  `/api/studies/${STUDY_UID}`],
    ['GET',  `/api/studies/${STUDY_UID}/series`],
    ['POST', '/api/demo/latency', { latencyMs: 0, jitterMs: 0 }],
  ]) {
    const { status } = await req(method, path, { body });
    status === 401
      ? ok(`${method} ${path} → 401 Unauthorized`)
      : fail(`${method} ${path}`, `expected 401, got ${status}`);
  }

  // ── 2. Login ──────────────────────────────────────────────────────────────
  section('2. POST /api/auth/login');

  const { status: loginStatus, data: loginData } = await req('POST', '/api/auth/login', {
    body: { email: 'dr.chen@careconnect.demo', password: 'Demo123!' },
  });

  let token;
  if (loginStatus === 200 && loginData?.token) {
    token = loginData.token;
    ok(`Login as dr.chen@careconnect.demo → 200 OK  (role: ${loginData.user?.role})`);
  } else {
    fail('Login', `expected 200 with token, got ${loginStatus}`);
    console.log(`\n${C.red}Cannot continue without a token.${C.reset}\n`);
    process.exit(1);
  }

  // ── 3. GET with token ─────────────────────────────────────────────────────
  section('3. GET requests (authenticated)');

  {
    const { status, data } = await req('GET', '/api/worklist', { token });
    status === 200 && Array.isArray(data?.studies)
      ? ok(`GET /api/worklist → 200 OK  (${data.studies.length} studies)`)
      : fail('GET /api/worklist', `expected 200 with studies array, got ${status}`);
  }

  {
    const { status, data } = await req('GET', `/api/studies/${STUDY_UID}`, { token });
    status === 200 && data?.studyInstanceUID
      ? ok(`GET /api/studies/:uid → 200 OK  (${data.patientName ?? 'unknown patient'})`)
      : fail('GET /api/studies/:uid', `expected 200, got ${status}`);
  }

  {
    const { status, data } = await req('GET', `/api/studies/${STUDY_UID}/series`, { token });
    status === 200 && Array.isArray(data?.series)
      ? ok(`GET /api/studies/:uid/series → 200 OK  (${data.series.length} series)`)
      : fail('GET /api/studies/:uid/series', `expected 200 with series array, got ${status}`);
  }

  // ── 4. POST with token ────────────────────────────────────────────────────
  section('4. POST request (authenticated)');

  {
    const { status, data } = await req('POST', '/api/demo/latency', {
      token,
      body: { latencyMs: 0, jitterMs: 0 },
    });
    status === 200 && data?.message
      ? ok(`POST /api/demo/latency → 200 OK  (latency control acknowledged)`)
      : fail('POST /api/demo/latency', `expected 200, got ${status}: ${JSON.stringify(data)}`);
  }

  // ── 5. Confirm token is required (wrong token → 401) ─────────────────────
  section('5. Invalid token → must return 401');

  {
    const { status } = await req('GET', '/api/worklist', { token: 'invalid.token.value' });
    status === 401
      ? ok('GET /api/worklist with invalid token → 401 Unauthorized')
      : fail('GET /api/worklist with invalid token', `expected 401, got ${status}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${C.bold}Results: ${C.green}${passed}/${total} passed${C.reset}${failed > 0 ? `, ${C.red}${failed} failed${C.reset}` : ''}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(`\n${C.red}Fatal:${C.reset}`, err.message);
  process.exit(1);
});
