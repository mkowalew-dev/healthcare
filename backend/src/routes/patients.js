const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const router = express.Router();

// GET /api/patients - list (provider/admin only)
router.get('/', authenticate, authorize('provider', 'admin'), async (req, res) => {
  try {
    const { search, providerId } = req.query;
    let whereClause = '1=1';
    const params = [];
    let idx = 1;

    // Providers see their own patients
    if (req.user.role === 'provider') {
      const pv = await pool.query('SELECT id FROM providers WHERE user_id = $1', [req.user.id]);
      if (pv.rows[0]) {
        whereClause += ` AND p.primary_provider_id = $${idx++}`;
        params.push(pv.rows[0].id);
      }
    }

    if (search) {
      whereClause += ` AND (
        LOWER(p.first_name || ' ' || p.last_name) LIKE $${idx} OR
        LOWER(p.mrn) LIKE $${idx} OR
        LOWER(p.phone) LIKE $${idx}
      )`;
      params.push(`%${search.toLowerCase()}%`);
      idx++;
    }

    const result = await pool.query(`
      SELECT
        p.*,
        pr.first_name as provider_first, pr.last_name as provider_last, pr.specialty,
        d.name as department_name,
        (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'scheduled' AND a.scheduled_at > NOW()) as upcoming_appointments,
        (SELECT MAX(a.scheduled_at) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'completed') as last_visit
      FROM patients p
      LEFT JOIN providers pr ON p.primary_provider_id = pr.id
      LEFT JOIN departments d ON pr.department_id = d.id
      WHERE ${whereClause}
      ORDER BY p.last_name, p.first_name
    `, params);

    res.json(result.rows);
  } catch (err) {
    logger.error('Get patients error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/patients/me - patient's own profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
        pr.first_name as provider_first, pr.last_name as provider_last, pr.specialty,
        pr.phone as provider_phone,
        d.name as department_name
      FROM patients p
      LEFT JOIN providers pr ON p.primary_provider_id = pr.id
      LEFT JOIN departments d ON pr.department_id = d.id
      WHERE p.user_id = $1
    `, [req.user.id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Patient profile not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Get patient me error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/patients/:id
router.get('/:id', authenticate, authorize('provider', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
        pr.first_name as provider_first, pr.last_name as provider_last, pr.specialty,
        d.name as department_name
      FROM patients p
      LEFT JOIN providers pr ON p.primary_provider_id = pr.id
      LEFT JOIN departments d ON pr.department_id = d.id
      WHERE p.id = $1
    `, [req.params.id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Patient not found' });

    // Fetch associated data
    const [allergies, diagnoses, vitals] = await Promise.all([
      pool.query('SELECT * FROM allergies WHERE patient_id = $1 ORDER BY noted_date DESC', [req.params.id]),
      pool.query('SELECT * FROM diagnoses WHERE patient_id = $1 ORDER BY diagnosed_date DESC', [req.params.id]),
      pool.query('SELECT * FROM vital_signs WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 5', [req.params.id]),
    ]);

    res.json({
      ...result.rows[0],
      allergies: allergies.rows,
      diagnoses: diagnoses.rows,
      recentVitals: vitals.rows,
    });
  } catch (err) {
    logger.error('Get patient error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/patients/:id/vitals
router.get('/:id/vitals', authenticate, async (req, res) => {
  try {
    // Allow patients to access own vitals
    if (req.user.role === 'patient') {
      const pt = await pool.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (!pt.rows[0] || pt.rows[0].id !== req.params.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const result = await pool.query(`
      SELECT vs.*, a.scheduled_at as appointment_date, a.type as appointment_type
      FROM vital_signs vs
      LEFT JOIN appointments a ON vs.appointment_id = a.id
      WHERE vs.patient_id = $1
      ORDER BY vs.recorded_at DESC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/patients/:id/summary - full chart summary for providers
router.get('/:id/summary', authenticate, authorize('provider', 'admin'), async (req, res) => {
  try {
    const patientId = req.params.id;

    const [patient, allergies, diagnoses, activeMeds, recentLabs, upcomingAppts, recentNotes, vitals] = await Promise.all([
      pool.query(`SELECT p.*, pr.first_name as pf, pr.last_name as pl FROM patients p LEFT JOIN providers pr ON p.primary_provider_id = pr.id WHERE p.id = $1`, [patientId]),
      pool.query('SELECT * FROM allergies WHERE patient_id = $1', [patientId]),
      pool.query('SELECT * FROM diagnoses WHERE patient_id = $1 AND status != $2 ORDER BY diagnosed_date DESC', [patientId, 'resolved']),
      pool.query('SELECT m.*, pr.first_name as pf, pr.last_name as pl FROM medications m LEFT JOIN providers pr ON m.provider_id = pr.id WHERE m.patient_id = $1 AND m.status = $2', [patientId, 'active']),
      pool.query('SELECT lr.* FROM lab_results lr WHERE lr.patient_id = $1 ORDER BY lr.ordered_at DESC LIMIT 10', [patientId]),
      pool.query(`SELECT a.*, pr.first_name as pf, pr.last_name as pl FROM appointments a JOIN providers pr ON a.provider_id = pr.id WHERE a.patient_id = $1 AND a.scheduled_at > NOW() ORDER BY a.scheduled_at LIMIT 3`, [patientId]),
      pool.query('SELECT cn.*, pr.first_name as pf, pr.last_name as pl FROM clinical_notes cn JOIN providers pr ON cn.provider_id = pr.id WHERE cn.patient_id = $1 ORDER BY cn.created_at DESC LIMIT 5', [patientId]),
      pool.query('SELECT * FROM vital_signs WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 1', [patientId]),
    ]);

    if (!patient.rows[0]) return res.status(404).json({ error: 'Patient not found' });

    res.json({
      patient: patient.rows[0],
      allergies: allergies.rows,
      diagnoses: diagnoses.rows,
      activeMedications: activeMeds.rows,
      recentLabs: recentLabs.rows,
      upcomingAppointments: upcomingAppts.rows,
      recentNotes: recentNotes.rows,
      lastVitals: vitals.rows[0] || null,
    });
  } catch (err) {
    logger.error('Get patient summary error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
