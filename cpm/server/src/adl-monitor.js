'use strict';

// ── ADL (Activities of Daily Living) Monitor
//
// Behavioral pattern monitoring: detects deviations from an individual's
// own baseline across 6 ADL domains, predicting health decline 1-3 days
// before clinical signs appear.
//
// Domains: mobility, nutrition, sleep, hygiene, toileting, social engagement.
// Deviation is scored 0-100 relative to each patient's personal 7-day baseline.

const { v4: uuidv4 } = require('uuid');

const ADL_DOMAINS = [
  { key: 'mobility',   label: 'Mobility',           unit: 'steps/day',           baseline: [800,  2500] },
  { key: 'nutrition',  label: 'Nutrition',           unit: '% meal completion',   baseline: [60,   90]   },
  { key: 'sleep',      label: 'Sleep',               unit: 'hours/night',         baseline: [4.0,  7.0]  },
  { key: 'hygiene',    label: 'Hygiene',             unit: 'self-care events/day', baseline: [1,    2]   },
  { key: 'toileting',  label: 'Toileting',           unit: 'visits/day',          baseline: [3,    6]    },
  { key: 'social',     label: 'Social Engagement',   unit: 'engagement score/10', baseline: [3,    7]    },
];

function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function deviationScore(current, baseline) {
  if (baseline === 0) return 0;
  return Math.min(100, Math.round(Math.abs((current - baseline) / baseline) * 100));
}

function adlRisk(composite) {
  if (composite >= 30) return 'high';
  if (composite >= 15) return 'moderate';
  return 'low';
}

class ADLMonitor {
  constructor(patientCount) {
    this.patientCount = patientCount;
    this.patients = this._initPatients();
    this.alerts = [];
    this._timer = null;
    this.startTime = Date.now();
  }

  _initPatients() {
    return Array.from({ length: this.patientCount }, (_, i) => {
      const atRisk = i < 6;
      const domains = {};

      for (const d of ADL_DOMAINS) {
        const [lo, hi] = d.baseline;
        const baseline = rand(lo, hi);
        const deviationMag = atRisk ? rand(0.35, 0.60) : rand(0.03, 0.12);
        const direction = Math.random() > 0.5 ? 1 : -1;
        const current = clamp(baseline * (1 + direction * deviationMag), 0, hi * 2);

        const history = Array.from({ length: 7 }, (_, day) => {
          const dayMag = deviationMag * clamp(1 - day * 0.08, 0.2, 1);
          const dayDir = Math.random() > 0.5 ? 1 : -1;
          const val = clamp(baseline * (1 + dayDir * dayMag * rand(0.5, 1.2)), 0, hi * 2);
          return {
            date: new Date(Date.now() - day * 86400000).toISOString().split('T')[0],
            value: Math.round(val * 10) / 10,
          };
        });

        const dev = deviationScore(current, baseline);
        let trend = 'stable';
        if (atRisk && deviationMag > 0.4) trend = 'deteriorating';

        domains[d.key] = {
          label: d.label,
          unit: d.unit,
          baseline: Math.round(baseline * 10) / 10,
          current: Math.round(current * 10) / 10,
          deviation_score: dev,
          trend,
          history,
        };
      }

      const composite = Math.round(
        Object.values(domains).reduce((s, d) => s + d.deviation_score, 0) / ADL_DOMAINS.length
      );

      return {
        patient_id: `PT-${10000 + i}`,
        domains,
        adl_composite_score: composite,
        adl_risk: adlRisk(composite),
        last_updated: new Date().toISOString(),
        in_alert: composite >= 30,
      };
    });
  }

  _tick() {
    const now = new Date().toISOString();

    for (const pt of this.patients) {
      let compositeSum = 0;

      for (const d of ADL_DOMAINS) {
        const dom = pt.domains[d.key];
        const drift = rand(-0.04, 0.04);
        dom.current = clamp(
          Math.round(dom.current * (1 + drift) * 10) / 10,
          0,
          dom.baseline * 3
        );
        dom.deviation_score = deviationScore(dom.current, dom.baseline);

        const recentAvg = dom.history.slice(0, 3).reduce((s, h) => s + h.value, 0) / 3;
        if (dom.current < recentAvg * 0.88)       dom.trend = 'deteriorating';
        else if (dom.current > recentAvg * 1.12)  dom.trend = 'improving';
        else                                       dom.trend = 'stable';

        compositeSum += dom.deviation_score;
      }

      const composite = Math.round(compositeSum / ADL_DOMAINS.length);
      pt.adl_composite_score = composite;
      pt.adl_risk = adlRisk(composite);
      pt.last_updated = now;

      if (composite >= 30 && !pt.in_alert) {
        pt.in_alert = true;
        const flagged = Object.entries(pt.domains)
          .filter(([, v]) => v.deviation_score >= 25)
          .map(([k, v]) => ({ domain: k, deviation: v.deviation_score, trend: v.trend }));

        this.alerts.unshift({
          id: uuidv4(),
          patient_id: pt.patient_id,
          type: 'adl_deviation_high',
          severity: 'warning',
          composite_score: composite,
          message: `ADL behavioral deviation — ${pt.patient_id}: composite score ${composite}% above personal baseline across ${flagged.length} domain(s). Early decline indicator — clinical review recommended within 24h.`,
          domains_flagged: flagged,
          timestamp: now,
          acknowledged: false,
        });
        if (this.alerts.length > 100) this.alerts.length = 100;
      } else if (composite < 25) {
        pt.in_alert = false;
      }
    }
  }

  start() {
    this._timer = setInterval(() => this._tick(), 60000);
    console.log(`[adl-monitor] Started — ${this.patientCount} patients, ADL tick every 60s`);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }

  getPatientADL(patientId) {
    return this.patients.find(p => p.patient_id === patientId) || null;
  }

  getAlerts(limit = 50) {
    return this.alerts.filter(a => !a.acknowledged).slice(0, limit);
  }

  acknowledgeAlert(id) {
    const alert = this.alerts.find(a => a.id === id);
    if (!alert) return false;
    alert.acknowledged = true;
    alert.acknowledged_at = new Date().toISOString();
    return true;
  }

  getStats() {
    const high     = this.patients.filter(p => p.adl_risk === 'high').length;
    const moderate = this.patients.filter(p => p.adl_risk === 'moderate').length;
    return {
      monitored_patients:  this.patientCount,
      adl_high_risk:       high,
      adl_moderate_risk:   moderate,
      adl_low_risk:        this.patientCount - high - moderate,
      adl_active_alerts:   this.alerts.filter(a => !a.acknowledged).length,
      uptime_seconds:      Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}

module.exports = { ADLMonitor };
