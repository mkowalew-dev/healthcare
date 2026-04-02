const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/providers - list all providers
router.get('/', authenticate, async (req, res) => {
  try {
    const { specialty, departmentId } = req.query;
    let whereClause = '1=1';
    const params = [];
    let idx = 1;

    if (specialty) {
      whereClause += ` AND LOWER(p.specialty) LIKE $${idx++}`;
      params.push(`%${specialty.toLowerCase()}%`);
    }

    if (departmentId) {
      whereClause += ` AND p.department_id = $${idx++}`;
      params.push(departmentId);
    }

    const result = await pool.query(`
      SELECT p.id, p.first_name, p.last_name, p.specialty, p.npi, p.phone, p.bio,
             d.id as department_id, d.name as department_name, d.location as department_location
      FROM providers p
      LEFT JOIN departments d ON p.department_id = d.id
      WHERE ${whereClause}
      ORDER BY p.last_name, p.first_name
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/providers/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, d.name as department_name, d.location
      FROM providers p
      LEFT JOIN departments d ON p.department_id = d.id
      WHERE p.user_id = $1
    `, [req.user.id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Provider profile not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/providers/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, d.name as department_name, d.location
      FROM providers p
      LEFT JOIN departments d ON p.department_id = d.id
      WHERE p.id = $1
    `, [req.params.id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Provider not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/providers/:id/availability
router.get('/:id/availability', authenticate, async (req, res) => {
  const { date } = req.query;
  try {
    // Get booked appointments for the given date
    const booked = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM scheduled_at) as hour,
        EXTRACT(MINUTE FROM scheduled_at) as minute,
        duration_minutes
      FROM appointments
      WHERE provider_id = $1
        AND DATE(scheduled_at) = $2
        AND status NOT IN ('cancelled', 'no_show')
    `, [req.params.id, date]);

    // Generate available slots (9am - 5pm, 30 min slots)
    const bookedSlots = new Set(booked.rows.map(r => `${r.hour}:${r.minute === 0 ? '00' : r.minute}`));
    const slots = [];
    for (let hour = 9; hour < 17; hour++) {
      for (const min of [0, 30]) {
        const slot = `${hour}:${min === 0 ? '00' : min}`;
        if (!bookedSlots.has(slot)) {
          slots.push({
            time: `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`,
            available: true,
          });
        }
      }
    }

    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
