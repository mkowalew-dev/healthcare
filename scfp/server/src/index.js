'use strict';

require('dotenv').config();
const { getTraceContext } = require('./tracing');

const express = require('express');
const cors = require('cors');
const winston = require('winston');
const { SensorSimulator } = require('./sensor-sim');

const PORT = parseInt(process.env.SCFP_PORT || '3030', 10);
const ROOM_COUNT = parseInt(process.env.SCFP_ROOM_COUNT || '24', 10);
const EVENT_INTERVAL_MS = parseInt(process.env.SCFP_EVENT_INTERVAL_MS || '8000', 10);
const LOG_DIR = process.env.LOG_DIR || '/var/log/careconnect';

// ── Logger ───────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'careconnect-scfp' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: `${LOG_DIR}/scfp-out.log`,
      handleExceptions: true,
    }),
  ],
});

// ── Sensor simulator ─────────────────────────────────────────
const sim = new SensorSimulator(ROOM_COUNT, EVENT_INTERVAL_MS);
sim.start();

// ── Express app ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Request logger (injects trace context for Splunk log→trace correlation)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      ...getTraceContext(),
    });
  });
  next();
});

// ── Health / probe ───────────────────────────────────────────
app.get('/ping', (_req, res) => res.send('pong'));

app.get('/health', (_req, res) => {
  const stats = sim.getStats();
  res.json({ status: 'ok', ...stats });
});

// ── Rooms ────────────────────────────────────────────────────
app.get('/api/rooms', (req, res) => {
  const rooms = sim.getRooms({
    unit: req.query.unit,
    type: req.query.type,
    occupied: req.query.occupied !== undefined ? req.query.occupied === 'true' : undefined,
    fall_risk: req.query.fall_risk,
  });
  res.json({ rooms, count: rooms.length });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = sim.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const events = sim.getRoomEvents(room.id, 10);
  res.json({ room, recent_events: events });
});

app.get('/api/rooms/:id/events', (req, res) => {
  const room = sim.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const events = sim.getRoomEvents(room.id, limit);
  res.json({ room_id: room.id, room_number: room.room_number, events, count: events.length });
});

// ── Events ───────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const events = sim.getRecentEvents(limit);
  res.json({ events, count: events.length });
});

app.get('/api/events/falls', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const events = sim.getFallEvents(limit);
  res.json({ fall_events: events, count: events.length });
});

// ── Alerts ───────────────────────────────────────────────────
app.get('/api/alerts', (req, res) => {
  const filter = {
    severity: req.query.severity,
    unit: req.query.unit,
    acknowledged: req.query.acknowledged !== undefined
      ? req.query.acknowledged === 'true'
      : false,
    limit: Math.min(parseInt(req.query.limit || '50', 10), 200),
  };
  const alerts = sim.getAlerts(filter);
  res.json({ alerts, count: alerts.length });
});

app.patch('/api/alerts/:id/ack', (req, res) => {
  const ok = sim.acknowledgeAlert(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Alert not found' });
  logger.info('alert_acknowledged', { alert_id: req.params.id, ...getTraceContext() });
  res.json({ success: true, alert_id: req.params.id, acknowledged_at: new Date().toISOString() });
});

// ── Virtual Sitter ────────────────────────────────────────────
app.get('/api/sitters', (_req, res) => {
  const sitters = sim.getSitters();
  res.json({ sitters, count: sitters.length });
});

app.post('/api/sitters', (req, res) => {
  const { room_id, indication, requested_by } = req.body;
  if (!room_id) return res.status(400).json({ error: 'room_id required' });
  const result = sim.startSitter(room_id, indication, requested_by);
  if (result.error) return res.status(400).json(result);
  logger.info('sitter_assigned', {
    sitter_id: result.id,
    room_id,
    indication: result.indication,
    assigned_to: result.assigned_to,
    ...getTraceContext(),
  });
  res.status(201).json(result);
});

app.delete('/api/sitters/:id', (req, res) => {
  const ok = sim.endSitter(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Sitter session not found' });
  logger.info('sitter_ended', { sitter_id: req.params.id, ...getTraceContext() });
  res.json({ success: true, sitter_id: req.params.id });
});

// ── AI Staff Workflow ─────────────────────────────────────────
app.get('/api/staff/workflow', (_req, res) => {
  const recommendations = sim.getWorkflowRecommendations();
  res.json({
    generated_at: new Date().toISOString(),
    recommendations,
    count: recommendations.length,
  });
});

// ── Stats ─────────────────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  res.json(sim.getStats());
});

// ── Server ────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info('scfp_started', { port: PORT, rooms: ROOM_COUNT, event_interval_ms: EVENT_INTERVAL_MS });
  console.log(`[scfp] Smart Care Facility Platform listening on :${PORT}`);
  console.log(`[scfp] Monitoring ${ROOM_COUNT} rooms — event interval ${EVENT_INTERVAL_MS}ms`);
});

process.on('SIGTERM', () => {
  sim.stop();
  server.close(() => process.exit(0));
});
