'use strict';

// ── Splunk Observability Cloud — APM (OpenTelemetry)
// Must be required AFTER dotenv and BEFORE express/pg.
// Auto-instruments: Express routes, pg queries, http calls.
//
// Required env vars:
//   SPLUNK_ACCESS_TOKEN  — Ingest token from Splunk O11y Cloud
//   SPLUNK_REALM         — e.g. us0, us1, eu0
//   OTEL_SERVICE_NAME    — Overrides default service name
//
// Optional (use local OTel Collector instead of direct ingest):
//   OTEL_EXPORTER_OTLP_ENDPOINT — e.g. http://localhost:4317

const { start } = require('@splunk/otel');
const { trace } = require('@opentelemetry/api');

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'careconnect-api-gwy';
const REALM = process.env.SPLUNK_REALM || 'us1';
const ACCESS_TOKEN = process.env.SPLUNK_ACCESS_TOKEN;

// Loopback port → canonical Splunk APM service name.
// OTel sets net.peer.port on a CLIENT span before requestHook fires, so we can
// reliably set peer.service here — even for calls that fail immediately (ECONNREFUSED).
// Without this, Splunk falls back to net.peer.name (127.0.0.1) and shows anonymous
// IP nodes in the service map instead of named service nodes.
const LOOPBACK_SERVICES = {
  3002: 'careconnect-mock-services',
  3011: 'careconnect-patients',
  3012: 'careconnect-labs',
  3013: 'careconnect-rx',
  3014: 'careconnect-notifications',
  3015: 'careconnect-fhir',
  3016: 'careconnect-admin',
  3017: 'careconnect-billing',
  3018: 'careconnect-ai',
  3019: 'careconnect-providers',
  3020: 'careconnect-appointments',
  3022: 'careconnect-haiku',
};

if (!ACCESS_TOKEN && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  console.log('[tracing] Splunk APM disabled — set SPLUNK_ACCESS_TOKEN or OTEL_EXPORTER_OTLP_ENDPOINT to enable');
} else {
  process.env.OTEL_SERVICE_NAME = SERVICE_NAME;
  process.env.OTEL_RESOURCE_ATTRIBUTES = [
    `deployment.environment=${process.env.NODE_ENV || 'production'}`,
    `service.version=${process.env.APP_VERSION || '1.0.0'}`,
    `host.name=${require('os').hostname()}`,
  ].join(',');

  if (ACCESS_TOKEN && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `https://ingest.${REALM}.signalfx.com/v2/trace/otlp`;
    process.env.OTEL_EXPORTER_OTLP_HEADERS = `X-SF-Token=${ACCESS_TOKEN}`;
  }

  process.env.OTEL_NODE_EXCLUDED_URLS = [
    process.env.OTEL_NODE_EXCLUDED_URLS, '/health', '/ping',
  ].filter(Boolean).join(',');
  process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS = [
    process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS, 'net', 'dns',
  ].filter(Boolean).join(',');

  const startOptions = {
    serviceName: SERVICE_NAME,
    accessToken: ACCESS_TOKEN,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  };

  // Configure HTTP instrumentation with requestHook to set peer.service on
  // outgoing CLIENT spans. requestHook fires at span creation — before connection —
  // so it works even when the target is down. net.peer.port is already set on
  // the span by the time requestHook fires.
  try {
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    startOptions.instrumentations = getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) => {
          const p = req.url || '';
          return p === '/health' || p === '/ping';
        },
        requestHook: (span, _request) => {
          const port = span.attributes?.['net.peer.port'];
          const svc = LOOPBACK_SERVICES[port];
          if (svc) span.setAttribute('peer.service', svc);
        },
      },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    });
  } catch (_) {
    // @opentelemetry/auto-instrumentations-node unavailable — default instrumentations used
  }

  try {
    start(startOptions);
    console.log(`[tracing] Splunk APM started — service=${SERVICE_NAME}, realm=${REALM}`);
  } catch (err) {
    console.error('[tracing] Failed to start Splunk APM:', err.message);
  }
}

// ── Trace context accessor ───────────────────────────────────
// Used by the logger middleware to inject trace_id + span_id
// into every log line, enabling log→trace correlation in Splunk.
function getTraceContext() {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
  };
}

module.exports = { getTraceContext };
