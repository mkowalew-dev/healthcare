require('dotenv').config();
require('./tracing'); // Splunk APM — must load before express/pg
const express = require('express');
const cors = require('cors');
const { requestLogger, logger } = require('./middleware/logger');
const pool = require('./db/pool');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(o => o.trim());
const corsOptions = {
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'traceparent', 'tracestate'],
  exposedHeaders: ['traceparent', 'tracestate'],
};
app.options('*', cors(corsOptions)); // explicit preflight for all routes
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// Health check (ThousandEyes monitoring endpoint)
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      service: 'careconnect-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: err.message,
    });
  }
});

// API Info
app.get('/api', (req, res) => {
  res.json({
    name: 'CareConnect EHR API',
    version: '1.0.0',
    description: 'EPIC-compatible EHR REST API for demo purposes',
    endpoints: [
      '/api/auth', '/api/patients', '/api/providers',
      '/api/appointments', '/api/labs', '/api/medications',
      '/api/bills', '/api/messages', '/api/vitals', '/api/admin',
    ],
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/providers', require('./routes/providers'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/labs', require('./routes/labs'));
app.use('/api/medications', require('./routes/medications'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/vitals', require('./routes/vitals'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/eprescribe', require('./routes/eprescribe'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/fhir', require('./routes/fhir'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    requestId: req.requestId,
  });
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize DB schema and start server
async function startServer() {
  try {
    // Run schema
    const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(schema);
    logger.info('Database schema initialized');

    app.listen(PORT, () => {
      logger.info(`CareConnect API running on port ${PORT}`, {
        port: PORT,
        environment: process.env.NODE_ENV,
        cors: process.env.CORS_ORIGIN,
      });
      console.log(`\n🏥 CareConnect EHR API`);
      console.log(`   Running at: http://localhost:${PORT}`);
      console.log(`   Health:     http://localhost:${PORT}/health`);
      console.log(`   Docs:       http://localhost:${PORT}/api\n`);
    });

    // Start background lab result simulator (results pending labs every 15 min).
    // Guard to instance 0 only — prevents duplicate runs when PM2 cluster mode
    // spawns multiple workers; all workers share the same DB so one is enough.
    const isPrimaryWorker = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';
    if (isPrimaryWorker) {
      const { startLabSimulator } = require('./lab-simulator');
      startLabSimulator();
    }
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

startServer();
