'use strict';

require('dotenv').config();
const { getTraceContext } = require('./tracing');

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const { VitalSimulator } = require('./vital-sim');
const { ADLMonitor } = require('./adl-monitor');

const PORT = parseInt(process.env.CPM_PORT || '3032', 10);
const DEVICE_COUNT = parseInt(process.env.CPM_DEVICE_COUNT || '20', 10);
const VITAL_INTERVAL_MS = parseInt(process.env.CPM_VITAL_INTERVAL_MS || '15000', 10);
const LOG_DIR = process.env.LOG_DIR || '/var/log/careconnect';
const JWT_SECRET = process.env.JWT_SECRET || 'careconnect-demo-jwt-secret-2024';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || '';

// ── Logger ───────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'careconnect-cpm' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: `${LOG_DIR}/cpm-out.log`, handleExceptions: true }),
  ],
});

// ── Vital simulator + ADL monitor ────────────────────────────
const sim = new VitalSimulator(DEVICE_COUNT, VITAL_INTERVAL_MS);
sim.start();

const adl = new ADLMonitor(DEVICE_COUNT);
adl.start();

// ── Auth middleware ───────────────────────────────────────────
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.substring(7);
  if (SERVICE_TOKEN && token === SERVICE_TOKEN) {
    req.user = { role: 'service', id: 'vns' };
    return next();
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ── Express app ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

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

app.use('/api', authenticate);

// ── Health / probe ───────────────────────────────────────────
app.get('/ping', (_req, res) => res.send('pong'));

app.get('/health', (_req, res) => {
  const stats = sim.getStats();
  res.json({ status: 'ok', ...stats });
});

// ── Patients ─────────────────────────────────────────────────
app.get('/api/patients', (req, res) => {
  const patients = sim.getPatients({
    unit: req.query.unit,
    risk: req.query.risk,
    in_alert: req.query.in_alert !== undefined ? req.query.in_alert === 'true' : undefined,
  }).map(p => {
    const adlData = adl.getPatientADL(p.id);
    return {
      ...p,
      adl_risk: adlData?.adl_risk ?? null,
      adl_composite_score: adlData?.adl_composite_score ?? null,
    };
  });
  res.json({ patients, count: patients.length });
});

app.get('/api/patients/:id', (req, res) => {
  const patient = sim.getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const vitals = sim.getVitals(req.params.id, 12);
  const ews = sim.getEWS(req.params.id);
  res.json({ patient, recent_vitals: vitals, ews });
});

app.get('/api/patients/:id/vitals', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '12', 10), 24);
  const vitals = sim.getVitals(req.params.id, limit);
  if (!vitals) return res.status(404).json({ error: 'Patient not found' });
  res.json({ patient_id: req.params.id, vitals, count: vitals.length });
});

app.get('/api/patients/:id/ews', (req, res) => {
  const ews = sim.getEWS(req.params.id);
  if (!ews) return res.status(404).json({ error: 'Patient not found' });
  logger.info('ews_requested', { patient_id: req.params.id, score: ews.score, risk: ews.risk, ...getTraceContext() });
  res.json(ews);
});

app.get('/api/patients/:id/adl', (req, res) => {
  const adlData = adl.getPatientADL(req.params.id);
  if (!adlData) return res.status(404).json({ error: 'Patient not found' });
  logger.info('adl_requested', { patient_id: req.params.id, risk: adlData.adl_risk, composite: adlData.adl_composite_score, ...getTraceContext() });
  res.json(adlData);
});

// ── Alerts ────────────────────────────────────────────────────
app.get('/api/alerts', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const ackFilter = req.query.acknowledged !== undefined ? req.query.acknowledged === 'true' : false;
  const vital = sim.getAlerts({
    severity: req.query.severity,
    acknowledged: ackFilter,
    limit,
  }).map(a => ({ ...a, alert_category: 'vital_signs' }));
  const adlAlerts = adl.getAlerts(limit).map(a => ({ ...a, alert_category: 'adl_behavioral' }));
  const combined = [...vital, ...adlAlerts]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
  res.json({ alerts: combined, count: combined.length });
});

app.patch('/api/alerts/:id/ack', (req, res) => {
  const ok = sim.acknowledgeAlert(req.params.id) || adl.acknowledgeAlert(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Alert not found' });
  logger.info('cpm_alert_acknowledged', { alert_id: req.params.id, ...getTraceContext() });
  res.json({ success: true, alert_id: req.params.id, acknowledged_at: new Date().toISOString() });
});

// ── Devices ───────────────────────────────────────────────────
app.get('/api/devices', (_req, res) => {
  const devices = sim.getDevices();
  res.json({ devices, count: devices.length });
});

// ── ADL summary ───────────────────────────────────────────────
app.get('/api/adl', (_req, res) => {
  const high = adl.patients.filter(p => p.adl_risk === 'high');
  res.json({
    patients: adl.patients.map(p => ({
      patient_id: p.patient_id,
      adl_risk: p.adl_risk,
      adl_composite_score: p.adl_composite_score,
      last_updated: p.last_updated,
      flagged_domains: Object.entries(p.domains)
        .filter(([, v]) => v.deviation_score >= 20)
        .map(([k, v]) => ({ domain: k, deviation_score: v.deviation_score, trend: v.trend })),
    })),
    count: adl.patients.length,
    high_risk_count: high.length,
  });
});

// ── Stats ─────────────────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  res.json({ ...sim.getStats(), ...adl.getStats() });
});

// ── Server ────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info('cpm_started', { port: PORT, patients: DEVICE_COUNT, vital_interval_ms: VITAL_INTERVAL_MS });
  console.log(`[cpm] Continuous Patient Monitoring listening on :${PORT}`);
  console.log(`[cpm] Monitoring ${DEVICE_COUNT} patients — vital interval ${VITAL_INTERVAL_MS}ms`);
});

process.on('SIGTERM', () => {
  sim.stop();
  adl.stop();
  server.close(() => process.exit(0));
});
