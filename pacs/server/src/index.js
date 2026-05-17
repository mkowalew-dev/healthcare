'use strict';

require('dotenv').config();
require('./tracing'); // Splunk APM — must load before express

const crypto  = require('crypto');
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

// Simulated retrieval latency for ThousandEyes demo.
// Mutable so the scheduled cron anomaly and the latency API can update without
// a PM2 restart.  Initialised from .env; reset to 0 on server restart.
let imageLatencyMs     = parseInt(process.env.IMAGE_LATENCY_MS        || '0', 10);
let imageLatencyJitterMs = parseInt(process.env.IMAGE_LATENCY_JITTER_MS || '0', 10);

// ── Bandwidth probe payloads — generated once at startup ─────────────────────
// crypto.randomBytes produces incompressible data so gzip/deflate can't skew
// the transfer measurements.  Sizes model real DICOM object classes:
//   small  ~200 KB  — scout / localizer image
//   medium  ~2 MB   — typical axial CT slice (uncompressed 512×512 16-bit)
//   large  ~20 MB   — multi-frame CT or thick MR slab
const PROBE = {
  small:  { size: 200  * 1024,        label: 'scout-localizer'   },
  medium: { size: 2    * 1024 * 1024, label: 'ct-axial-slice'    },
  large:  { size: 20   * 1024 * 1024, label: 'multiframe-volume' },
};
for (const p of Object.values(PROBE)) p.buf = crypto.randomBytes(p.size);

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
  if (!imageLatencyMs) return Promise.resolve();
  const jitter = imageLatencyJitterMs ? Math.floor(Math.random() * imageLatencyJitterMs) : 0;
  return new Promise(r => setTimeout(r, imageLatencyMs + jitter));
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
      imageLatencyMs,
      jitterMs: imageLatencyJitterMs,
    },
    studiesDir: STUDIES_DIR,
  });
});

// ── Ping — lightweight ThousandEyes HTTP SLO probe ───────────────────────────
app.get('/ping', (_req, res) => {
  res.json({ pong: true, ts: Date.now(), service: 'careconnect-pacs' });
});

// ── Bandwidth probes — ThousandEyes responsiveness curve across object sizes ──
// One endpoint per size tier; each returns a fixed-size incompressible payload
// so ThousandEyes (and curl) measure raw transfer throughput, not logic latency.
// Unauthenticated.  Latency simulation applies so degraded-path tests show the
// full impact across object sizes.
//
// curl -o /dev/null -w "size=%{size_download}B  time=%{time_total}s  speed=%{speed_download}B/s\n" \
//      http://pacs.pseudo-co.com:3021/probe/small
// curl -o /dev/null -w "size=%{size_download}B  time=%{time_total}s  speed=%{speed_download}B/s\n" \
//      http://pacs.pseudo-co.com:3021/probe/medium
// curl -o /dev/null -w "size=%{size_download}B  time=%{time_total}s  speed=%{speed_download}B/s\n" \
//      http://pacs.pseudo-co.com:3021/probe/large
for (const [name, p] of Object.entries(PROBE)) {
  app.get(`/probe/${name}`, async (_req, res) => {
    await simulateLatency();
    res.set({
      'Content-Type':        'application/octet-stream',
      'Content-Length':      p.buf.length,
      'Content-Disposition': `attachment; filename="pacs-probe-${p.label}.bin"`,
      'Cache-Control':       'no-store',
      'Timing-Allow-Origin': '*',
      'X-Probe-Label':       p.label,
      'X-Probe-Bytes':       String(p.buf.length),
    });
    res.end(p.buf);
  });
}

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
    active: imageLatencyMs > 0,
    imageLatencyMs,
    jitterMs: imageLatencyJitterMs,
  });
});

// ── Latency control — applied immediately in-memory (no restart required) ────
// Accepts either a radiologist JWT or the X-Demo-Secret shared-secret header so
// the on-VM cron script can call it without a login flow.
// POST { "latencyMs": 1500, "jitterMs": 300 }
app.post('/api/demo/latency', (req, res) => {
  const secret = req.headers['x-demo-secret'];
  if (secret !== JWT_SECRET) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
    try { jwt.verify(auth.slice(7), JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
  }

  const { latencyMs, jitterMs } = req.body ?? {};
  if (latencyMs !== undefined) imageLatencyMs      = Math.max(0, parseInt(latencyMs,  10) || 0);
  if (jitterMs  !== undefined) imageLatencyJitterMs = Math.max(0, parseInt(jitterMs,  10) || 0);

  const active = imageLatencyMs > 0;
  const source = secret === JWT_SECRET ? 'cron' : 'api';
  logger.info('Latency simulation updated', { meta: { imageLatencyMs, imageLatencyJitterMs, active, source } });
  res.json({
    message: active
      ? `Latency simulation enabled: ${imageLatencyMs}ms + ${imageLatencyJitterMs}ms jitter`
      : 'Latency simulation disabled',
    active,
    imageLatencyMs,
    jitterMs: imageLatencyJitterMs,
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
        imageLatencyMs,
        jitterMs: imageLatencyJitterMs,
      },
    });
    console.log('\n  CareConnect PACS Server');
    console.log(`  Listening:  http://localhost:${PORT}`);
    console.log(`  Health:     http://localhost:${PORT}/health`);
    console.log(`  Worklist:   http://localhost:${PORT}/api/worklist`);
    console.log(`  Probes:     /probe/small (200 KB)  /probe/medium (2 MB)  /probe/large (20 MB)`);
    console.log(`  Studies:    ${studies.length} total (${withImages} with DICOM files, ${studies.length - withImages} seed-only)`);
    if (withImages === 0) {
      console.log('\n  No DICOM images found. Download sample images:');
      console.log('    cd pacs/server && npm run download\n');
    }
    if (imageLatencyMs > 0) {
      logger.warn('Image latency simulation active', {
        meta: { imageLatencyMs, jitterMs: imageLatencyJitterMs },
      });
      console.log(`\n  [ThousandEyes demo] Simulating ${imageLatencyMs}ms latency + ${imageLatencyJitterMs}ms jitter on image retrieval`);
    }
  });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
