'use strict';

require('dotenv').config();
require('./tracing'); // Splunk APM — must load before express

const express = require('express');
const morgan  = require('morgan');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { buildIndex, getStudies, getStudy, getInstanceFilePath } = require('./dicom-index');

const app = express();
const PORT = parseInt(process.env.PORT || '3021', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'pacs-demo-secret-change-me';
const STUDIES_DIR = path.resolve(process.env.STUDIES_DIR || './studies');

// Simulated retrieval latency for ThousandEyes demo — raise via env to show
// how a degraded WAN path impacts radiologist image load times.
const IMAGE_LATENCY_MS = parseInt(process.env.IMAGE_LATENCY_MS || '0', 10);
const IMAGE_LATENCY_JITTER_MS = parseInt(process.env.IMAGE_LATENCY_JITTER_MS || '0', 10);

// ── Demo users ────────────────────────────────────────────────────────────────
const USERS = {
  'dr.chen@careconnect.demo': {
    id: 'pacs-user-1',
    name: 'Dr. Emily Chen',
    role: 'radiologist',
    title: 'Attending Radiologist',
    specialty: 'Diagnostic Radiology',
    password: 'Demo123!',
  },
  'dr.patel@careconnect.demo': {
    id: 'pacs-user-2',
    name: 'Dr. Raj Patel',
    role: 'radiologist',
    title: 'Attending Radiologist',
    specialty: 'Neuroradiology',
    password: 'Demo123!',
  },
  'tech.jones@careconnect.demo': {
    id: 'pacs-user-3',
    name: 'Alex Jones',
    role: 'technologist',
    title: 'Lead CT/MRI Technologist',
    specialty: 'CT/MRI',
    password: 'Demo123!',
  },
};

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5174').split(',').map(o => o.trim());
app.use(cors({
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  credentials: true,
  exposedHeaders: ['Content-Type', 'Content-Length', 'X-Image-Load-Time', 'traceparent'],
}));
// WADO endpoint needs wide-open CORS so Cornerstone can fetch images directly
app.use('/wado', cors({ origin: '*', exposedHeaders: ['Content-Type', 'Content-Length', 'X-Image-Load-Time'] }));

app.use(morgan('combined', { stream: logger.stream }));
app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────────────────────
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function simulateLatency() {
  if (!IMAGE_LATENCY_MS) return Promise.resolve();
  const jitter = IMAGE_LATENCY_JITTER_MS ? Math.floor(Math.random() * IMAGE_LATENCY_JITTER_MS) : 0;
  return new Promise(r => setTimeout(r, IMAGE_LATENCY_MS + jitter));
}

// ── Health check — ThousandEyes HTTP monitor target ──────────────────────────
app.get('/health', (_req, res) => {
  const studies = getStudies();
  res.json({
    status: 'healthy',
    service: 'careconnect-pacs',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    studies: {
      total: studies.length,
      withImages: studies.filter(s => s.hasImages).length,
      seedOnly: studies.filter(s => !s.hasImages).length,
    },
    latencySimulation: {
      imageLatencyMs: IMAGE_LATENCY_MS,
      jitterMs: IMAGE_LATENCY_JITTER_MS,
    },
    studiesDir: STUDIES_DIR,
  });
});

// ── Ping — lightweight ThousandEyes HTTP SLO probe ───────────────────────────
app.get('/ping', (_req, res) => {
  res.json({ pong: true, ts: Date.now(), service: 'careconnect-pacs' });
});

// ── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const user = USERS[email?.toLowerCase()];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const payload = { id: user.id, email, name: user.name, role: user.role, title: user.title };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    token,
    user: { ...payload, specialty: user.specialty },
  });
});

// ── Worklist — radiologist's reading queue ────────────────────────────────────
app.get('/api/worklist', authenticate, (req, res) => {
  const { status, modality, priority } = req.query;
  let studies = getStudies();

  // Radiologists see only their assigned studies; techs/admins see all
  if (req.user.role === 'radiologist') {
    studies = studies.filter(s => s.assignedTo === req.user.email);
  }
  if (status) studies = studies.filter(s => s.status === status.toUpperCase());
  if (modality) studies = studies.filter(s => s.modality === modality.toUpperCase());
  if (priority) studies = studies.filter(s => s.priority === priority.toUpperCase());

  res.json({
    studies: studies.map(s => ({
      studyInstanceUID: s.studyInstanceUID,
      patientName: s.patientName,
      patientID: s.patientID,
      studyDate: s.studyDate,
      studyTime: s.studyTime,
      studyDescription: s.studyDescription,
      modality: s.modality,
      accessionNumber: s.accessionNumber,
      numberOfImages: s.numberOfImages,
      priority: s.priority,
      status: s.status,
      assignedTo: s.assignedTo,
      referringPhysician: s.referringPhysician,
      institution: s.institution,
      hasImages: s.hasImages,
      seriesCount: s.series?.length ?? 0,
    })),
    total: studies.length,
    timestamp: new Date().toISOString(),
  });
});

// ── Study detail ──────────────────────────────────────────────────────────────
app.get('/api/studies/:studyUID', authenticate, (req, res) => {
  const study = getStudy(req.params.studyUID);
  if (!study) return res.status(404).json({ error: 'Study not found' });
  res.json(study);
});

// ── Series list ───────────────────────────────────────────────────────────────
app.get('/api/studies/:studyUID/series', authenticate, (req, res) => {
  const study = getStudy(req.params.studyUID);
  if (!study) return res.status(404).json({ error: 'Study not found' });
  res.json({
    studyInstanceUID: study.studyInstanceUID,
    patientName: study.patientName,
    studyDescription: study.studyDescription,
    hasImages: study.hasImages,
    series: study.series.map(s => ({
      seriesInstanceUID: s.seriesInstanceUID,
      seriesNumber: s.seriesNumber,
      seriesDescription: s.seriesDescription,
      modality: s.modality,
      numberOfInstances: s.numberOfInstances,
    })),
  });
});

// ── Instance list ─────────────────────────────────────────────────────────────
app.get('/api/studies/:studyUID/series/:seriesUID/instances', authenticate, (req, res) => {
  const study = getStudy(req.params.studyUID);
  if (!study) return res.status(404).json({ error: 'Study not found' });
  const series = study.series.find(s => s.seriesInstanceUID === req.params.seriesUID);
  if (!series) return res.status(404).json({ error: 'Series not found' });

  const publicBase = process.env.PACS_PUBLIC_URL || `http://localhost:${PORT}`;
  res.json(series.instances.map(i => ({
    sopInstanceUID: i.sopInstanceUID,
    instanceNumber: i.instanceNumber,
    wadoUri: `${publicBase}/wado?requestType=WADO&studyUID=${req.params.studyUID}&seriesUID=${req.params.seriesUID}&objectUID=${i.sopInstanceUID}`,
  })));
});

// ── Latency status — viewer polls this to show the demo banner ───────────────
app.get('/api/demo/latency', (_req, res) => {
  res.json({
    active: IMAGE_LATENCY_MS > 0,
    imageLatencyMs: IMAGE_LATENCY_MS,
    jitterMs: IMAGE_LATENCY_JITTER_MS,
  });
});

// ── Latency control — adjust simulation live during ThousandEyes demo ─────────
// POST { "latencyMs": 1500, "jitterMs": 300 } to simulate a degraded WAN path
app.post('/api/demo/latency', authenticate, (req, res) => {
  const { latencyMs, jitterMs } = req.body ?? {};
  // Note: env vars can't be changed at runtime; restart with new values.
  res.json({
    message: 'To apply, restart the server with the env vars below',
    command: `IMAGE_LATENCY_MS=${latencyMs ?? 0} IMAGE_LATENCY_JITTER_MS=${jitterMs ?? 0} npm start`,
    currentImageLatencyMs: IMAGE_LATENCY_MS,
    currentJitterMs: IMAGE_LATENCY_JITTER_MS,
  });
});

// ── WADO-URI image retrieval — the critical path ThousandEyes monitors ────────
// Cornerstone fetches: /wado?requestType=WADO&studyUID=...&seriesUID=...&objectUID=...
// Response: raw DICOM binary, Content-Type: application/dicom
//
// This endpoint is intentionally unauthenticated so Cornerstone can retrieve
// images as direct browser requests without embedding tokens in image URLs.
// In production, use short-lived signed tokens or an image proxy.
app.get('/wado', async (req, res) => {
  const { objectUID } = req.query;
  if (!objectUID) return res.status(400).json({ error: 'Missing objectUID parameter' });

  const filePath = getInstanceFilePath(String(objectUID));

  if (!filePath) {
    return res.status(404).json({
      error: 'Instance not found',
      objectUID,
      hint: 'Run "npm run download" in pacs/server to download sample DICOM images, then restart.',
    });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'DICOM file missing from disk', filePath });
  }

  // Simulate WAN latency (ThousandEyes demo: compare before/after enabling this)
  await simulateLatency();

  const startTransfer = Date.now();
  const stat = fs.statSync(filePath);

  res.set({
    'Content-Type': 'application/dicom',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="dicom_${objectUID}.dcm"`,
    'Cache-Control': 'public, max-age=3600',
    'X-Image-Load-Time': `${Date.now() - startTransfer}ms`,
    // Allow the browser Performance API to expose cross-origin WADO timing —
    // the viewer uses this to display per-image fetch latency in the overlay.
    'Timing-Allow-Origin': '*',
  });

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
  stream.pipe(res);
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function main() {
  await buildIndex(STUDIES_DIR);
  app.listen(PORT, () => {
    const studies = getStudies();
    const withImages = studies.filter(s => s.hasImages).length;
    logger.info('CareConnect PACS Server started', {
      meta: {
        port: PORT,
        studies: studies.length,
        withImages,
        seedOnly: studies.length - withImages,
        imageLatencyMs: IMAGE_LATENCY_MS,
        jitterMs: IMAGE_LATENCY_JITTER_MS,
      },
    });
    console.log('\n  CareConnect PACS Server');
    console.log(`  Listening:  http://localhost:${PORT}`);
    console.log(`  Health:     http://localhost:${PORT}/health`);
    console.log(`  Worklist:   http://localhost:${PORT}/api/worklist`);
    console.log(`  Studies:    ${studies.length} total (${withImages} with DICOM files, ${studies.length - withImages} seed-only)`);
    if (withImages === 0) {
      console.log('\n  No DICOM images found. Download sample images:');
      console.log('    cd pacs/server && npm run download\n');
    }
    if (IMAGE_LATENCY_MS > 0) {
      logger.warn('Image latency simulation active', {
        meta: { imageLatencyMs: IMAGE_LATENCY_MS, jitterMs: IMAGE_LATENCY_JITTER_MS },
      });
      console.log(`\n  [ThousandEyes demo] Simulating ${IMAGE_LATENCY_MS}ms latency + ${IMAGE_LATENCY_JITTER_MS}ms jitter on image retrieval`);
    }
  });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
