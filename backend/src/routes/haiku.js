'use strict';

const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ── Resolve provider ID for the authenticated user ────────────────────────────
async function getProviderId(userId) {
  const r = await pool.query('SELECT id, first_name, last_name FROM providers WHERE user_id = $1', [userId]);
  return r.rows[0] || null;
}

// GET /api/haiku/inbox
// In-basket: unread messages + critical/abnormal labs needing sign-off + refill requests
router.get('/inbox', authenticate, authorize('provider'), async (req, res) => {
  try {
    const provider = await getProviderId(req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const [msgs, labs, refills] = await Promise.all([
      // Unread messages addressed to this provider
      pool.query(`
        SELECT m.id, m.subject, m.body, m.sent_at, m.thread_id,
               u.email as sender_email,
               COALESCE(p.first_name || ' ' || p.last_name, pr.first_name || ' ' || pr.last_name, u.email) as sender_name,
               u.role as sender_role
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN patients p  ON u.id = p.user_id
        LEFT JOIN providers pr ON u.id = pr.user_id
        WHERE m.recipient_id = $1 AND m.read_at IS NULL AND m.is_archived = false
        ORDER BY m.sent_at DESC
        LIMIT 20
      `, [req.user.id]),

      // Critical and abnormal labs ordered by this provider, not yet annotated as reviewed
      pool.query(`
        SELECT lr.id, lr.test_name, lr.panel_name, lr.value, lr.unit, lr.reference_range,
               lr.status, lr.resulted_at,
               p.id as patient_id, p.first_name as patient_first, p.last_name as patient_last, p.mrn
        FROM lab_results lr
        JOIN patients p ON lr.patient_id = p.id
        WHERE lr.provider_id = $1
          AND lr.status IN ('critical', 'abnormal')
          AND (lr.notes IS NULL OR lr.notes NOT LIKE '%[Reviewed via Haiku]%')
        ORDER BY CASE lr.status WHEN 'critical' THEN 0 ELSE 1 END, lr.resulted_at DESC
        LIMIT 30
      `, [provider.id]),

      // Active medications with 0 refills remaining (refill requests)
      pool.query(`
        SELECT m.id, m.name, m.dosage, m.frequency,
               p.id as patient_id, p.first_name as patient_first, p.last_name as patient_last, p.mrn
        FROM medications m
        JOIN patients p ON m.patient_id = p.id
        WHERE m.provider_id = $1 AND m.status = 'active' AND m.refills_remaining = 0
        ORDER BY m.name
        LIMIT 20
      `, [provider.id]),
    ]);

    res.json({
      messages: msgs.rows,
      critical_labs: labs.rows,
      refill_requests: refills.rows,
      badge_count: msgs.rows.length + labs.rows.filter(l => l.status === 'critical').length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/haiku/schedule
// Today's appointments for the authenticated provider
router.get('/schedule', authenticate, authorize('provider'), async (req, res) => {
  try {
    const provider = await getProviderId(req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const result = await pool.query(`
      SELECT a.id, a.scheduled_at, a.duration_minutes, a.type, a.status,
             a.chief_complaint, a.location,
             p.id as patient_id, p.first_name as patient_first, p.last_name as patient_last,
             p.mrn, p.date_of_birth, p.phone
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.provider_id = $1
        AND a.scheduled_at::date = CURRENT_DATE
        AND a.status NOT IN ('cancelled')
      ORDER BY a.scheduled_at ASC
    `, [provider.id]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/haiku/worklist
// All patients assigned to this provider with urgency signals
router.get('/worklist', authenticate, authorize('provider'), async (req, res) => {
  try {
    const provider = await getProviderId(req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const result = await pool.query(`
      SELECT
        p.id, p.mrn, p.first_name, p.last_name, p.date_of_birth, p.phone,
        p.blood_type,
        (SELECT COUNT(*) FROM lab_results lr WHERE lr.patient_id = p.id AND lr.status = 'critical') as critical_labs,
        (SELECT COUNT(*) FROM lab_results lr WHERE lr.patient_id = p.id AND lr.status = 'abnormal') as abnormal_labs,
        (SELECT COUNT(*) FROM lab_results lr WHERE lr.patient_id = p.id AND lr.status = 'pending')  as pending_labs,
        (SELECT COUNT(*) FROM medications m WHERE m.patient_id = p.id AND m.status = 'active') as active_meds,
        (SELECT MAX(vs.recorded_at) FROM vital_signs vs WHERE vs.patient_id = p.id) as last_vitals_at,
        (SELECT scheduled_at FROM appointments a WHERE a.patient_id = p.id AND a.scheduled_at::date = CURRENT_DATE AND a.status NOT IN ('cancelled') ORDER BY a.scheduled_at LIMIT 1) as today_appt
      FROM patients p
      WHERE p.primary_provider_id = $1
      ORDER BY
        (SELECT COUNT(*) FROM lab_results lr WHERE lr.patient_id = p.id AND lr.status = 'critical') DESC,
        p.last_name, p.first_name
    `, [provider.id]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/haiku/patients/:id/quickview
// Mobile-optimized patient summary: vitals snapshot, active meds, recent labs, allergies, diagnoses
router.get('/patients/:id/quickview', authenticate, authorize('provider'), async (req, res) => {
  try {
    const { id } = req.params;

    const [patient, vitals, meds, labs, allergies, diagnoses] = await Promise.all([
      pool.query(`
        SELECT p.*, d.name as department_name,
               pr.first_name as provider_first, pr.last_name as provider_last, pr.specialty
        FROM patients p
        LEFT JOIN providers pr ON p.primary_provider_id = pr.id
        LEFT JOIN departments d ON pr.department_id = d.id
        WHERE p.id = $1
      `, [id]),

      // Latest vital signs set
      pool.query(`
        SELECT * FROM vital_signs WHERE patient_id = $1
        ORDER BY recorded_at DESC LIMIT 1
      `, [id]),

      // Active medications only
      pool.query(`
        SELECT id, name, generic_name, dosage, frequency, route, refills_remaining, instructions
        FROM medications WHERE patient_id = $1 AND status = 'active'
        ORDER BY name
      `, [id]),

      // 5 most recent lab results (critical first)
      pool.query(`
        SELECT id, test_name, panel_name, value, unit, reference_range, status, resulted_at
        FROM lab_results WHERE patient_id = $1
        ORDER BY CASE status WHEN 'critical' THEN 0 WHEN 'abnormal' THEN 1 ELSE 2 END,
                 resulted_at DESC NULLS LAST
        LIMIT 5
      `, [id]),

      pool.query(`
        SELECT allergen, reaction, severity FROM allergies WHERE patient_id = $1
        ORDER BY severity DESC
      `, [id]),

      pool.query(`
        SELECT icd_code, description, status, diagnosed_date FROM diagnoses
        WHERE patient_id = $1 AND status IN ('active', 'chronic')
        ORDER BY status, diagnosed_date DESC
        LIMIT 6
      `, [id]),
    ]);

    if (!patient.rows[0]) return res.status(404).json({ error: 'Patient not found' });

    res.json({
      patient: patient.rows[0],
      vitals: vitals.rows[0] || null,
      medications: meds.rows,
      recent_labs: labs.rows,
      allergies: allergies.rows,
      diagnoses: diagnoses.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/haiku/labs/:id/acknowledge
// Mark a lab result as reviewed by this provider via Haiku
router.patch('/labs/:id/acknowledge', authenticate, authorize('provider'), async (req, res) => {
  try {
    const provider = await getProviderId(req.user.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const { id } = req.params;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Lab result not found' });

    const ts = new Date().toISOString();
    const annotation = `[Reviewed via Haiku] Dr. ${provider.first_name} ${provider.last_name} — ${ts}`;

    const result = await pool.query(`
      UPDATE lab_results
      SET notes = CASE WHEN notes IS NULL OR notes = '' THEN $1 ELSE notes || E'\n' || $1 END
      WHERE id = $2 AND provider_id = $3
      RETURNING id, status, notes
    `, [annotation, id, provider.id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Lab result not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/haiku/messages/:id/read
// Mark a message as read from Haiku
router.patch('/messages/:id/read', authenticate, authorize('provider'), async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE messages SET read_at = NOW()
      WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL
      RETURNING id
    `, [req.params.id, req.user.id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Message not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
