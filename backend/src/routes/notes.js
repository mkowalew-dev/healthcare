const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ── Service-to-service auth ───────────────────────────────────
// Used by internal services (VNS) that don't have a user JWT.
// Validates X-Service-Token header against SERVICE_TOKEN env var.
function serviceAuth(req, res, next) {
  const token = process.env.SERVICE_TOKEN;
  if (!token) {
    console.warn('[notes] SERVICE_TOKEN not set — service endpoint is open');
    return next();
  }
  if (req.headers['x-service-token'] !== token) {
    return res.status(401).json({ error: 'Invalid service token' });
  }
  next();
}

// POST /api/notes/service — service-to-service note creation (no user JWT)
// Called by VNS when a nursing assessment is documented with ehr_document:true.
// Creates a real clinical_notes record visible in the CareConnect clinical UI.
router.post('/service', serviceAuth, async (req, res) => {
  const { mrn, noteType, author, sessionType, sessionId, content } = req.body;
  if (!mrn) return res.status(400).json({ error: 'mrn required' });

  try {
    const ptResult = await pool.query('SELECT id FROM patients WHERE mrn = $1', [mrn]);
    if (!ptResult.rows.length) {
      return res.status(404).json({ error: 'Patient not found', mrn });
    }
    const patientId = ptResult.rows[0].id;

    // Format structured assessment content as readable clinical note text
    const lines = [
      `Virtual Nursing Assessment — ${sessionType ? sessionType.replace(/_/g, ' ') : 'nursing consult'}`,
      author ? `Nurse: ${author}` : null,
      content?.pain_score != null ? `Pain score: ${content.pain_score}/10` : null,
      content?.orientation   ? `Orientation: ${content.orientation}`    : null,
      content?.mobility      ? `Mobility: ${content.mobility}`          : null,
      content?.skin_integrity ? `Skin integrity: ${content.skin_integrity}` : null,
      content?.fall_risk_reassessment ? `Fall risk reassessment: ${content.fall_risk_reassessment}` : null,
      content?.notes         ? `Notes: ${content.notes}`                : null,
      content?.escalation_required    ? 'ESCALATION REQUIRED'           : null,
      sessionId ? `[VNS Session: ${sessionId}]` : null,
    ].filter(Boolean).join('\n');

    const result = await pool.query(
      `INSERT INTO clinical_notes (patient_id, provider_id, appointment_id, note_type, content)
       VALUES ($1, NULL, NULL, $2, $3)
       RETURNING id, patient_id, note_type, created_at`,
      [patientId, noteType || 'virtual_nursing', lines]
    );

    const row = result.rows[0];
    res.status(201).json({ success: true, note_id: row.id, patient_id: patientId, mrn, created_at: row.created_at });
  } catch (err) {
    console.error('[notes/service] DB error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notes
router.get('/', authenticate, authorize('provider', 'admin'), async (req, res) => {
  try {
    const { patientId } = req.query;
    const result = await pool.query(`
      SELECT cn.*,
        pr.first_name as provider_first, pr.last_name as provider_last,
        a.scheduled_at as appointment_date, a.type as appointment_type
      FROM clinical_notes cn
      JOIN providers pr ON cn.provider_id = pr.id
      LEFT JOIN appointments a ON cn.appointment_id = a.id
      WHERE cn.patient_id = $1
      ORDER BY cn.created_at DESC
    `, [patientId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notes
router.post('/', authenticate, authorize('provider', 'admin'), async (req, res) => {
  const { patientId, appointmentId, noteType, content } = req.body;
  try {
    const pv = await pool.query('SELECT id FROM providers WHERE user_id = $1', [req.user.id]);
    const providerId = pv.rows[0]?.id;

    const result = await pool.query(`
      INSERT INTO clinical_notes (patient_id, provider_id, appointment_id, note_type, content)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [patientId, providerId, appointmentId, noteType || 'progress', content]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
