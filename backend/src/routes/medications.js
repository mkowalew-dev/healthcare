const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const router = express.Router();

// GET /api/medications
router.get('/', authenticate, async (req, res) => {
  try {
    const { patientId, status } = req.query;
    let whereClause = '1=1';
    const params = [];
    let idx = 1;

    if (req.user.role === 'patient') {
      const pt = await pool.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (!pt.rows[0]) return res.json([]);
      whereClause += ` AND m.patient_id = $${idx++}`;
      params.push(pt.rows[0].id);
    } else if (patientId) {
      whereClause += ` AND m.patient_id = $${idx++}`;
      params.push(patientId);
    }

    if (status) {
      whereClause += ` AND m.status = $${idx++}`;
      params.push(status);
    }

    const result = await pool.query(`
      SELECT m.*, pr.first_name as provider_first, pr.last_name as provider_last, pr.specialty
      FROM medications m
      LEFT JOIN providers pr ON m.provider_id = pr.id
      WHERE ${whereClause}
      ORDER BY m.prescribed_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    logger.error('Get medications error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/medications/:id/refill-request
router.post('/:id/refill-request', authenticate, async (req, res) => {
  try {
    const med = await pool.query('SELECT * FROM medications WHERE id = $1', [req.params.id]);
    if (!med.rows[0]) return res.status(404).json({ error: 'Medication not found' });

    // In a real system, this would create a task for the provider
    // For demo, we'll just log it and return success
    logger.info('Refill requested', { medicationId: req.params.id, userId: req.user.id });
    res.json({ message: 'Refill request sent to your provider', status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
