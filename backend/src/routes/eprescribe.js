const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { trace, SpanKind, SpanStatusCode } = require('@opentelemetry/api');

const router = express.Router();

// External Surescripts API endpoint (configurable for ThousandEyes monitoring)
// Defaults to the local mock server — set to real Surescripts URL in production
const SURESCRIPTS_URL = process.env.SURESCRIPTS_URL || 'http://localhost:3002/surescripts';

/**
 * Make outbound call to Surescripts ePrescribing network.
 * In production this would be the real Surescripts SCRIPT 10.6 endpoint.
 * The configurable URL lets ThousandEyes monitor this dependency.
 */
async function callSurescripts(payload) {
  const tracer = trace.getTracer('careconnect-api');
  return tracer.startActiveSpan('surescripts.newRxRequest', {
    kind: SpanKind.CLIENT,
    attributes: { 'peer.service': 'surescripts', 'http.method': 'POST' },
  }, async (span) => {
    const start = Date.now();
    try {
      const response = await fetch(`${SURESCRIPTS_URL}/api/v2/NewRxRequest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Surescripts-Version': '10.6',
          'X-Sender-ID': process.env.SURESCRIPTS_SENDER_ID || 'CARECONNECT_DEMO',
          'Authorization': `Bearer ${process.env.SURESCRIPTS_API_KEY || 'demo-key'}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      const latency = Date.now() - start;
      span.setAttribute('http.status_code', response.status);
      span.setAttribute('surescripts.latency_ms', latency);
      span.end();
      const data = await response.json().catch(() => ({}));
      return { success: response.ok || response.status === 400, latency, status: response.status, data };
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.end();
      return { success: false, latency: Date.now() - start, error: err.message };
    }
  });
}

// GET /api/eprescribe/integration/status - health check for ThousandEyes (must be before /:id)
router.get('/integration/status', authenticate, authorize('admin'), async (req, res) => {
  const start = Date.now();
  try {
    const response = await fetch(`${SURESCRIPTS_URL}/get`, {
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    res.json({
      integration: 'Surescripts',
      url: SURESCRIPTS_URL,
      reachable: response.ok,
      httpStatus: response.status,
      latencyMs: latency,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.json({
      integration: 'Surescripts',
      url: SURESCRIPTS_URL,
      reachable: false,
      error: err.message,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    });
  }
});

// GET /api/eprescribe - list prescriptions
router.get('/', authenticate, async (req, res) => {
  try {
    const { patientId, status } = req.query;
    let whereClause = '1=1';
    const params = [];
    let idx = 1;

    if (req.user.role === 'patient') {
      const pt = await pool.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (!pt.rows[0]) return res.json([]);
      whereClause += ` AND rx.patient_id = $${idx++}`;
      params.push(pt.rows[0].id);
    } else if (req.user.role === 'provider') {
      const pv = await pool.query('SELECT id FROM providers WHERE user_id = $1', [req.user.id]);
      if (pv.rows[0]) {
        whereClause += ` AND rx.provider_id = $${idx++}`;
        params.push(pv.rows[0].id);
      }
      if (patientId) {
        whereClause += ` AND rx.patient_id = $${idx++}`;
        params.push(patientId);
      }
    } else if (patientId) {
      whereClause += ` AND rx.patient_id = $${idx++}`;
      params.push(patientId);
    }

    if (status) {
      whereClause += ` AND rx.status = $${idx++}`;
      params.push(status);
    }

    const result = await pool.query(`
      SELECT rx.*,
        p.first_name as patient_first, p.last_name as patient_last, p.mrn,
        pr.first_name as provider_first, pr.last_name as provider_last, pr.npi
      FROM prescriptions rx
      LEFT JOIN patients p ON rx.patient_id = p.id
      LEFT JOIN providers pr ON rx.provider_id = pr.id
      WHERE ${whereClause}
      ORDER BY rx.created_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    logger.error('Get prescriptions error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/eprescribe/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT rx.*,
        p.first_name as patient_first, p.last_name as patient_last, p.mrn, p.date_of_birth,
        pr.first_name as provider_first, pr.last_name as provider_last, pr.npi, pr.specialty
      FROM prescriptions rx
      LEFT JOIN patients p ON rx.patient_id = p.id
      LEFT JOIN providers pr ON rx.provider_id = pr.id
      WHERE rx.id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Prescription not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/eprescribe - write and submit new prescription
router.post('/', authenticate, authorize('provider', 'admin'), async (req, res) => {
  const {
    patientId, medicationName, genericName, sig, quantity, daysSupply, refills,
    dosageForm, strength, pharmacyName, pharmacyNcpdp, pharmacyAddress,
    ndcCode, deaSchedule, icd10Codes, notes,
  } = req.body;

  if (!patientId || !medicationName || !sig || !quantity) {
    return res.status(400).json({ error: 'patientId, medicationName, sig, and quantity are required' });
  }

  try {
    const pv = await pool.query('SELECT id, npi, first_name, last_name FROM providers WHERE user_id = $1', [req.user.id]);
    const provider = pv.rows[0];
    const providerId = provider?.id || null;

    // Insert prescription as 'submitted'
    const ins = await pool.query(`
      INSERT INTO prescriptions (
        patient_id, provider_id, medication_name, generic_name, sig, quantity,
        days_supply, refills, dosage_form, strength, pharmacy_name, pharmacy_ncpdp,
        pharmacy_address, ndc_code, dea_schedule, icd10_codes, notes,
        status, submitted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'submitted',NOW())
      RETURNING *
    `, [
      patientId, providerId, medicationName, genericName, sig, quantity,
      daysSupply, refills, dosageForm, strength, pharmacyName, pharmacyNcpdp,
      pharmacyAddress, ndcCode, deaSchedule, icd10Codes, notes,
    ]);

    const rx = ins.rows[0];

    // Get patient details for the Surescripts payload
    const pt = await pool.query(
      'SELECT first_name, last_name, date_of_birth, gender, address, city, state, zip FROM patients WHERE id = $1',
      [patientId]
    );
    const patient = pt.rows[0] || {};

    // Build Surescripts-compatible SCRIPT 10.6 payload
    const surescriptsPayload = {
      messageType: 'NewRxRequest',
      messageId: rx.id,
      sentTime: new Date().toISOString(),
      prescriber: {
        npi: provider?.npi || '',
        firstName: provider?.first_name || '',
        lastName: provider?.last_name || '',
      },
      patient: {
        firstName: patient.first_name,
        lastName: patient.last_name,
        dateOfBirth: patient.date_of_birth,
        gender: patient.gender,
        address: { street: patient.address, city: patient.city, state: patient.state, zip: patient.zip },
      },
      pharmacy: { ncpdpId: pharmacyNcpdp, name: pharmacyName, address: pharmacyAddress },
      drug: {
        name: medicationName,
        genericName,
        ndcCode,
        dosageForm,
        strength,
        deaSchedule,
      },
      sig,
      quantity,
      daysSupply,
      refills,
      icd10Codes,
    };

    logger.info('Calling Surescripts ePrescribing network', {
      prescriptionId: rx.id,
      url: `${SURESCRIPTS_URL}/post`,
      medication: medicationName,
    });

    // Make outbound call to Surescripts (ThousandEyes will monitor this)
    const surescriptsResult = await callSurescripts(surescriptsPayload);

    // Generate a realistic Rx confirmation ID
    const rxId = `RX${Date.now().toString(36).toUpperCase()}`;
    const finalStatus = surescriptsResult.success ? 'confirmed' : 'submitted';

    // Update prescription with external response
    const updated = await pool.query(`
      UPDATE prescriptions
      SET status = $1, surescripts_rx_id = $2, confirmed_at = $3,
          external_response = $4, latency_ms = $5
      WHERE id = $6
      RETURNING *
    `, [
      finalStatus,
      surescriptsResult.success ? rxId : null,
      surescriptsResult.success ? new Date() : null,
      JSON.stringify(surescriptsResult),
      surescriptsResult.latency,
      rx.id,
    ]);

    logger.info('Surescripts ePrescribing result', {
      prescriptionId: rx.id,
      status: finalStatus,
      latencyMs: surescriptsResult.latency,
      rxId,
    });

    res.status(201).json({
      ...updated.rows[0],
      integration: {
        vendor: 'Surescripts',
        url: SURESCRIPTS_URL,
        latencyMs: surescriptsResult.latency,
        status: finalStatus,
        rxId: surescriptsResult.success ? rxId : null,
      },
    });
  } catch (err) {
    logger.error('ePrescribe error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/eprescribe/:id/cancel
router.patch('/:id/cancel', authenticate, authorize('provider', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE prescriptions SET status = 'cancelled' WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Prescription not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
