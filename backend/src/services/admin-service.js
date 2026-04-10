'use strict';
process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'careconnect-admin';

require('dotenv').config();
require('../tracing');

const express = require('express');
const { requestLogger } = require('../middleware/logger');

const app = express();
const PORT = process.env.ADMIN_SERVICE_PORT || 3016;

app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

app.get('/health', (req, res) =>
  res.json({ status: 'healthy', service: 'careconnect-admin', uptime: process.uptime() })
);

app.use('/api/admin', require('../routes/admin'));

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));
app.use((err, req, res, next) => res.status(500).json({ error: 'Internal server error' }));

app.listen(PORT, '127.0.0.1', () =>
  console.log(`careconnect-admin running on :${PORT}`)
);
