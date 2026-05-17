'use strict';

// ── MyChart Scheduled Failure Injector ───────────────────────────────────────
// Simulates realistic patient-portal outages on a daily schedule to demonstrate
// ThousandEyes synthetic test alerting and Splunk APM distributed trace analysis.
//
// Both failure modes produce OTel spans with mychart.failure.* attributes that
// show as red error spans in Splunk APM — one span per failed request, linked
// into the full gateway → service trace chain.
//
// Failure modes:
//   api  — returns 503 immediately. Simulates upstream EHR integration down.
//          Splunk trace: gateway CLIENT span times out at < 5 ms.
//
//   db   — adds 8–12 s artificial delay then returns 503. Simulates PostgreSQL
//          connection pool exhaustion. ThousandEyes sees slow response time
//          degradation before full failure; Splunk shows long DB-layer spans.
//
// Env vars (all optional — defaults listed):
//   MYCHART_FAILURE_ENABLED    = true          (must be set explicitly to activate)
//   MYCHART_FAILURE_TYPE       = api | db      (default: api)
//   MYCHART_FAILURE_HOUR       = 0–23          (24h server-local time, default: 14)
//   MYCHART_FAILURE_MINUTE     = 0–59          (default: 0)
//   MYCHART_FAILURE_DURATION   = minutes       (default: 15)

const { trace, SpanStatusCode, context } = require('@opentelemetry/api');
const { logger } = require('./logger');

const ENABLED  = process.env.MYCHART_FAILURE_ENABLED === 'true';
const TYPE     = (process.env.MYCHART_FAILURE_TYPE || 'api').toLowerCase();
const HOUR     = parseInt(process.env.MYCHART_FAILURE_HOUR     ?? '14', 10);
const MINUTE   = parseInt(process.env.MYCHART_FAILURE_MINUTE   ?? '0',  10);
const DURATION = parseInt(process.env.MYCHART_FAILURE_DURATION ?? '15', 10);

function windowStart() {
  const d = new Date();
  d.setHours(HOUR, MINUTE, 0, 0);
  return d;
}

function windowEnd() {
  return new Date(windowStart().getTime() + DURATION * 60_000);
}

function isInFailureWindow() {
  if (!ENABLED) return false;
  const now = new Date();
  return now >= windowStart() && now < windowEnd();
}

function recordFailureSpan(type, reason) {
  const tracer = trace.getTracer('careconnect-failure-injector', '1.0.0');
  const span = tracer.startSpan(`mychart.failure.${type}`);
  span.setAttribute('error', true);
  span.setAttribute('mychart.failure.type', type);
  span.setAttribute('mychart.failure.reason', reason);
  span.setAttribute('mychart.failure.window_start', windowStart().toISOString());
  span.setAttribute('mychart.failure.window_end', windowEnd().toISOString());
  span.setAttribute('mychart.patient_impact', true);
  span.setAttribute('http.status_code', 503);
  span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
  span.end();
}

// Returns an Express middleware. Call once per service and mount before routes.
// serviceName appears in log lines and OTel span attributes.
function createFailureInjector(serviceName) {
  if (!ENABLED) return (_req, _res, next) => next();

  const failureType = TYPE === 'db' ? 'db' : 'api';

  if (ENABLED) {
    console.log(
      `[failure-injector] ${serviceName}: ${failureType.toUpperCase()} failure window ` +
      `${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')} ` +
      `for ${DURATION} min — type=${failureType}`
    );
  }

  return async (req, res, next) => {
    if (!isInFailureWindow()) return next();

    // Skip non-data paths so health checks still pass during a failure window.
    if (req.path === '/health' || req.path === '/ping') return next();

    if (failureType === 'db') {
      const delayMs = 8000 + Math.floor(Math.random() * 4000);
      const reason  = 'PostgreSQL connection pool exhausted — all 20 connections busy';

      logger.error('MyChart DB failure injection', {
        service: serviceName,
        failure_type: 'db',
        delay_ms: delayMs,
        window_start: windowStart().toISOString(),
        window_end: windowEnd().toISOString(),
        method: req.method,
        path: req.path,
      });

      recordFailureSpan('db', reason);

      // Hold the response for delayMs to mimic connection pool wait before timeout.
      await new Promise(resolve => setTimeout(resolve, delayMs));

      return res.status(503).json({
        error: 'Service temporarily unavailable',
        code: 'DB_CONNECTION_TIMEOUT',
        message: 'The database connection pool is exhausted. Request timed out waiting for a connection.',
        retryAfter: windowEnd().toISOString(),
      });
    }

    // API layer failure — respond immediately
    const reason = 'Upstream EHR integration service returned HTTP 503';

    logger.error('MyChart API failure injection', {
      service: serviceName,
      failure_type: 'api',
      window_start: windowStart().toISOString(),
      window_end: windowEnd().toISOString(),
      method: req.method,
      path: req.path,
    });

    recordFailureSpan('api', reason);

    return res.status(503).json({
      error: 'Service temporarily unavailable',
      code: 'MYCHART_UPSTREAM_ERROR',
      message: 'The patient portal integration is temporarily unavailable. Please try again shortly.',
      retryAfter: windowEnd().toISOString(),
    });
  };
}

module.exports = { createFailureInjector, isInFailureWindow };
