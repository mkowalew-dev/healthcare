'use strict';

// ── Splunk Observability Cloud — APM (OpenTelemetry)
// Must be required AFTER dotenv and BEFORE express.
// Auto-instruments Express routes and http calls.
//
// Required env vars:
//   SPLUNK_ACCESS_TOKEN  — Ingest token from Splunk O11y Cloud
//   SPLUNK_REALM         — e.g. us0, us1, eu0
//   OTEL_SERVICE_NAME    — Overrides default service name
//
// Optional (use local OTel Collector instead of direct ingest):
//   OTEL_EXPORTER_OTLP_ENDPOINT — e.g. http://otel-collector:4317

const { start } = require('@splunk/otel');
const { trace } = require('@opentelemetry/api');

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'careconnect-pacs';
const REALM = process.env.SPLUNK_REALM || 'us1';
const ACCESS_TOKEN = process.env.SPLUNK_ACCESS_TOKEN;

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

  try {
    start({
      serviceName: SERVICE_NAME,
      accessToken: ACCESS_TOKEN,
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    });
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
