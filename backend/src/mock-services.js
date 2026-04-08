/**
 * Mock External Services Server — CareConnect EHR Demo
 *
 * Simulates the external SaaS dependencies that a real EHR integrates with:
 *   - Surescripts  (ePrescribing network, port segment: /surescripts/*)
 *   - Quest LIS    (lab ordering, port segment: /quest/*)
 *   - LabCorp LIS  (lab ordering, port segment: /labcorp/*)
 *   - Twilio       (SMS notifications, port segment: /twilio/*)
 *   - SendGrid     (email notifications, port segment: /sendgrid/*)
 *
 * Each service has its own independently tunable latency + failure rate so
 * you can simulate degraded dependencies during a ThousandEyes demo:
 *
 *   SURESCRIPTS_LATENCY_MS=800   — slow Surescripts (e.g. routing congestion)
 *   TWILIO_FAILURE_RATE=0.5      — 50% SMS failures (e.g. carrier outage)
 *   QUEST_LATENCY_JITTER=200     — add random ±200ms to Quest calls
 *
 * Health check endpoint: GET /health
 * Config endpoint:       GET /config  (shows current latency/failure settings)
 * Live log endpoint:     GET /log     (last 50 requests across all services)
 */

require('dotenv').config();
require('./mock-tracing'); // Splunk APM — must load before express
const express = require('express');
const app = express();
const PORT = process.env.MOCK_PORT || 3002;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Request log ring-buffer ──────────────────────────────────────────────────
const requestLog = [];
function logRequest(entry) {
  requestLog.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (requestLog.length > 100) requestLog.pop();
}

// ─── Latency / chaos config (readable from env, patchable via PATCH /config) ─
const config = {
  surescripts: {
    latencyMs: Number(process.env.SURESCRIPTS_LATENCY_MS ?? 180),
    jitterMs:  Number(process.env.SURESCRIPTS_LATENCY_JITTER ?? 60),
    failureRate: Number(process.env.SURESCRIPTS_FAILURE_RATE ?? 0),
    timeoutRate: Number(process.env.SURESCRIPTS_TIMEOUT_RATE ?? 0),
    label: 'Surescripts ePrescribing',
    region: process.env.SURESCRIPTS_REGION ?? 'us-east-1 (Scottsdale, AZ)',
  },
  quest: {
    latencyMs: Number(process.env.QUEST_LATENCY_MS ?? 240),
    jitterMs:  Number(process.env.QUEST_LATENCY_JITTER ?? 80),
    failureRate: Number(process.env.QUEST_FAILURE_RATE ?? 0),
    timeoutRate: Number(process.env.QUEST_TIMEOUT_RATE ?? 0),
    label: 'Quest Diagnostics LIS',
    region: process.env.QUEST_REGION ?? 'us-east-1 (Secaucus, NJ)',
  },
  labcorp: {
    latencyMs: Number(process.env.LABCORP_LATENCY_MS ?? 310),
    jitterMs:  Number(process.env.LABCORP_LATENCY_JITTER ?? 100),
    failureRate: Number(process.env.LABCORP_FAILURE_RATE ?? 0),
    timeoutRate: Number(process.env.LABCORP_TIMEOUT_RATE ?? 0),
    label: 'LabCorp LIS',
    region: process.env.LABCORP_REGION ?? 'us-east-2 (Burlington, NC)',
  },
  twilio: {
    latencyMs: Number(process.env.TWILIO_LATENCY_MS ?? 120),
    jitterMs:  Number(process.env.TWILIO_LATENCY_JITTER ?? 40),
    failureRate: Number(process.env.TWILIO_FAILURE_RATE ?? 0),
    timeoutRate: Number(process.env.TWILIO_TIMEOUT_RATE ?? 0),
    label: 'Twilio SMS',
    region: process.env.TWILIO_REGION ?? 'us-west-2 (San Francisco, CA)',
  },
  sendgrid: {
    latencyMs: Number(process.env.SENDGRID_LATENCY_MS ?? 95),
    jitterMs:  Number(process.env.SENDGRID_LATENCY_JITTER ?? 30),
    failureRate: Number(process.env.SENDGRID_FAILURE_RATE ?? 0),
    timeoutRate: Number(process.env.SENDGRID_TIMEOUT_RATE ?? 0),
    label: 'SendGrid Email',
    region: process.env.SENDGRID_REGION ?? 'us-west-1 (Redwood City, CA)',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function jitter(svc) {
  const c = config[svc];
  return c.latencyMs + Math.round((Math.random() * 2 - 1) * c.jitterMs);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Middleware factory that applies per-service latency, failure, and timeout
 * simulation before the route handler runs.
 */
function simulate(svc) {
  return async (req, res, next) => {
    const c = config[svc];
    const latency = jitter(svc);

    // Simulate timeout: just never respond (hang until client gives up)
    if (Math.random() < c.timeoutRate) {
      logRequest({ service: svc, method: req.method, path: req.path, outcome: 'timeout', latencyMs: latency });
      await delay(30000); // hang for 30s — client will abort first
      return;
    }

    await delay(latency);

    // Simulate error response
    if (Math.random() < c.failureRate) {
      logRequest({ service: svc, method: req.method, path: req.path, outcome: 'error', latencyMs: latency });
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        service: c.label,
        retryAfter: 30,
      });
    }

    logRequest({ service: svc, method: req.method, path: req.path, outcome: 'success', latencyMs: latency });
    res.locals.simulatedLatency = latency;
    next();
  };
}

function rxId()    { return `RX${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,5).toUpperCase()}`; }
function lisId()   { return `LIS${Date.now().toString(36).toUpperCase()}`; }
function smsSid()  { return `SM${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,6).toUpperCase()}`; }
function msgId()   { return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`; }

// ─── Surescripts — SCRIPT 10.6 ePrescribing ──────────────────────────────────
// POST /surescripts/api/v2/NewRxRequest
app.post('/surescripts/api/v2/NewRxRequest', simulate('surescripts'), (req, res) => {
  const body = req.body;
  const id = rxId();
  res.json({
    messageType: 'NewRxResponse',
    messageId: id,
    referenceMessageId: body.messageId,
    sentTime: new Date().toISOString(),
    status: 'Approved',
    rxReferenceNumber: id,
    pharmacyVerified: true,
    pharmacy: body.pharmacy || {},
    drug: body.drug || {},
    approvedAt: new Date().toISOString(),
    processingTimeMs: res.locals.simulatedLatency,
    note: `[Mock] Surescripts SCRIPT 10.6 — Approved. Rx routed to ${body.pharmacy?.name || 'pharmacy'}.`,
  });
});

// Also accept the generic /post path used as fallback
app.post('/surescripts/post', simulate('surescripts'), (req, res) => {
  const id = rxId();
  res.json({
    messageType: 'NewRxResponse',
    status: 'Approved',
    rxReferenceNumber: id,
    processingTimeMs: res.locals.simulatedLatency,
  });
});

app.get('/surescripts/get', simulate('surescripts'), (req, res) => {
  res.json({ status: 'ok', service: 'Surescripts', region: config.surescripts.region });
});

// ─── Quest Diagnostics LIS ────────────────────────────────────────────────────
// POST /quest/orders/v1/create  (HL7 ORM_O01 order)
app.post('/quest/orders/v1/create', simulate('quest'), (req, res) => {
  const body = req.body;
  const orderId = lisId();
  res.json({
    messageType: 'ORL_O22',
    orderNumber: body.orderNumber || orderId,
    questOrderId: orderId,
    status: 'Received',
    vendor: 'Quest Diagnostics',
    receivedAt: new Date().toISOString(),
    estimatedResultTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    specimenCollectionInstructions: body.order?.specimenType === 'urine'
      ? 'Clean-catch midstream urine specimen required.'
      : 'Venipuncture — fasting preferred for lipid panels.',
    processingTimeMs: res.locals.simulatedLatency,
    note: `[Mock] Quest LIS ORM_O01 received. ${body.order?.testName || 'Test'} order acknowledged.`,
  });
});

app.post('/quest/post', simulate('quest'), (req, res) => {
  const orderId = lisId();
  res.json({ status: 'Received', questOrderId: orderId, processingTimeMs: res.locals.simulatedLatency });
});

app.get('/quest/get', simulate('quest'), (req, res) => {
  res.json({ status: 'ok', service: 'Quest Diagnostics', region: config.quest.region });
});

// ─── LabCorp LIS ─────────────────────────────────────────────────────────────
// POST /labcorp/orders/v1/create
app.post('/labcorp/orders/v1/create', simulate('labcorp'), (req, res) => {
  const body = req.body;
  const orderId = lisId();
  res.json({
    messageType: 'ORL_O22',
    orderNumber: body.orderNumber || orderId,
    labcorpOrderId: orderId,
    status: 'Received',
    vendor: 'LabCorp',
    receivedAt: new Date().toISOString(),
    estimatedResultTime: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    specimenCollectionInstructions: 'Standard venipuncture. Specimen must be received within 4 hours of collection.',
    processingTimeMs: res.locals.simulatedLatency,
    note: `[Mock] LabCorp LIS received. ${body.order?.testName || 'Test'} routed to nearest processing center.`,
  });
});

app.post('/labcorp/post', simulate('labcorp'), (req, res) => {
  const orderId = lisId();
  res.json({ status: 'Received', labcorpOrderId: orderId, processingTimeMs: res.locals.simulatedLatency });
});

app.get('/labcorp/get', simulate('labcorp'), (req, res) => {
  res.json({ status: 'ok', service: 'LabCorp', region: config.labcorp.region });
});

// ─── Twilio SMS ───────────────────────────────────────────────────────────────
// POST /twilio/2010-04-01/Accounts/:sid/Messages.json
app.post('/twilio/2010-04-01/Accounts/:accountSid/Messages.json', simulate('twilio'), (req, res) => {
  const sid = smsSid();
  const body = req.body;
  res.status(201).json({
    sid,
    account_sid: req.params.accountSid,
    to: body.To || body.to,
    from: body.From || body.from || '+15550000000',
    body: body.Body || body.body,
    status: 'queued',
    direction: 'outbound-api',
    date_created: new Date().toISOString(),
    date_updated: new Date().toISOString(),
    price: '-0.0079',
    price_unit: 'USD',
    uri: `/2010-04-01/Accounts/${req.params.accountSid}/Messages/${sid}.json`,
    num_segments: '1',
    num_media: '0',
    processingTimeMs: res.locals.simulatedLatency,
  });
});

app.get('/twilio/get', simulate('twilio'), (req, res) => {
  res.json({ status: 'ok', service: 'Twilio', region: config.twilio.region });
});

// ─── SendGrid Email ───────────────────────────────────────────────────────────
// POST /sendgrid/v3/mail/send
app.post('/sendgrid/v3/mail/send', simulate('sendgrid'), (req, res) => {
  const id = msgId();
  // SendGrid returns 202 Accepted with x-message-id header on success
  res.status(202)
    .set('x-message-id', id)
    .json({
      messageId: id,
      status: 'accepted',
      processingTimeMs: res.locals.simulatedLatency,
    });
});

app.get('/sendgrid/get', simulate('sendgrid'), (req, res) => {
  res.json({ status: 'ok', service: 'SendGrid', region: config.sendgrid.region });
});

// ─── Management endpoints ─────────────────────────────────────────────────────

// GET /health — overall mock server health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'careconnect-mock-services',
    port: PORT,
    services: Object.fromEntries(
      Object.entries(config).map(([k, v]) => [k, {
        label: v.label,
        region: v.region,
        latencyMs: v.latencyMs,
        jitterMs: v.jitterMs,
        failureRate: v.failureRate,
        timeoutRate: v.timeoutRate,
      }])
    ),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// GET /config — show current simulation settings
app.get('/config', (req, res) => {
  res.json(config);
});

// PATCH /config — live-update latency/failure settings without restart
// Body: { "twilio": { "latencyMs": 800, "failureRate": 0.3 } }
app.patch('/config', (req, res) => {
  const updates = req.body;
  for (const [svc, settings] of Object.entries(updates)) {
    if (config[svc]) {
      Object.assign(config[svc], settings);
    }
  }
  console.log('[mock] Config updated:', JSON.stringify(updates));
  res.json({ updated: true, config });
});

// GET /log — last 100 request events across all mock services
app.get('/log', (req, res) => {
  res.json({ count: requestLog.length, entries: requestLog });
});

// ─── CORS (allow requests from the EHR backend / frontend) ───────────────────
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-LIS-Vendor, X-Order-Number, X-Surescripts-Version, X-Sender-ID');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 404 fallback with helpful message
app.use((req, res) => {
  res.status(404).json({
    error: 'Mock endpoint not found',
    requested: `${req.method} ${req.path}`,
    availableServices: [
      'POST /surescripts/api/v2/NewRxRequest',
      'POST /quest/orders/v1/create',
      'POST /labcorp/orders/v1/create',
      'POST /twilio/2010-04-01/Accounts/:sid/Messages.json',
      'POST /sendgrid/v3/mail/send',
      'GET  /health',
      'GET  /config',
      'PATCH /config',
      'GET  /log',
    ],
  });
});

app.listen(PORT, () => {
  console.log(`\n🔌 CareConnect Mock External Services`);
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`   Health:     http://localhost:${PORT}/health`);
  console.log(`   Config:     http://localhost:${PORT}/config`);
  console.log(`   Live log:   http://localhost:${PORT}/log\n`);
  console.log('   Simulated services:');
  for (const [, v] of Object.entries(config)) {
    console.log(`     ✓ ${v.label.padEnd(28)} ${v.latencyMs}ms ±${v.jitterMs}ms  region: ${v.region}`);
  }
  console.log('\n   Tip: PATCH /config to adjust latency/failure rates live.\n');
});
