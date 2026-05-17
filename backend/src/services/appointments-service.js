'use strict';
process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'careconnect-appointments';

require('dotenv').config();
require('../tracing');

const express = require('express');
const { requestLogger } = require('../middleware/logger');
const { createFailureInjector } = require('../middleware/failure-injector');

const app = express();
const PORT = process.env.APPOINTMENTS_SERVICE_PORT || 3020;

app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);
app.use(createFailureInjector('careconnect-appointments'));

app.get('/health', (req, res) =>
  res.json({ status: 'healthy', service: 'careconnect-appointments', uptime: process.uptime() })
);

app.use('/api/appointments', require('../routes/appointments'));

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));
app.use((err, req, res, next) => res.status(500).json({ error: 'Internal server error' }));

app.listen(PORT, '127.0.0.1', () =>
  console.log(`careconnect-appointments running on :${PORT}`)
);
