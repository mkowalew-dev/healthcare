const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

let getTraceContext = () => ({});
try {
  ({ getTraceContext } = require('./tracing'));
} catch (_) {}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
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
    service: 'careconnect-front-end',
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
              const metaStr = Object.keys(meta).length > 3
                ? '\n  ' + JSON.stringify(meta, null, 2).replace(/\n/g, '\n  ')
                : '';
              return `${timestamp} [${level}]${traceStr} ${message}${metaStr}`;
            })
          ),
    }),
  ],
});

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
      upstream: process.env.API_URL || 'http://localhost:3001',
    };

    if (res.statusCode >= 500) {
      logger.error('BFF request completed with server error', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('BFF request completed with client error', logData);
    } else {
      logger.info('BFF request completed', logData);
    }
  });

  next();
};

module.exports = { logger, requestLogger };
