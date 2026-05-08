'use strict';

// ── Splunk Observability Cloud — APM (OpenTelemetry)
// Identical pattern to backend/src/tracing.js but with service name
// 'careconnect-bff'. This makes the BFF appear as a distinct node in
// the Splunk APM service map, creating the three-tier topology:
//   browser (RUM) → careconnect-bff → careconnect-api → postgresql
//
// The @splunk/otel SDK auto-instruments Express and Node's http module.
// Every outgoing proxy request to the API automatically carries the
// current span's traceparent header, linking BFF spans to API spans.

const { start } = require('@splunk/otel');
const { trace } = require('@opentelemetry/api');

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'careconnect-frontend';
const REALM = process.env.SPLUNK_REALM || 'us1';
const ACCESS_TOKEN = process.env.SPLUNK_ACCESS_TOKEN;

if (!ACCESS_TOKEN && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  console.log('[tracing] Splunk APM disabled — set SPLUNK_ACCESS_TOKEN or OTEL_EXPORTER_OTLP_ENDPOINT to enable');
} else {
  process.env.OTEL_SERVICE_NAME = SERVICE_NAME;
  process.env.OTEL_RESOURCE_ATTRIBUTES = [
    `deployment.environment=${process.env.NODE_ENV || 'production'}`,
    `service.version=1.0.0`,
    `host.name=${require('os').hostname()}`,
  ].join(',');

  if (ACCESS_TOKEN && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `https://ingest.${REALM}.signalfx.com/v2/trace/otlp`;
    process.env.OTEL_EXPORTER_OTLP_HEADERS = `X-SF-Token=${ACCESS_TOKEN}`;
  }

  // Derive the upstream API port from API_URL so peer.service is set correctly
  // on every outgoing proxy request, making the BFF→API edge named in the service map.
  const API_URL = process.env.API_URL || 'http://localhost:3001';
  let apiPort;
  try { apiPort = parseInt(new URL(API_URL).port || '3001', 10); } catch (_) { apiPort = 3001; }

  const startOptions = {
    serviceName: SERVICE_NAME,
    accessToken: ACCESS_TOKEN,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  };

  try {
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    startOptions.instrumentations = getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        requestHook: (span, _request) => {
          if (span.attributes?.['net.peer.port'] === apiPort) {
            span.setAttribute('peer.service', 'careconnect-api-gwy');
          }
        },
      },
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

function getTraceContext() {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  return { trace_id: ctx.traceId, span_id: ctx.spanId };
}

module.exports = { getTraceContext };
