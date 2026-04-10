'use strict';
// Set service name before dotenv/tracing — dotenv won't override an already-set env var
process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'careconnect-patients';

require('dotenv').config();
require('../tracing'); // Splunk APM — must load before express

const express = require('express');
const { requestLogger } = require('../middleware/logger');

const app = express();
const PORT = process.env.PATIENTS_SERVICE_PORT || 3011;

app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

app.get('/health', (req, res) =>
  res.json({ status: 'healthy', service: 'careconnect-patients', uptime: process.uptime() })
);

app.use('/api/patients',     require('../routes/patients'));
app.use('/api/providers',    require('../routes/providers'));
app.use('/api/appointments', require('../routes/appointments'));
app.use('/api/vitals',       require('../routes/vitals'));
app.use('/api/notes',        require('../routes/notes'));

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));
app.use((err, req, res, next) => res.status(500).json({ error: 'Internal server error' }));

app.listen(PORT, '127.0.0.1', () =>
  console.log(`careconnect-patients running on :${PORT}`)
);
