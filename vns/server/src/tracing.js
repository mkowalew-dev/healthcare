'use strict';

const { start } = require('@splunk/otel');
const { trace } = require('@opentelemetry/api');

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'careconnect-vns';
const REALM = process.env.SPLUNK_REALM || 'us1';
const ACCESS_TOKEN = process.env.SPLUNK_ACCESS_TOKEN;

if (!ACCESS_TOKEN && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  console.log('[tracing] Splunk APM disabled — set SPLUNK_ACCESS_TOKEN or OTEL_EXPORTER_OTLP_ENDPOINT');
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

  // Outbound port → canonical Splunk APM service name.
  // VNS calls SCFP and CPM via http.get (fetchJSON) and optionally posts EHR
  // notes to the CareConnect API via http.request (postEHRNote). Without
  // peer.service on those CLIENT spans Splunk falls back to net.peer.name —
  // the Azure AppGW private IP or localhost — and creates anonymous inferred
  // nodes in the service map. Object-key lookup coerces both string and number
  // ports, so it works regardless of how OTel stores net.peer.port.
  const OUTBOUND_SERVICES = {
    [process.env.SCFP_PORT || '3030']: 'careconnect-scfp',
    [process.env.CPM_PORT  || '3032']: 'careconnect-cpm',
    [process.env.API_PORT  || '3001']: 'careconnect-api-gwy',
  };

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
          const svc = OUTBOUND_SERVICES[port];
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
    console.log(`[tracing] Splunk APM started — service=${SERVICE_NAME}`);
  } catch (err) {
    console.error('[tracing] Failed to start Splunk APM:', err.message);
  }
}

function getTraceContext() {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  return { trace_id: ctx.traceId, span_id: ctx.spanId };
}

module.exports = { getTraceContext };
