require('dotenv').config();
require('./tracing'); // Splunk APM — must load before express/http (service: careconnect-api-gwy)

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { requestLogger, logger } = require('./middleware/logger');
const { trace } = require('@opentelemetry/api');
const pool = require('./db/pool');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Internal service URLs ─────────────────────────────────────────────────────
// Each service runs on a separate port on this VM (loopback only).
// OTel auto-instrumentation propagates traceparent on every outbound HTTP call,
// linking gateway → service spans in Splunk APM and building the service map.
const SVC_PATIENTS      = process.env.PATIENTS_SERVICE_URL      || 'http://127.0.0.1:3011';
const SVC_LABS          = process.env.LABS_SERVICE_URL          || 'http://127.0.0.1:3012';
const SVC_RX            = process.env.RX_SERVICE_URL            || 'http://127.0.0.1:3013';
const SVC_NOTIFICATIONS = process.env.NOTIFICATIONS_SERVICE_URL || 'http://127.0.0.1:3014';
const SVC_FHIR          = process.env.FHIR_SERVICE_URL          || 'http://127.0.0.1:3015';
const SVC_ADMIN         = process.env.ADMIN_SERVICE_URL         || 'http://127.0.0.1:3016';
const SVC_BILLING       = process.env.BILLING_SERVICE_URL       || 'http://127.0.0.1:3017';
const SVC_AI            = process.env.AI_SERVICE_URL            || 'http://127.0.0.1:3018';

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(o => o.trim());
const corsOptions = {
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'traceparent', 'tracestate'],
  exposedHeaders: ['traceparent', 'tracestate'],
};
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(requestLogger);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      service: 'careconnect-api-gwy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected', error: err.message });
  }
});

// ── Auth — stays in the gateway ───────────────────────────────────────────────
// JSON body parsing is scoped to /api/auth only so the body stream remains
// intact for all proxied routes (http-proxy-middleware forwards the raw stream).
app.use('/api/auth', express.json({ limit: '10mb' }), require('./routes/auth'));

// ── Gateway helper ────────────────────────────────────────────────────────────
// OTel instruments Node's http module. Every outgoing proxy request carries the
// active traceparent header, creating a CLIENT span in careconnect-api and a
// corresponding SERVER span in the target service. Splunk APM uses this to draw
// the service-to-service edges on the service map.
function proxy(target, serviceName) {
  return createProxyMiddleware({
    target,
    changeOrigin: false,
    // Express strips the mount prefix (e.g. /api/patients) from req.url before
    // passing it to this middleware. Restore the full path so the internal
    // service receives the URL it expects (e.g. /api/patients/123, not /123).
    pathRewrite: (path, req) => req.baseUrl + path,
    on: {
      // Set peer.service on the OTel HTTP client span that auto-instrumentation
      // creates for this outgoing request. Without this, Splunk falls back to
      // net.peer.name (the raw IP/loopback address) and shows anonymous IP nodes
      // in the service map instead of named service nodes.
      proxyReq: () => {
        const span = trace.getActiveSpan();
        if (span) span.setAttribute('peer.service', serviceName);
      },
      error: (err, req, res) => {
        logger.error('Gateway proxy error', { service: serviceName, error: err.message, path: req.path });
        if (!res.headersSent) {
          res.status(502).json({ error: 'Service unavailable', service: serviceName });
        }
      },
    },
  });
}

// ── Route → Internal service ──────────────────────────────────────────────────
app.use('/api/patients',      proxy(SVC_PATIENTS,      'careconnect-patients'));
app.use('/api/providers',     proxy(SVC_PATIENTS,      'careconnect-patients'));
app.use('/api/appointments',  proxy(SVC_PATIENTS,      'careconnect-patients'));
app.use('/api/vitals',        proxy(SVC_PATIENTS,      'careconnect-patients'));
app.use('/api/notes',         proxy(SVC_PATIENTS,      'careconnect-patients'));
app.use('/api/labs',          proxy(SVC_LABS,          'careconnect-labs'));
app.use('/api/medications',   proxy(SVC_LABS,          'careconnect-labs'));
app.use('/api/eprescribe',    proxy(SVC_RX,            'careconnect-rx'));
app.use('/api/notifications', proxy(SVC_NOTIFICATIONS, 'careconnect-notifications'));
app.use('/api/messages',      proxy(SVC_NOTIFICATIONS, 'careconnect-notifications'));
app.use('/fhir',              proxy(SVC_FHIR,          'careconnect-fhir'));
app.use('/api/admin',         proxy(SVC_ADMIN,         'careconnect-admin'));
app.use('/api/bills',         proxy(SVC_BILLING,       'careconnect-billing'));
app.use('/api/ai',            proxy(SVC_AI,            'careconnect-ai'));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function startServer() {
  try {
    // Initialize DB schema (idempotent — safe to run on every restart)
    const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(schema);
    logger.info('Database schema initialized');

    app.listen(PORT, () => {
      logger.info(`CareConnect API gateway running on port ${PORT}`, {
        port: PORT,
        environment: process.env.NODE_ENV,
        cors: process.env.CORS_ORIGIN,
      });
      console.log(`\n  CareConnect API (gateway)`);
      console.log(`  Running at: http://localhost:${PORT}`);
      console.log(`  Health:     http://localhost:${PORT}/health\n`);
    });

    // Lab result simulator — run only on the primary PM2 worker
    const isPrimaryWorker = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';
    if (isPrimaryWorker) {
      const { startLabSimulator } = require('./lab-simulator');
      startLabSimulator();
    }
  } catch (err) {
    logger.error('Failed to start gateway', { error: err.message });
    process.exit(1);
  }
}

startServer();
