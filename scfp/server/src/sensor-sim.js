'use strict';

// ── Smart Care Facility Platform — Room Sensor Simulator
//
// Models an ambient intelligence sensor layer for AI-powered room monitoring.
// Each room has a virtual sensor array:
//   - Passive infrared (PIR) motion detection
//   - Bed exit / mat pressure sensor
//   - Fall detection camera (AI vision inference)
//   - Staff badge proximity (RTLS)
//   - Noise level (decibel threshold)
//   - Air quality index (CO2 ppm proxy)
//
// Events are generated on a configurable interval and pushed into an
// in-memory ring buffer consumed by the REST API.

const { v4: uuidv4 } = require('uuid');

const ROOM_TYPES = ['ICU', 'ICU', 'Step-Down', 'Step-Down', 'Med-Surg', 'Med-Surg', 'Med-Surg', 'Med-Surg'];
const UNITS = ['3-North', '3-South', '4-North', '4-South', '5-North', '5-South'];
const FALL_RISK = ['low', 'low', 'low', 'moderate', 'moderate', 'high'];

const PATIENT_NAMES = [
  'Margaret Okonkwo', 'Robert Thornton', 'Yuki Tanaka', 'Carlos Mendes',
  'Edith Vasquez', 'Harold Nguyen', 'Beatrice Osei', 'James Callahan',
  'Priya Sharma', 'Gerald Lindqvist', 'Florence Adeyemi', 'Walter Kowalski',
  'Ingrid Björk', 'Samuel Oduya', 'Constance Park', 'Raymond Dubois',
  'Hildegard Müller', 'Antonio Ferreira', 'Gladys Nakamura', 'Bernard Achebe',
  'Leonora Vega', 'Winston Obi', 'Dorothea Papadopoulos', 'Alastair McGrath',
];

const EVENT_TYPES = [
  { type: 'motion_detected', severity: 'info', weight: 30 },
  { type: 'bed_exit_detected', severity: 'warning', weight: 15 },
  { type: 'staff_entry', severity: 'info', weight: 20 },
  { type: 'staff_exit', severity: 'info', weight: 20 },
  { type: 'call_light_activated', severity: 'warning', weight: 10 },
  { type: 'inactivity_alert', severity: 'warning', weight: 8 },
  { type: 'fall_detected', severity: 'critical', weight: 2 },
  { type: 'noise_threshold_exceeded', severity: 'info', weight: 10 },
  { type: 'isolation_breach_detected', severity: 'warning', weight: 3 },
  { type: 'wander_detected', severity: 'critical', weight: 2 },
];

const SITTER_INDICATIONS = [
  'fall_risk', 'confusion', 'agitation', 'wander_risk',
  'post_procedure_monitoring', 'suicidal_ideation',
];

const VIRTUAL_SITTER_IDS = ['VST-01', 'VST-02', 'VST-03', 'VST-04', 'VST-05', 'VST-06'];

const MAX_EVENTS = 500;

class SensorSimulator {
  constructor(roomCount, eventIntervalMs) {
    this.roomCount = roomCount;
    this.eventIntervalMs = eventIntervalMs;
    this.rooms = this._initRooms();
    this.events = [];       // ring buffer of recent events
    this.alerts = [];       // active alert queue
    this.sitters = [];      // active virtual sitter sessions
    this._timer = null;
    this.startTime = Date.now();
  }

  _initRooms() {
    const rooms = [];
    for (let i = 0; i < this.roomCount; i++) {
      const roomNum = 300 + i + 1;
      const unit = UNITS[i % UNITS.length];
      const roomType = ROOM_TYPES[i % ROOM_TYPES.length];
      const fallRisk = FALL_RISK[i % FALL_RISK.length];
      const occupied = Math.random() > 0.15;  // 85% occupancy

      rooms.push({
        id: `room-${roomNum}`,
        room_number: String(roomNum),
        unit,
        type: roomType,
        occupied,
        patient_name: occupied ? PATIENT_NAMES[i % PATIENT_NAMES.length] : null,
        patient_id: occupied ? `PT-${10000 + i}` : null,
        fall_risk: occupied ? fallRisk : 'none',
        fall_risk_score: occupied ? this._fallRiskScore(fallRisk) : 0,
        staff_present: false,
        last_staff_entry: null,
        last_motion: null,
        last_bed_exit: null,
        call_light_active: false,
        sensor_status: 'online',
        air_quality_ppm: 450 + Math.floor(Math.random() * 200),
        noise_db: 38 + Math.floor(Math.random() * 12),
        ai_monitoring_active: roomType === 'ICU' || fallRisk === 'high',
        created_at: new Date().toISOString(),
      });
    }
    return rooms;
  }

  _fallRiskScore(risk) {
    const base = { low: 15, moderate: 45, high: 78 };
    const b = base[risk] ?? 0;
    return Math.min(100, b + Math.floor(Math.random() * 15));
  }

  _weightedEventType() {
    const total = EVENT_TYPES.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const ev of EVENT_TYPES) {
      r -= ev.weight;
      if (r <= 0) return ev;
    }
    return EVENT_TYPES[0];
  }

  _generateEvent() {
    // Pick a random occupied room
    const occupied = this.rooms.filter(r => r.occupied);
    if (occupied.length === 0) return;

    const room = occupied[Math.floor(Math.random() * occupied.length)];
    const evDef = this._weightedEventType();
    const now = new Date().toISOString();

    const event = {
      id: uuidv4(),
      room_id: room.id,
      room_number: room.room_number,
      unit: room.unit,
      patient_name: room.patient_name,
      patient_id: room.patient_id,
      type: evDef.type,
      severity: evDef.severity,
      timestamp: now,
      ai_confidence: evDef.type === 'fall_detected'
        ? 0.85 + Math.random() * 0.14
        : null,
      acknowledged: false,
    };

    // Update room state
    if (evDef.type === 'staff_entry') room.staff_present = true;
    if (evDef.type === 'staff_exit') room.staff_present = false;
    if (evDef.type === 'motion_detected') room.last_motion = now;
    if (evDef.type === 'bed_exit_detected') room.last_bed_exit = now;
    if (evDef.type === 'call_light_activated') room.call_light_active = true;
    if (evDef.type === 'noise_threshold_exceeded') room.noise_db = 65 + Math.floor(Math.random() * 20);

    // Push alert for warning/critical events
    if (evDef.severity === 'warning' || evDef.severity === 'critical') {
      this.alerts.unshift({
        id: uuidv4(),
        event_id: event.id,
        room_id: room.id,
        room_number: room.room_number,
        unit: room.unit,
        patient_name: room.patient_name,
        patient_id: room.patient_id,
        type: evDef.type,
        severity: evDef.severity,
        message: this._alertMessage(evDef.type, room),
        timestamp: now,
        acknowledged: false,
        escalated: evDef.severity === 'critical',
      });
      if (this.alerts.length > 100) this.alerts.length = 100;
    }

    // Tag event if virtual sitter is watching this room
    const sitter = this.sitters.find(s => s.room_id === room.id);
    if (sitter) {
      event.sitter_active = true;
      event.sitter_id = sitter.id;
      sitter.events_observed += 1;
    }

    // Ring buffer
    this.events.unshift(event);
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
  }

  _alertMessage(type, room) {
    const p = room.patient_name || 'Unknown patient';
    const r = `Room ${room.room_number} (${room.unit})`;
    const messages = {
      fall_detected:            `FALL DETECTED — ${p} in ${r}. AI confidence: high. Immediate response required.`,
      wander_detected:          `WANDER ALERT — ${p} in ${r}. Patient approaching door/exit zone. Immediate response required.`,
      bed_exit_detected:        `Bed exit detected — ${p} in ${r}. Fall risk: ${room.fall_risk}.`,
      call_light_activated:     `Call light active — ${p} in ${r}. Patient needs assistance.`,
      inactivity_alert:         `Inactivity alert — No movement detected for ${p} in ${r} for 45+ minutes.`,
      isolation_breach_detected:`Isolation breach — Staff entered ${r} without PPE detection. Patient: ${p}.`,
      noise_threshold_exceeded: `Noise alert — Noise level exceeded 65 dB in ${r}. Patient: ${p}.`,
    };
    return messages[type] || `Alert: ${type} in ${r}.`;
  }

  _generateWorkflowRecommendations() {
    const recs = [];
    const highRisk = this.rooms.filter(r => r.occupied && r.fall_risk === 'high');
    const callLights = this.rooms.filter(r => r.call_light_active);
    const noStaff = this.rooms.filter(r => r.occupied && !r.staff_present && r.type === 'ICU');

    highRisk.forEach(r => recs.push({
      id: uuidv4(),
      priority: 'high',
      type: 'fall_prevention_rounding',
      room_id: r.id,
      room_number: r.room_number,
      unit: r.unit,
      patient_name: r.patient_name,
      recommendation: `Increase rounding frequency — ${r.patient_name} (Room ${r.room_number}) has fall risk score ${r.fall_risk_score}/100. Recommend 30-min rounding.`,
      created_at: new Date().toISOString(),
    }));

    callLights.forEach(r => recs.push({
      id: uuidv4(),
      priority: 'medium',
      type: 'call_light_response',
      room_id: r.id,
      room_number: r.room_number,
      unit: r.unit,
      patient_name: r.patient_name,
      recommendation: `Call light response needed — ${r.patient_name} in Room ${r.room_number} has an active call.`,
      created_at: new Date().toISOString(),
    }));

    noStaff.slice(0, 3).forEach(r => recs.push({
      id: uuidv4(),
      priority: 'low',
      type: 'icu_rounding_due',
      room_id: r.id,
      room_number: r.room_number,
      unit: r.unit,
      patient_name: r.patient_name,
      recommendation: `ICU rounding due — No staff detected in Room ${r.room_number} for over 60 minutes.`,
      created_at: new Date().toISOString(),
    }));

    return recs;
  }

  // ── Virtual Sitter management ───────────────────────────────

  startSitter(roomId, indication, requestedBy) {
    const room = this.rooms.find(r => r.id === roomId);
    if (!room) return { error: 'Room not found' };
    if (!room.occupied) return { error: 'Room is not occupied' };
    if (this.sitters.find(s => s.room_id === roomId)) return { error: 'Sitter already assigned to this room' };

    const usedIds = new Set(this.sitters.map(s => s.assigned_to));
    const sitterId = VIRTUAL_SITTER_IDS.find(id => !usedIds.has(id)) || `VST-0${this.sitters.length + 1}`;

    const sitter = {
      id: uuidv4(),
      room_id: roomId,
      room_number: room.room_number,
      unit: room.unit,
      patient_name: room.patient_name,
      patient_id: room.patient_id,
      fall_risk: room.fall_risk,
      indication: indication || 'fall_risk',
      assigned_to: sitterId,
      requested_by: requestedBy || 'charge_nurse',
      started_at: new Date().toISOString(),
      video_feed_status: 'active',
      events_observed: 0,
    };
    this.sitters.push(sitter);
    return sitter;
  }

  endSitter(sitterId) {
    const idx = this.sitters.findIndex(s => s.id === sitterId);
    if (idx === -1) return false;
    this.sitters.splice(idx, 1);
    return true;
  }

  getSitters() {
    return [...this.sitters];
  }

  start() {
    // Seed a couple of sitters on high-risk rooms to pre-populate the list
    const highRiskRooms = this.rooms.filter(r => r.occupied && r.fall_risk === 'high').slice(0, 2);
    for (const room of highRiskRooms) this.startSitter(room.id, 'fall_risk', 'charge_nurse');

    // Generate an initial batch of events
    for (let i = 0; i < 20; i++) this._generateEvent();

    this._timer = setInterval(() => {
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) this._generateEvent();
    }, this.eventIntervalMs);

    console.log(`[sensor-sim] Started — ${this.roomCount} rooms, event interval ${this.eventIntervalMs}ms`);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }

  getRooms(filter = {}) {
    let result = [...this.rooms];
    if (filter.unit) result = result.filter(r => r.unit === filter.unit);
    if (filter.type) result = result.filter(r => r.type === filter.type);
    if (filter.occupied !== undefined) result = result.filter(r => r.occupied === filter.occupied);
    if (filter.fall_risk) result = result.filter(r => r.fall_risk === filter.fall_risk);
    return result;
  }

  getRoom(id) {
    return this.rooms.find(r => r.id === id) || null;
  }

  getRoomEvents(roomId, limit = 20) {
    return this.events.filter(e => e.room_id === roomId).slice(0, limit);
  }

  getRecentEvents(limit = 50) {
    return this.events.slice(0, limit);
  }

  getFallEvents(limit = 20) {
    return this.events.filter(e => e.type === 'fall_detected').slice(0, limit);
  }

  getAlerts(filter = {}) {
    let result = [...this.alerts];
    if (filter.severity) result = result.filter(a => a.severity === filter.severity);
    if (filter.acknowledged !== undefined) result = result.filter(a => a.acknowledged === filter.acknowledged);
    if (filter.unit) result = result.filter(a => a.unit === filter.unit);
    return result.slice(0, filter.limit || 50);
  }

  acknowledgeAlert(id) {
    const alert = this.alerts.find(a => a.id === id);
    if (!alert) return false;
    alert.acknowledged = true;
    alert.acknowledged_at = new Date().toISOString();
    const room = this.rooms.find(r => r.id === alert.room_id);
    if (room && alert.type === 'call_light_activated') room.call_light_active = false;
    return true;
  }

  getWorkflowRecommendations() {
    return this._generateWorkflowRecommendations();
  }

  getStats() {
    const occupied = this.rooms.filter(r => r.occupied).length;
    const fallEvents24h = this.events.filter(e =>
      e.type === 'fall_detected' &&
      Date.now() - new Date(e.timestamp).getTime() < 86400000
    ).length;
    const activeAlerts = this.alerts.filter(a => !a.acknowledged).length;
    const criticalAlerts = this.alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length;
    const highRiskCount = this.rooms.filter(r => r.occupied && r.fall_risk === 'high').length;
    const sitterCoverage = highRiskCount > 0
      ? Math.round((this.sitters.length / highRiskCount) * 100)
      : 0;

    return {
      total_rooms: this.rooms.length,
      occupied_rooms: occupied,
      occupancy_rate: Math.round((occupied / this.rooms.length) * 100),
      staff_present_count: this.rooms.filter(r => r.staff_present).length,
      call_lights_active: this.rooms.filter(r => r.call_light_active).length,
      active_alerts: activeAlerts,
      critical_alerts: criticalAlerts,
      fall_events_24h: fallEvents24h,
      total_events_buffered: this.events.length,
      high_fall_risk_patients: highRiskCount,
      ai_monitoring_active: this.rooms.filter(r => r.ai_monitoring_active).length,
      virtual_sitters_active: this.sitters.length,
      sitter_coverage_pct: sitterCoverage,
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}

module.exports = { SensorSimulator };
