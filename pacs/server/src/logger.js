'use strict';

// ── Structured JSON logger for the PACS server ───────────────────────────────
// Writes to stdout (captured by PM2 → /var/log/careconnect/pacs-out.log)
// and stderr (pacs-error.log).  The OTel collector's file_log receiver picks
// up both files and forwards them to Splunk Platform via HEC.
//
// Every log line includes trace_id + span_id when emitted inside an active
// OTel span, enabling log→trace correlation in Splunk Log Observer.

const winston = require('winston');
const { getTraceContext } = require('./tracing');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(info => {
    const traceCtx = getTraceContext();
    const line = {
      timestamp: info.timestamp,
      level:     info.level,
      message:   info.message,
      service:   'careconnect-pacs',
      ...traceCtx,
      ...(info.meta || {}),
    };
    if (info.stack) line.stack = info.stack;
    return JSON.stringify(line);
  }),
);

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: jsonFormat,
  transports: [
    new winston.transports.Console({ stderrLevels: ['error'] }),
  ],
});

// Morgan-compatible stream so HTTP access logs flow through Winston
logger.stream = {
  write: msg => logger.info(msg.trim(), { meta: { log_type: 'access' } }),
};

module.exports = logger;
