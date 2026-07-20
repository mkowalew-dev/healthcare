'use strict';

// Splunk Observability Cloud — APM (OpenTelemetry)
// Must be required BEFORE express and any other instrumented modules.

const { start } = require('@splunk/otel');
const { trace } = require('@opentelemetry/api');

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'careconnect-scfp';
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

  process.env.OTEL_NODE_EXCLUDED_URLS = [
    process.env.OTEL_NODE_EXCLUDED_URLS, '/health', '/ping',
  ].filter(Boolean).join(',');
  process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS = [
    process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS, 'net', 'dns',
  ].filter(Boolean).join(',');

  try {
    start({ serviceName: SERVICE_NAME, accessToken: ACCESS_TOKEN, endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT });
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
