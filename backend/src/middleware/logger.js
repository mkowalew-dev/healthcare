const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// Lazy-load tracing to avoid circular dependency issues at startup
let getTraceContext = () => ({});
try {
  ({ getTraceContext } = require('../tracing'));
} catch (_) {}

// Splunk Observability-compatible structured JSON logger.
// Every log line includes trace_id + span_id when inside an active span,
// enabling one-click log→trace correlation in Splunk Log Observer.
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    // Inject OTel trace context into every log record
    winston.format((info) => {
      const traceCtx = getTraceContext();
      if (traceCtx.trace_id) {
        info.trace_id = traceCtx.trace_id;
        info.span_id = traceCtx.span_id;
      }
      return info;
    })(),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'careconnect-api',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    host: require('os').hostname(),
  },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, trace_id, ...meta }) => {
              const traceStr = trace_id ? ` [trace:${trace_id.slice(0, 8)}...]` : '';
              const metaStr = Object.keys(meta).length > 3  // skip defaultMeta fields
                ? '\n  ' + JSON.stringify(meta, null, 2).replace(/\n/g, '\n  ')
                : '';
              return `${timestamp} [${level}]${traceStr} ${message}${metaStr}`;
            })
          ),
    }),
  ],
});

// Request/Response logging middleware — emits one JSON log per request
// with all fields needed for Splunk dashboards and ThousandEyes correlation.
const requestLogger = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  const startTime = Date.now();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      contentLength: res.getHeader('content-length') || 0,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection?.remoteAddress,
      userId: req.user?.id || null,
      userRole: req.user?.role || null,
    };

    if (res.statusCode >= 500) {
      logger.error('Request completed with server error', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
};

module.exports = { logger, requestLogger };
