const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const router = express.Router();

// GET /api/labs
router.get('/', authenticate, async (req, res) => {
  try {
    const { patientId, status, panel } = req.query;
    let whereClause = '1=1';
    const params = [];
    let idx = 1;

    if (req.user.role === 'patient') {
      const pt = await pool.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (!pt.rows[0]) return res.json([]);
      whereClause += ` AND lr.patient_id = $${idx++}`;
      params.push(pt.rows[0].id);
    } else if (patientId) {
      whereClause += ` AND lr.patient_id = $${idx++}`;
      params.push(patientId);
    }

    if (status) {
      whereClause += ` AND lr.status = $${idx++}`;
      params.push(status);
    }

    if (panel) {
      whereClause += ` AND lr.panel_name = $${idx++}`;
      params.push(panel);
    }

    const result = await pool.query(`
      SELECT lr.*, pr.first_name as provider_first, pr.last_name as provider_last, pr.specialty
      FROM lab_results lr
      LEFT JOIN providers pr ON lr.provider_id = pr.id
      WHERE ${whereClause}
      ORDER BY lr.ordered_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    logger.error('Get labs error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/labs/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT lr.*, pr.first_name as provider_first, pr.last_name as provider_last,
             p.first_name as patient_first, p.last_name as patient_last, p.mrn
      FROM lab_results lr
      LEFT JOIN providers pr ON lr.provider_id = pr.id
      LEFT JOIN patients p ON lr.patient_id = p.id
      WHERE lr.id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Lab result not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/labs - order new lab
router.post('/', authenticate, authorize('provider', 'admin'), async (req, res) => {
  const { patientId, testName, testCode, panelName, notes } = req.body;
  try {
    const pv = await pool.query('SELECT id FROM providers WHERE user_id = $1', [req.user.id]);
    const providerId = pv.rows[0]?.id || null;

    const result = await pool.query(`
      INSERT INTO lab_results (patient_id, provider_id, test_name, test_code, panel_name, notes)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [patientId, providerId, testName, testCode, panelName, notes]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Order lab error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
