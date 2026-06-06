'use strict';

// ── Continuous Patient Monitoring — Vital Sign Simulator + NEWS2 EWS
//
// Models a predictive patient monitoring layer with continuous vital sign streaming.
// Each patient has a virtual monitoring device with continuous vital streams.
//
// NEWS2 (National Early Warning Score 2) is calculated per reading:
//   Respiration Rate  : 0–3 points
//   SpO2 (Scale 1)    : 0–3 points
//   Supplemental O2   : 2 points if on O2
//   Systolic BP       : 0–3 points
//   Heart Rate        : 0–3 points
//   Level of Conscious: 0 (Alert) or 3 (any CVPU)
//   Temperature       : 0–3 points
//
//   Total 0–4 = Low; 5–6 = Medium; 7+ = High

const { v4: uuidv4 } = require('uuid');

const PATIENT_NAMES = [
  'Margaret Okonkwo', 'Robert Thornton', 'Yuki Tanaka', 'Carlos Mendes',
  'Edith Vasquez', 'Harold Nguyen', 'Beatrice Osei', 'James Callahan',
  'Priya Sharma', 'Gerald Lindqvist', 'Florence Adeyemi', 'Walter Kowalski',
  'Ingrid Björk', 'Samuel Oduya', 'Constance Park', 'Raymond Dubois',
  'Hildegard Müller', 'Antonio Ferreira', 'Gladys Nakamura', 'Bernard Achebe',
];

const DEVICE_TYPES = [
  'Masimo Radius PPG Wristband',
  'Philips IntelliVue MX40',
  'GE Carescape B650',
  'Nihon Kohden BSM-6501',
  'BioIntelliSense BioSticker',
  'Current Health Wearable Patch',
  'Bardy Diagnostics CAM Patch',
];

const DIAGNOSES = [
  'COPD exacerbation', 'CHF decompensation', 'Sepsis', 'Post-op thoracotomy',
  'Pneumonia', 'AKI on CKD', 'DKA', 'STEMI post-cath', 'GI bleed',
  'Pulmonary embolism', 'Stroke', 'Hip fracture post-op', 'UTI',
  'Cellulitis', 'Alcohol withdrawal', 'Liver failure', 'Pancreatitis',
  'Hypertensive urgency', 'Atrial fibrillation', 'Respiratory failure',
];

const VITAL_HISTORY_SIZE = 24;   // readings per patient

// NEWS2 scoring functions
function scoreRR(rr) {
  if (rr <= 8) return 3;
  if (rr <= 11) return 1;
  if (rr <= 20) return 0;
  if (rr <= 24) return 2;
  return 3;
}
function scoreSpO2(spo2) {
  if (spo2 >= 96) return 0;
  if (spo2 >= 94) return 1;
  if (spo2 >= 92) return 2;
  return 3;
}
function scoreSBP(sbp) {
  if (sbp <= 90) return 3;
  if (sbp <= 100) return 2;
  if (sbp <= 110) return 1;
  if (sbp <= 219) return 0;
  return 3;
}
function scoreHR(hr) {
  if (hr <= 40) return 3;
  if (hr <= 50) return 1;
  if (hr <= 90) return 0;
  if (hr <= 110) return 1;
  if (hr <= 130) return 2;
  return 3;
}
function scoreTemp(temp) {
  if (temp <= 35.0) return 3;
  if (temp <= 36.0) return 1;
  if (temp <= 38.0) return 0;
  if (temp <= 39.0) return 1;
  return 2;
}

function calculateNEWS2(v) {
  const score =
    scoreRR(v.rr) +
    scoreSpO2(v.spo2) +
    (v.supplemental_o2 ? 2 : 0) +
    scoreSBP(v.sbp) +
    scoreHR(v.hr) +
    (v.avpu !== 'A' ? 3 : 0) +
    scoreTemp(v.temp);

  let risk;
  if (score <= 4) risk = 'low';
  else if (score <= 6) risk = 'medium';
  else risk = 'high';

  return { score, risk };
}

// Random variation around a baseline with clamping
function vary(base, delta, min, max) {
  const v = base + (Math.random() * 2 - 1) * delta;
  return Math.round(Math.max(min, Math.min(max, v)) * 10) / 10;
}

class VitalSimulator {
  constructor(deviceCount, intervalMs) {
    this.deviceCount = deviceCount;
    this.intervalMs = intervalMs;
    this.patients = this._initPatients();
    this.alerts = [];
    this._timer = null;
    this.startTime = Date.now();
  }

  _initPatients() {
    return Array.from({ length: this.deviceCount }, (_, i) => {
      // Base vitals with some patients set up to be unstable
      const unstable = i < 4;  // first 4 patients are more likely to deteriorate
      const baseline = {
        rr: unstable ? 22 + Math.floor(Math.random() * 6) : 14 + Math.floor(Math.random() * 6),
        spo2: unstable ? 90 + Math.floor(Math.random() * 4) : 96 + Math.floor(Math.random() * 4),
        sbp: unstable ? 95 + Math.floor(Math.random() * 20) : 120 + Math.floor(Math.random() * 30),
        dbp: unstable ? 60 + Math.floor(Math.random() * 10) : 75 + Math.floor(Math.random() * 15),
        hr: unstable ? 105 + Math.floor(Math.random() * 25) : 65 + Math.floor(Math.random() * 25),
        temp: unstable ? 37.8 + Math.random() * 0.8 : 36.5 + Math.random() * 0.8,
        supplemental_o2: unstable,
        avpu: unstable && Math.random() > 0.7 ? 'V' : 'A',
      };

      const readings = this._generateInitialReadings(baseline, 12);
      const latest = readings[0];
      const ews = calculateNEWS2(latest);

      return {
        id: `PT-${10000 + i}`,
        name: PATIENT_NAMES[i % PATIENT_NAMES.length],
        age: 45 + Math.floor(Math.random() * 45),
        room_number: String(301 + i),
        unit: i < 8 ? 'ICU' : i < 14 ? 'Step-Down' : 'Med-Surg',
        diagnosis: DIAGNOSES[i % DIAGNOSES.length],
        device_id: `DEV-${2000 + i}`,
        device_type: DEVICE_TYPES[i % DEVICE_TYPES.length],
        device_battery: 60 + Math.floor(Math.random() * 40),
        device_signal: ['excellent', 'good', 'fair'][Math.floor(Math.random() * 3)],
        baseline,
        readings,
        current_ews: ews.score,
        current_risk: ews.risk,
        trend: 'stable',
        in_alert: ews.risk === 'high' || (ews.risk === 'medium' && unstable),
        monitoring_start: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
      };
    });
  }

  _generateInitialReadings(baseline, count) {
    return Array.from({ length: count }, (_, i) => {
      const ts = new Date(Date.now() - i * this.intervalMs).toISOString();
      const v = this._readingFromBaseline(baseline, ts);
      return v;
    });
  }

  _readingFromBaseline(baseline, ts) {
    const rr = Math.round(vary(baseline.rr, 2, 6, 40));
    const spo2 = Math.round(vary(baseline.spo2, 1.5, 70, 100));
    const sbp = Math.round(vary(baseline.sbp, 8, 70, 240));
    const dbp = Math.round(vary(baseline.dbp, 5, 40, 140));
    const hr = Math.round(vary(baseline.hr, 5, 30, 180));
    const temp = Math.round(vary(baseline.temp, 0.2, 34, 41) * 10) / 10;
    const avpu = baseline.avpu;
    const sO2 = baseline.supplemental_o2;

    const { score, risk } = calculateNEWS2({ rr, spo2, sbp, hr, temp, avpu, supplemental_o2: sO2 });

    return {
      id: uuidv4(),
      timestamp: ts || new Date().toISOString(),
      rr,
      spo2,
      sbp,
      dbp,
      hr,
      temp,
      supplemental_o2: sO2,
      avpu,
      news2_score: score,
      news2_risk: risk,
      map: Math.round((sbp + 2 * dbp) / 3),
    };
  }

  _generateReading(patient) {
    const ts = new Date().toISOString();
    const reading = this._readingFromBaseline(patient.baseline, ts);

    // Push to front of ring buffer
    patient.readings.unshift(reading);
    if (patient.readings.length > VITAL_HISTORY_SIZE) patient.readings.length = VITAL_HISTORY_SIZE;

    // Trend calculation
    if (patient.readings.length >= 3) {
      const prev = patient.readings[2].news2_score;
      const curr = reading.news2_score;
      if (curr > prev + 1) patient.trend = 'deteriorating';
      else if (curr < prev - 1) patient.trend = 'improving';
      else patient.trend = 'stable';
    }

    patient.current_ews = reading.news2_score;
    patient.current_risk = reading.news2_risk;

    // Generate alert if high risk and not already in alert
    if (reading.news2_risk === 'high' && !patient.in_alert) {
      patient.in_alert = true;
      const alert = {
        id: uuidv4(),
        patient_id: patient.id,
        patient_name: patient.name,
        room_number: patient.room_number,
        unit: patient.unit,
        type: 'news2_high',
        severity: 'critical',
        news2_score: reading.news2_score,
        message: `NEWS2 HIGH — ${patient.name} (Room ${patient.room_number}): score ${reading.news2_score}. Immediate clinical review required.`,
        vitals_summary: `HR ${reading.hr} | BP ${reading.sbp}/${reading.dbp} | SpO₂ ${reading.spo2}% | RR ${reading.rr} | Temp ${reading.temp}°C`,
        timestamp: ts,
        acknowledged: false,
        trend: patient.trend,
      };
      this.alerts.unshift(alert);
      if (this.alerts.length > 100) this.alerts.length = 100;
    } else if (reading.news2_risk !== 'high') {
      patient.in_alert = false;
    }

    // Medium risk advisory
    if (reading.news2_risk === 'medium' && patient.trend === 'deteriorating') {
      const exists = this.alerts.some(
        a => a.patient_id === patient.id && a.type === 'news2_medium' && !a.acknowledged
      );
      if (!exists) {
        this.alerts.unshift({
          id: uuidv4(),
          patient_id: patient.id,
          patient_name: patient.name,
          room_number: patient.room_number,
          unit: patient.unit,
          type: 'news2_medium',
          severity: 'warning',
          news2_score: reading.news2_score,
          message: `NEWS2 MEDIUM (deteriorating trend) — ${patient.name} (Room ${patient.room_number}): score ${reading.news2_score}.`,
          vitals_summary: `HR ${reading.hr} | BP ${reading.sbp}/${reading.dbp} | SpO₂ ${reading.spo2}% | RR ${reading.rr} | Temp ${reading.temp}°C`,
          timestamp: ts,
          acknowledged: false,
          trend: patient.trend,
        });
        if (this.alerts.length > 100) this.alerts.length = 100;
      }
    }
  }

  start() {
    this._timer = setInterval(() => {
      for (const patient of this.patients) {
        this._generateReading(patient);
      }
    }, this.intervalMs);
    console.log(`[vital-sim] Started — ${this.deviceCount} patients, interval ${this.intervalMs}ms`);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }

  getPatients(filter = {}) {
    let result = [...this.patients];
    if (filter.unit) result = result.filter(p => p.unit === filter.unit);
    if (filter.risk) result = result.filter(p => p.current_risk === filter.risk);
    if (filter.in_alert !== undefined) result = result.filter(p => p.in_alert === filter.in_alert);
    return result.map(p => ({
      id: p.id, name: p.name, age: p.age, room_number: p.room_number, unit: p.unit,
      diagnosis: p.diagnosis, device_id: p.device_id, device_type: p.device_type,
      device_battery: p.device_battery, device_signal: p.device_signal,
      current_ews: p.current_ews, current_risk: p.current_risk, trend: p.trend,
      in_alert: p.in_alert, latest_vitals: p.readings[0] || null,
    }));
  }

  getPatient(id) {
    return this.patients.find(p => p.id === id) || null;
  }

  getVitals(patientId, limit = 12) {
    const p = this.patients.find(x => x.id === patientId);
    if (!p) return null;
    return p.readings.slice(0, limit);
  }

  getEWS(patientId) {
    const p = this.patients.find(x => x.id === patientId);
    if (!p) return null;
    const latest = p.readings[0];
    if (!latest) return null;
    return {
      patient_id: p.id,
      patient_name: p.name,
      room_number: p.room_number,
      unit: p.unit,
      score: latest.news2_score,
      risk: latest.news2_risk,
      trend: p.trend,
      components: {
        respiration_rate: { value: latest.rr, score: scoreRR(latest.rr) },
        spo2: { value: latest.spo2, score: scoreSpO2(latest.spo2) },
        supplemental_o2: { value: latest.supplemental_o2, score: latest.supplemental_o2 ? 2 : 0 },
        systolic_bp: { value: latest.sbp, score: scoreSBP(latest.sbp) },
        heart_rate: { value: latest.hr, score: scoreHR(latest.hr) },
        consciousness: { value: latest.avpu, score: latest.avpu !== 'A' ? 3 : 0 },
        temperature: { value: latest.temp, score: scoreTemp(latest.temp) },
      },
      calculated_at: latest.timestamp,
    };
  }

  getAlerts(filter = {}) {
    let result = [...this.alerts];
    if (filter.severity) result = result.filter(a => a.severity === filter.severity);
    if (filter.acknowledged !== undefined) result = result.filter(a => a.acknowledged === filter.acknowledged);
    return result.slice(0, filter.limit || 50);
  }

  acknowledgeAlert(id) {
    const alert = this.alerts.find(a => a.id === id);
    if (!alert) return false;
    alert.acknowledged = true;
    alert.acknowledged_at = new Date().toISOString();
    return true;
  }

  getDevices() {
    return this.patients.map(p => ({
      device_id: p.device_id,
      device_type: p.device_type,
      patient_id: p.id,
      patient_name: p.name,
      room_number: p.room_number,
      battery: p.device_battery,
      signal: p.device_signal,
      status: 'online',
      last_reading: p.readings[0]?.timestamp || null,
    }));
  }

  getStats() {
    const highRisk = this.patients.filter(p => p.current_risk === 'high').length;
    const medRisk = this.patients.filter(p => p.current_risk === 'medium').length;
    const deteriorating = this.patients.filter(p => p.trend === 'deteriorating').length;
    const activeAlerts = this.alerts.filter(a => !a.acknowledged).length;
    const critAlerts = this.alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length;

    return {
      monitored_patients: this.patients.length,
      high_risk_patients: highRisk,
      medium_risk_patients: medRisk,
      low_risk_patients: this.patients.length - highRisk - medRisk,
      deteriorating_trend: deteriorating,
      active_alerts: activeAlerts,
      critical_alerts: critAlerts,
      avg_ews: Math.round(this.patients.reduce((s, p) => s + p.current_ews, 0) / this.patients.length * 10) / 10,
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}

module.exports = { VitalSimulator };
