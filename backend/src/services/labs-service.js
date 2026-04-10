'use strict';
process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'careconnect-labs';

require('dotenv').config();
require('../tracing');

const express = require('express');
const { requestLogger } = require('../middleware/logger');

const app = express();
const PORT = process.env.LABS_SERVICE_PORT || 3012;

app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

app.get('/health', (req, res) =>
  res.json({ status: 'healthy', service: 'careconnect-labs', uptime: process.uptime() })
);

app.use('/api/labs',        require('../routes/labs'));
app.use('/api/medications', require('../routes/medications'));

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));
app.use((err, req, res, next) => res.status(500).json({ error: 'Internal server error' }));

app.listen(PORT, '127.0.0.1', () =>
  console.log(`careconnect-labs running on :${PORT}`)
);
