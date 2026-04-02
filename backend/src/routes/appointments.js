const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const router = express.Router();

// GET /api/appointments - list appointments
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, upcoming, patientId, providerId } = req.query;
    let whereClause = '1=1';
    const params = [];
    let paramIdx = 1;

    if (req.user.role === 'patient') {
      // Patient sees own appointments
      const ptResult = await pool.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (!ptResult.rows[0]) return res.json([]);
      whereClause += ` AND a.patient_id = $${paramIdx++}`;
      params.push(ptResult.rows[0].id);
    } else if (req.user.role === 'provider') {
      const pvResult = await pool.query('SELECT id FROM providers WHERE user_id = $1', [req.user.id]);
      if (!pvResult.rows[0]) return res.json([]);
      whereClause += ` AND a.provider_id = $${paramIdx++}`;
      params.push(pvResult.rows[0].id);
    } else if (patientId) {
      whereClause += ` AND a.patient_id = $${paramIdx++}`;
      params.push(patientId);
    }

    if (status) {
      whereClause += ` AND a.status = $${paramIdx++}`;
      params.push(status);
    }

    if (upcoming === 'true') {
      whereClause += ` AND a.scheduled_at >= NOW()`;
    }

    const result = await pool.query(`
      SELECT
        a.*,
        p.first_name as patient_first, p.last_name as patient_last, p.mrn,
        pr.first_name as provider_first, pr.last_name as provider_last, pr.specialty,
        d.name as department_name, d.location as department_location
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN providers pr ON a.provider_id = pr.id
      LEFT JOIN departments d ON pr.department_id = d.id
      WHERE ${whereClause}
      ORDER BY a.scheduled_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    logger.error('Get appointments error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/appointments/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.*,
        p.first_name as patient_first, p.last_name as patient_last, p.mrn, p.date_of_birth,
        pr.first_name as provider_first, pr.last_name as provider_last, pr.specialty, pr.phone as provider_phone,
        d.name as department_name, d.location as department_location
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN providers pr ON a.provider_id = pr.id
      LEFT JOIN departments d ON pr.department_id = d.id
      WHERE a.id = $1
    `, [req.params.id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Get appointment error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointments - schedule new appointment
router.post('/', authenticate, async (req, res) => {
  const { providerId, scheduledAt, type, chiefComplaint, durationMinutes } = req.body;

  try {
    let patientId;
    if (req.user.role === 'patient') {
      const pt = await pool.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (!pt.rows[0]) return res.status(404).json({ error: 'Patient profile not found' });
      patientId = pt.rows[0].id;
    } else {
      patientId = req.body.patientId;
    }

    const result = await pool.query(`
      INSERT INTO appointments (patient_id, provider_id, scheduled_at, type, chief_complaint, duration_minutes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [patientId, providerId, scheduledAt, type || 'office_visit', chiefComplaint, durationMinutes || 30]);

    logger.info('Appointment scheduled', { appointmentId: result.rows[0].id, patientId, providerId });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Schedule appointment error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/appointments/:id/cancel
router.patch('/:id/cancel', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE appointments SET status = 'cancelled' WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Cancel appointment error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/appointments/:id/status
router.patch('/:id/status', authenticate, authorize('provider', 'admin'), async (req, res) => {
  const { status, notes } = req.body;
  try {
    const result = await pool.query(
      'UPDATE appointments SET status = $1, notes = COALESCE($2, notes) WHERE id = $3 RETURNING *',
      [status, notes, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Update appointment status error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
