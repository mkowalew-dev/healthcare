const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

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
