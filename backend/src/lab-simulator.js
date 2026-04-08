/**
 * Lab Results Simulator — CareConnect EHR Demo
 *
 * Runs on a configurable interval (default 15 min). On each tick it finds all
 * lab_results rows that are still 'pending' and were ordered at least
 * LAB_MIN_AGE_MS ago, then fills in plausible synthetic values and moves them
 * to 'resulted', 'abnormal', or 'critical' status.
 *
 * Also updates the corresponding lis_orders row to 'resulted'.
 *
 * Environment variables:
 *   LAB_RESULT_INTERVAL_MS   — how often to run (default: 900000 = 15 min)
 *   LAB_MIN_AGE_MS           — minimum order age before resulting (default: same as interval)
 */

const pool = require('./db/pool');
const { logger } = require('./middleware/logger');

// ── Synthetic result map keyed by test_code ───────────────────────────────────
// Each entry returns { value, unit, reference_range, status }
// status is derived from the generated value vs. the normal range.
const RESULT_GENERATORS = {
  CBC: () => {
    const v = +(10.5 + Math.random() * 6).toFixed(1);
    return { value: String(v), unit: 'g/dL', reference_range: '12.0–16.0 g/dL', status: v < 12.0 ? 'abnormal' : 'resulted' };
  },
  CMP: () => {
    const v = +(65 + Math.random() * 60).toFixed(0);
    return { value: String(v), unit: 'mg/dL', reference_range: '70–99 mg/dL', status: v < 70 || v > 125 ? 'abnormal' : 'resulted' };
  },
  BMP: () => {
    const v = +(65 + Math.random() * 60).toFixed(0);
    return { value: String(v), unit: 'mg/dL', reference_range: '70–99 mg/dL', status: v < 70 || v > 125 ? 'abnormal' : 'resulted' };
  },
  A1C: () => {
    const v = +(5.2 + Math.random() * 4).toFixed(1);
    return { value: String(v), unit: '%', reference_range: '<5.7%', status: v >= 9.0 ? 'critical' : v >= 5.7 ? 'abnormal' : 'resulted' };
  },
  LPT: () => {
    const v = +(140 + Math.random() * 120).toFixed(0);
    return { value: String(v), unit: 'mg/dL', reference_range: '<200 mg/dL', status: v >= 240 ? 'critical' : v >= 200 ? 'abnormal' : 'resulted' };
  },
  TSH: () => {
    const v = +(0.3 + Math.random() * 5.5).toFixed(2);
    return { value: String(v), unit: 'mIU/L', reference_range: '0.50–4.50 mIU/L', status: v < 0.5 || v > 4.5 ? 'abnormal' : 'resulted' };
  },
  UA: () => {
    const abnormal = Math.random() < 0.15;
    return { value: abnormal ? 'Trace protein' : 'Negative', unit: '', reference_range: 'Negative', status: abnormal ? 'abnormal' : 'resulted' };
  },
  PT_INR: () => {
    const v = +(0.8 + Math.random() * 1.8).toFixed(1);
    return { value: String(v), unit: 'INR', reference_range: '0.8–1.2', status: v > 3.0 ? 'critical' : v > 1.2 ? 'abnormal' : 'resulted' };
  },
  VITD: () => {
    const v = +(12 + Math.random() * 70).toFixed(1);
    return { value: String(v), unit: 'ng/mL', reference_range: '30–100 ng/mL', status: v < 20 ? 'critical' : v < 30 ? 'abnormal' : 'resulted' };
  },
  FERR: () => {
    const v = +(8 + Math.random() * 200).toFixed(0);
    return { value: String(v), unit: 'ng/mL', reference_range: '13–150 ng/mL', status: v < 13 || v > 150 ? 'abnormal' : 'resulted' };
  },
};

// Fallback generator for any test code not in the map (uses test name as hint)
function fallbackResult(testName) {
  const name = (testName || '').toLowerCase();
  if (name.includes('glucose')) {
    const v = +(65 + Math.random() * 60).toFixed(0);
    return { value: String(v), unit: 'mg/dL', reference_range: '70–99 mg/dL', status: v < 70 || v > 125 ? 'abnormal' : 'resulted' };
  }
  if (name.includes('sodium')) {
    const v = +(132 + Math.random() * 14).toFixed(0);
    return { value: String(v), unit: 'mEq/L', reference_range: '136–145 mEq/L', status: v < 136 || v > 145 ? 'abnormal' : 'resulted' };
  }
  if (name.includes('potassium')) {
    const v = +(3.2 + Math.random() * 1.8).toFixed(1);
    return { value: String(v), unit: 'mEq/L', reference_range: '3.5–5.1 mEq/L', status: v < 3.5 || v > 5.1 ? 'abnormal' : 'resulted' };
  }
  if (name.includes('creatinine')) {
    const v = +(0.6 + Math.random() * 1.8).toFixed(2);
    return { value: String(v), unit: 'mg/dL', reference_range: '0.60–1.20 mg/dL', status: v > 1.5 ? 'critical' : v > 1.2 ? 'abnormal' : 'resulted' };
  }
  // Generic numeric fallback
  const v = +(Math.random() * 100).toFixed(1);
  return { value: String(v), unit: 'units', reference_range: '10–90 units', status: v < 10 || v > 90 ? 'abnormal' : 'resulted' };
}

function generateResult(testCode, testName) {
  const gen = RESULT_GENERATORS[testCode?.toUpperCase()];
  return gen ? gen() : fallbackResult(testName);
}

// ── Main simulation tick ──────────────────────────────────────────────────────
async function runSimulation(minAgeMs) {
  const cutoff = new Date(Date.now() - minAgeMs).toISOString();

  const pending = await pool.query(
    `SELECT id, test_code, test_name FROM lab_results
     WHERE status = 'pending' AND ordered_at <= $1`,
    [cutoff],
  );

  if (pending.rows.length === 0) {
    logger.info('Lab simulator: no pending results to process');
    return;
  }

  let resulted = 0;
  let abnormal = 0;
  let critical = 0;

  for (const row of pending.rows) {
    const r = generateResult(row.test_code, row.test_name);

    await pool.query(
      `UPDATE lab_results
       SET value = $1, unit = $2, reference_range = $3, status = $4, resulted_at = NOW()
       WHERE id = $5`,
      [r.value, r.unit, r.reference_range, r.status, row.id],
    );

    // Also mark the linked LIS order as resulted
    await pool.query(
      `UPDATE lis_orders SET status = 'resulted', resulted_at = NOW()
       WHERE lab_result_id = $1 AND status != 'resulted'`,
      [row.id],
    );

    if (r.status === 'critical') critical++;
    else if (r.status === 'abnormal') abnormal++;
    else resulted++;
  }

  logger.info('Lab simulator: batch complete', {
    total: pending.rows.length,
    resulted,
    abnormal,
    critical,
  });
}

// ── Start the scheduler ───────────────────────────────────────────────────────
function startLabSimulator() {
  const intervalMs = Number(process.env.LAB_RESULT_INTERVAL_MS ?? 15 * 60 * 1000);
  const minAgeMs   = Number(process.env.LAB_MIN_AGE_MS ?? intervalMs);

  logger.info('Lab simulator started', {
    intervalMin: Math.round(intervalMs / 60000),
    minAgeMin:   Math.round(minAgeMs / 60000),
  });

  // Run immediately on startup to catch any labs that survived a restart
  runSimulation(minAgeMs).catch(err =>
    logger.error('Lab simulator initial run failed', { error: err.message }),
  );

  setInterval(() => {
    runSimulation(minAgeMs).catch(err =>
      logger.error('Lab simulator tick failed', { error: err.message }),
    );
  }, intervalMs);
}

module.exports = { startLabSimulator };
