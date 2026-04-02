const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/vitals - patient's own vitals
router.get('/', authenticate, async (req, res) => {
  try {
    let patientId;
    if (req.user.role === 'patient') {
      const pt = await pool.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (!pt.rows[0]) return res.json([]);
      patientId = pt.rows[0].id;
    } else {
      patientId = req.query.patientId;
    }

    const result = await pool.query(`
      SELECT vs.*, a.type as visit_type
      FROM vital_signs vs
      LEFT JOIN appointments a ON vs.appointment_id = a.id
      WHERE vs.patient_id = $1
      ORDER BY vs.recorded_at DESC
    `, [patientId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/vitals - record vitals (provider only)
router.post('/', authenticate, authorize('provider', 'admin'), async (req, res) => {
  const {
    patientId, appointmentId,
    bloodPressureSystolic, bloodPressureDiastolic,
    heartRate, temperature, respiratoryRate,
    oxygenSaturation, weight, height, bmi, painLevel,
  } = req.body;

  try {
    const calculatedBmi = bmi || (weight && height
      ? ((weight / (height * height)) * 703).toFixed(1)
      : null);

    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, appointment_id, blood_pressure_systolic, blood_pressure_diastolic,
        heart_rate, temperature, respiratory_rate, oxygen_saturation, weight, height, bmi, pain_level
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [patientId, appointmentId, bloodPressureSystolic, bloodPressureDiastolic,
        heartRate, temperature, respiratoryRate, oxygenSaturation, weight, height, calculatedBmi, painLevel]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
