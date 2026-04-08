require('dotenv').config();
require('./tracing'); // Splunk APM — must load before express/http

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { requestLogger, logger } = require('./logger');

const app = express();
const PORT = process.env.BFF_PORT || 3003;
const API_URL = process.env.API_URL || 'http://localhost:3001';

// CORS — same allowlist pattern as the API.
// In production the browser hits the ALB (same origin), so this only
// matters for local dev where the BFF runs on a different port.
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(o => o.trim());
const corsOptions = {
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'traceparent', 'tracestate'],
  exposedHeaders: ['x-request-id', 'traceparent', 'tracestate'],
};
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(requestLogger);

// Health check — available at both /health and /bff/health.
// Cloudflare strips the /bff prefix before forwarding to this service,
// so /health is the live path; /bff/health works for direct VM access.
const healthHandler = (req, res) => {
  res.json({
    status: 'healthy',
    service: 'careconnect-front-end',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    upstream: API_URL,
  });
};
app.get('/health', healthHandler);
app.get('/bff/health', healthHandler);

// ── Proxy /bff/* → API /api/* ────────────────────────────────────────────────
//
// Cloudflare forwards the full path including /bff prefix to this service.
// We rewrite /bff → /api to route correctly on the upstream API.
//
// @splunk/otel auto-instruments Node's http module. Every outgoing request
// http-proxy-middleware makes to the API will:
//   1. Be wrapped in an OTel client span for 'careconnect-bff'
//   2. Have the current traceparent injected automatically
//   3. Appear as a child of the incoming browser span in the service map
//
// Result in Splunk APM service map:
//   browser (RUM) ──▶ careconnect-bff ──▶ careconnect-api ──▶ postgresql
//
app.use('/bff', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  // Express strips the /bff mount prefix before handing off to this middleware,
  // so req.url is already /patients (not /bff/patients).
  // Rewrite the leading / to /api/ so it maps correctly on the upstream API.
  pathRewrite: { '^/': '/api/' },
  on: {
    proxyReq: (proxyReq, req) => {
      // Explicitly forward Authorization so the API authenticate() middleware
      // receives the JWT regardless of proxy header-copying behaviour
      const auth = req.headers['authorization'];
      if (auth) proxyReq.setHeader('authorization', auth);
      proxyReq.setHeader('x-forwarded-from', 'careconnect-bff');
      if (req.requestId) proxyReq.setHeader('x-request-id', req.requestId);
    },
    error: (err, req, res) => {
      logger.error('BFF proxy error', { error: err.message, path: req.path, upstream: API_URL });
      if (!res.headersSent) {
        res.status(502).json({ error: 'BFF upstream unavailable', upstream: 'careconnect-api' });
      }
    },
  },
}));

app.listen(PORT, () => {
  logger.info(`CareConnect BFF running on port ${PORT}`, {
    port: PORT,
    upstream: API_URL,
    environment: process.env.NODE_ENV,
  });
  console.log(`\n  CareConnect BFF`);
  console.log(`  Running at: http://localhost:${PORT}`);
  console.log(`  Health:     http://localhost:${PORT}/bff/health`);
  console.log(`  Upstream:   ${API_URL}\n`);
});
