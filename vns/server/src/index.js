'use strict';

require('dotenv').config();
const { getTraceContext } = require('./tracing');
const { generateLoginHtml, generatePortalHtml } = require('./portal');

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const http    = require('http');

const PORT          = parseInt(process.env.VNS_PORT  || '3031', 10);
const SCFP_HOST     = process.env.SCFP_HOST          || 'localhost';
const SCFP_PORT     = process.env.SCFP_PORT          || '3030';
const CPM_HOST      = process.env.CPM_HOST           || 'localhost';
const CPM_PORT      = process.env.CPM_PORT           || '3032';
const API_HOST      = process.env.API_HOST           || '';
const API_PORT      = process.env.API_PORT           || '3001';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN      || '';
const LOG_DIR       = process.env.LOG_DIR            || '/var/log/careconnect';

// ── Logger ───────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'careconnect-vns' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: `${LOG_DIR}/vns-out.log`, handleExceptions: true }),
  ],
});

// ── Portal auth ──────────────────────────────────────────────
const DEMO_USERS = {
  'nurse@careconnect.demo':  { password: 'Demo123!', name: 'RN Sarah Chen',       role: 'Nurse'         },
  'doctor@careconnect.demo': { password: 'Demo123!', name: 'Dr. Marcus Williams',  role: 'Physician'     },
  'admin@careconnect.demo':  { password: 'Demo123!', name: 'Facility Admin',       role: 'Administrator' },
};

const portalSessions = new Map(); // token → { name, role, email, loginAt }

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      cookies[decodeURIComponent(part.slice(0, idx).trim())] =
        decodeURIComponent(part.slice(idx + 1).trim());
    }
  });
  return cookies;
}

function requireAuth(req, res, next) {
  const token = parseCookies(req).sc_session;
  const session = token && portalSessions.get(token);
  if (!session) {
    if (req.path.startsWith('/proxy/')) return res.status(401).json({ error: 'Not authenticated' });
    return res.redirect('/login');
  }
  req.user = session;
  next();
}

// Clean stale portal sessions every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 8 * 60 * 60 * 1000;
  for (const [token, s] of portalSessions) {
    if (new Date(s.loginAt).getTime() < cutoff) portalSessions.delete(token);
  }
}, 30 * 60 * 1000);

// ── In-memory state ──────────────────────────────────────────
const NURSE_NAMES = [
  'RN Sarah Chen', 'RN Marcus Williams', 'RN Aisha Patel',
  'RN David Okonkwo', 'RN Ingrid Larsen', 'RN James Mbeki',
];
const PATIENT_NAMES = [
  'Margaret Okonkwo', 'Robert Thornton', 'Yuki Tanaka', 'Carlos Mendes',
  'Edith Vasquez', 'Harold Nguyen', 'Beatrice Osei', 'James Callahan',
];

// Session types map clinical workflows to appropriate virtual care modalities
const SESSION_TYPES = ['nursing_consult', 'virtual_sitter', 'care_team_conference', 'provider_rounding'];
const SESSION_REASONS = {
  nursing_consult:        ['Fall prevention rounding', 'Post-procedure pain assessment', 'Medication reconciliation', 'Wound assessment', 'Confusion evaluation'],
  virtual_sitter:         ['Continuous fall watch', 'Elopement/wander risk monitoring', 'Post-sedation observation', 'Agitation monitoring'],
  care_team_conference:   ['Discharge planning', 'Goals of care discussion', 'Complex case review', 'Family meeting'],
  provider_rounding:      ['Attending physician rounds', 'Specialist consult review', 'Critical care review', 'Palliative care rounding'],
};

let sessions = _initSessions();
let assessments = [];
let escalations = [];

function _initSessions() {
  const statuses = ['active', 'active', 'active', 'hold', 'connecting', 'completed'];
  return Array.from({ length: 6 }, (_, i) => {
    const type = SESSION_TYPES[i % SESSION_TYPES.length];
    const reasons = SESSION_REASONS[type];
    return {
      id: uuidv4(),
      type,
      nurse: NURSE_NAMES[i % NURSE_NAMES.length],
      patient_name: PATIENT_NAMES[i % PATIENT_NAMES.length],
      patient_id: `PT-${10000 + i}`,
      room_number: String(301 + i * 3),
      unit: i < 3 ? '3-North' : '4-South',
      reason: reasons[i % reasons.length],
      status: statuses[i % statuses.length],
      started_at: new Date(Date.now() - (i + 1) * 480000).toISOString(),
      duration_seconds: (i + 1) * 480,
      video_quality: ['HD', 'HD', 'SD', 'HD', 'connecting', 'N/A'][i % 6],
      escalated: i === 0,
    };
  });
}

// Refresh completed sessions every 3 minutes
setInterval(() => {
  sessions = sessions.map(s => {
    if (s.status === 'completed') {
      const type = SESSION_TYPES[Math.floor(Math.random() * SESSION_TYPES.length)];
      const reasons = SESSION_REASONS[type];
      return {
        ...s,
        id: uuidv4(),
        type,
        patient_name: PATIENT_NAMES[Math.floor(Math.random() * PATIENT_NAMES.length)],
        patient_id: `PT-${10000 + Math.floor(Math.random() * 20)}`,
        room_number: String(300 + Math.floor(Math.random() * 24) + 1),
        reason: reasons[Math.floor(Math.random() * reasons.length)],
        status: 'connecting',
        started_at: new Date().toISOString(),
        duration_seconds: 0,
        escalated: false,
        video_quality: 'connecting',
      };
    }
    if (s.status === 'connecting') return { ...s, status: 'active', video_quality: 'HD' };
    s.duration_seconds += 180;
    return s;
  });
}, 180000);

// ── Helpers ──────────────────────────────────────────────────
function fetchJSON(host, port, path) {
  const headers = SERVICE_TOKEN ? { Authorization: `Bearer ${SERVICE_TOKEN}` } : {};
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port: parseInt(port, 10), path, headers, timeout: 5000 }, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Derive the EHR MRN from an ambient patient ID (PT-10000 → MRN000001).
function ptIdToMrn(ptId) {
  const idx = parseInt(ptId.replace('PT-', ''), 10) - 10000;
  return `MRN${String(idx + 1).padStart(6, '0')}`;
}

// Post a clinical note to the CareConnect API gateway → patients-service.
// No-ops if API_HOST / SERVICE_TOKEN is unset (graceful degradation).
function postEHRNote(patientId, note) {
  if (!API_HOST) return Promise.resolve(null);
  const mrn = ptIdToMrn(patientId);
  const payload = JSON.stringify({ mrn, ...note });
  return new Promise(resolve => {
    const req = http.request(
      {
        host: API_HOST,
        port: parseInt(API_PORT, 10),
        path: '/api/notes/service',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-service-token': SERVICE_TOKEN,
        },
        timeout: 5000,
      },
      res => {
        res.resume();
        if (res.statusCode === 201) {
          logger.info('ehr_note_posted', { patient_id: patientId, mrn, status: res.statusCode, ...getTraceContext() });
        } else {
          logger.warn('ehr_note_rejected', { patient_id: patientId, mrn, status: res.statusCode, ...getTraceContext() });
        }
        resolve(res.statusCode);
      }
    );
    req.on('error', err => {
      logger.warn('ehr_note_failed', { patient_id: patientId, mrn, error: err.message, ...getTraceContext() });
      resolve(null);
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

// ── Express app ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      ...getTraceContext(),
    });
  });
  next();
});

// ── Health / probe (unauthenticated — ThousandEyes probes) ───
app.get('/ping', (_req, res) => res.send('pong'));

app.get('/health', (_req, res) => {
  const active = sessions.filter(s => s.status === 'active').length;
  res.json({
    status: 'ok',
    active_sessions: active,
    total_sessions: sessions.length,
    assessments_today: assessments.length,
    escalations_active: escalations.filter(e => e.status === 'dispatched').length,
    uptime_seconds: Math.floor(process.uptime()),
    scfp_endpoint: `http://${SCFP_HOST}:${SCFP_PORT}`,
    cpm_endpoint: `http://${CPM_HOST}:${CPM_PORT}`,
    ehr_integration: API_HOST ? `http://${API_HOST}:${API_PORT}` : 'disabled',
    ehr_auth: API_HOST ? (SERVICE_TOKEN ? 'token_configured' : 'NO_TOKEN_SET') : 'n/a',
  });
});

// ── Auth ─────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  const token = parseCookies(req).sc_session;
  if (token && portalSessions.has(token)) return res.redirect('/');
  res.setHeader('Content-Type', 'text/html');
  res.send(generateLoginHtml(req.query.error === '1'));
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = DEMO_USERS[(email || '').toLowerCase().trim()];
  if (!user || user.password !== password) {
    logger.warn('portal_login_failed', { email, ...getTraceContext() });
    return res.redirect('/login?error=1');
  }
  const token = crypto.randomBytes(24).toString('hex');
  portalSessions.set(token, { name: user.name, role: user.role, email, loginAt: new Date().toISOString() });
  logger.info('portal_login', { email, role: user.role, ...getTraceContext() });
  res.setHeader('Set-Cookie', `sc_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
  res.redirect('/');
});

app.post('/auth/logout', (req, res) => {
  const token = parseCookies(req).sc_session;
  if (token) {
    const s = portalSessions.get(token);
    if (s) logger.info('portal_logout', { email: s.email, ...getTraceContext() });
    portalSessions.delete(token);
  }
  res.setHeader('Set-Cookie', 'sc_session=; Path=/; HttpOnly; Max-Age=0');
  res.redirect('/login');
});

// ── Smart Care Portal (requires login) ───────────────────────
app.get('/', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(generatePortalHtml(req.user));
});

// ── Proxy: SCFP (VM6) and CPM (VM8) — single origin for browser
app.get('/proxy/scfp/*', requireAuth, async (req, res) => {
  const upstream = req.url.replace('/proxy/scfp', '');
  try {
    res.json(await fetchJSON(SCFP_HOST, SCFP_PORT, upstream));
  } catch (err) {
    res.status(502).json({ error: 'SCFP unavailable', detail: err.message });
  }
});

app.get('/proxy/cpm/*', requireAuth, async (req, res) => {
  const upstream = req.url.replace('/proxy/cpm', '');
  try {
    res.json(await fetchJSON(CPM_HOST, CPM_PORT, upstream));
  } catch (err) {
    res.status(502).json({ error: 'CPM unavailable', detail: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────
app.get('/api/sessions', (req, res) => {
  let result = [...sessions];
  if (req.query.status) result = result.filter(s => s.status === req.query.status);
  if (req.query.type)   result = result.filter(s => s.type   === req.query.type);
  res.json({ sessions: result, count: result.length });
});

app.get('/api/sessions/:id', (req, res) => {
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// ── Assessments ──────────────────────────────────────────────
app.post('/api/sessions/:id/assess', async (req, res) => {
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const assessment = {
    id: uuidv4(),
    session_id: req.params.id,
    patient_id: session.patient_id,
    patient_name: session.patient_name,
    nurse: session.nurse,
    room_number: session.room_number,
    timestamp: new Date().toISOString(),
    pain_score: req.body.pain_score ?? null,
    orientation: req.body.orientation ?? null,
    mobility: req.body.mobility ?? null,
    skin_integrity: req.body.skin_integrity ?? null,
    fall_risk_reassessment: req.body.fall_risk_reassessment ?? null,
    notes: req.body.notes ?? '',
    escalation_required: req.body.escalation_required ?? false,
    ehr_documented: false,
  };

  assessments.push(assessment);
  if (assessments.length > 200) assessments.shift();

  if (assessment.escalation_required) {
    logger.warn('assessment_escalation', {
      session_id: req.params.id,
      patient_id: session.patient_id,
      room_number: session.room_number,
      ...getTraceContext(),
    });
    session.escalated = true;
  }

  // Post note to EHR when requested — creates APM trace edge to CareConnect API
  if (req.body.ehr_document === true) {
    const statusCode = await postEHRNote(session.patient_id, {
      noteType: 'virtual_nursing',
      author: session.nurse,
      sessionId: assessment.id,
      sessionType: session.type,
      content: {
        pain_score: assessment.pain_score,
        orientation: assessment.orientation,
        mobility: assessment.mobility,
        skin_integrity: assessment.skin_integrity,
        fall_risk_reassessment: assessment.fall_risk_reassessment,
        notes: assessment.notes,
        escalation_required: assessment.escalation_required,
      },
    });
    assessment.ehr_documented = statusCode === 201;
  }

  logger.info('assessment_submitted', {
    session_id: req.params.id,
    patient_id: session.patient_id,
    room_number: session.room_number,
    ehr_documented: assessment.ehr_documented,
    ...getTraceContext(),
  });

  res.status(201).json({ success: true, assessment });
});

app.get('/api/assessments', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  res.json({ assessments: assessments.slice(-limit).reverse(), count: assessments.length });
});

// ── Escalations ───────────────────────────────────────────────
app.post('/api/sessions/:id/escalate', (req, res) => {
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { reason, responder_type = 'bedside_nurse', priority = 'urgent' } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason required' });

  const escalation = {
    id: uuidv4(),
    session_id: req.params.id,
    patient_id: session.patient_id,
    patient_name: session.patient_name,
    room_number: session.room_number,
    unit: session.unit,
    initiated_by: session.nurse,
    reason,
    responder_type,
    priority,
    dispatched_at: new Date().toISOString(),
    status: 'dispatched',
  };

  escalations.push(escalation);
  if (escalations.length > 100) escalations.shift();
  session.escalated = true;

  logger.warn('escalation_dispatched', {
    escalation_id: escalation.id,
    patient_id: session.patient_id,
    room_number: session.room_number,
    responder_type,
    priority,
    ...getTraceContext(),
  });

  res.status(201).json(escalation);
});

app.get('/api/escalations', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  res.json({ escalations: escalations.slice(-limit).reverse(), count: escalations.length });
});

// ── Aggregated alerts (pulled from SCFP + CPM) ───────────────
app.get('/api/alerts', async (req, res) => {
  const results = { scfp: [], cpm: [], errors: [] };

  try {
    const data = await fetchJSON(SCFP_HOST, SCFP_PORT, '/api/alerts?acknowledged=false&limit=20');
    results.scfp = (data.alerts || []).map(a => ({ ...a, source: 'scfp' }));
  } catch (err) {
    results.errors.push({ source: 'scfp', error: err.message });
    logger.warn('scfp_fetch_failed', { error: err.message, ...getTraceContext() });
  }

  try {
    const data = await fetchJSON(CPM_HOST, CPM_PORT, '/api/alerts?limit=20');
    results.cpm = (data.alerts || []).map(a => ({ ...a, source: 'cpm' }));
  } catch (err) {
    results.errors.push({ source: 'cpm', error: err.message });
    logger.warn('cpm_fetch_failed', { error: err.message, ...getTraceContext() });
  }

  const allAlerts = [...results.scfp, ...results.cpm].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  res.json({ alerts: allAlerts, count: allAlerts.length, sources: results.errors });
});

// ── Command Center — aggregate view across all three services ─
app.get('/api/command-center', async (_req, res) => {
  const out = {
    generated_at: new Date().toISOString(),
    shift: _currentShift(),
    scfp: null,
    cpm: null,
    vns: {
      active_sessions: sessions.filter(s => s.status === 'active').length,
      sessions_by_type: SESSION_TYPES.reduce((acc, t) => {
        acc[t] = sessions.filter(s => s.type === t).length;
        return acc;
      }, {}),
      escalations_active: escalations.filter(e => e.status === 'dispatched').length,
      assessments_today: assessments.length,
    },
    combined: {},
    errors: [],
  };

  try {
    out.scfp = await fetchJSON(SCFP_HOST, SCFP_PORT, '/api/stats');
  } catch (err) {
    out.errors.push({ source: 'scfp', error: err.message });
    logger.warn('command_center_scfp_fail', { error: err.message, ...getTraceContext() });
  }

  try {
    out.cpm = await fetchJSON(CPM_HOST, CPM_PORT, '/api/stats');
  } catch (err) {
    out.errors.push({ source: 'cpm', error: err.message });
    logger.warn('command_center_cpm_fail', { error: err.message, ...getTraceContext() });
  }

  out.combined = {
    total_monitored_rooms: out.scfp?.total_rooms ?? null,
    occupied_rooms: out.scfp?.occupied_rooms ?? null,
    virtual_sitters_active: out.scfp?.virtual_sitters_active ?? null,
    sitter_coverage_pct: out.scfp?.sitter_coverage_pct ?? null,
    high_fall_risk_patients: out.scfp?.high_fall_risk_patients ?? null,
    monitored_patients: out.cpm?.monitored_patients ?? null,
    high_ews_patients: out.cpm?.high_risk_patients ?? null,
    adl_high_risk: out.cpm?.adl_high_risk ?? null,
    critical_alerts_facility: (out.scfp?.critical_alerts ?? 0) + (out.cpm?.critical_alerts ?? 0),
    active_nursing_sessions: out.vns.active_sessions,
    escalations_active: out.vns.escalations_active,
  };

  logger.info('command_center_requested', {
    combined_critical: out.combined.critical_alerts_facility,
    ...getTraceContext(),
  });

  res.json(out);
});

// ── Shift handover ───────────────────────────────────────────
app.get('/api/handover', async (_req, res) => {
  let scfpStats = null;
  let cpmStats  = null;

  try { scfpStats = await fetchJSON(SCFP_HOST, SCFP_PORT, '/api/stats'); } catch { /* best-effort */ }
  try { cpmStats  = await fetchJSON(CPM_HOST, CPM_PORT, '/api/stats'); }  catch { /* best-effort */ }

  res.json({
    generated_at: new Date().toISOString(),
    shift: _currentShift(),
    virtual_nursing_summary: {
      sessions_completed: assessments.length,
      active_sessions: sessions.filter(s => s.status === 'active').length,
      escalations: escalations.length,
      escalations_active: escalations.filter(e => e.status === 'dispatched').length,
    },
    facility_summary: scfpStats,
    patient_monitoring_summary: cpmStats,
    recent_assessments: assessments.slice(-5).reverse(),
    recent_escalations: escalations.slice(-3).reverse(),
  });
});

function _currentShift() {
  const h = new Date().getHours();
  if (h >= 7 && h < 15) return { name: 'Day',     start: '07:00', end: '15:00' };
  if (h >= 15 && h < 23) return { name: 'Evening', start: '15:00', end: '23:00' };
  return { name: 'Night', start: '23:00', end: '07:00' };
}

// ── Server ────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info('vns_started', {
    port: PORT,
    scfp_endpoint: `http://${SCFP_HOST}:${SCFP_PORT}`,
    cpm_endpoint:  `http://${CPM_HOST}:${CPM_PORT}`,
    ehr_integration: API_HOST ? `http://${API_HOST}:${API_PORT}` : 'disabled',
    ehr_auth: API_HOST ? (SERVICE_TOKEN ? 'token_configured' : 'NO_TOKEN_SET') : 'n/a',
  });
  console.log(`[vns] Smart Care Portal listening on :${PORT}`);
  console.log(`[vns] Portal:  http://localhost:${PORT}/`);
  console.log(`[vns] Login:   http://localhost:${PORT}/login`);
  console.log(`[vns] SCFP:    http://${SCFP_HOST}:${SCFP_PORT}  CPM: http://${CPM_HOST}:${CPM_PORT}`);
  if (API_HOST) console.log(`[vns] EHR:     http://${API_HOST}:${API_PORT}`);
  else          console.log('[vns] EHR:     disabled (set API_HOST to enable)');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
