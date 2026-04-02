const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { generateToken, authenticate } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = generateToken(user);

    // Get profile based on role
    let profile = null;
    if (user.role === 'patient') {
      const pt = await pool.query(
        `SELECT p.*, pr.first_name as provider_first, pr.last_name as provider_last
         FROM patients p
         LEFT JOIN providers pr ON p.primary_provider_id = pr.id
         WHERE p.user_id = $1`, [user.id]
      );
      profile = pt.rows[0] || null;
    } else if (user.role === 'provider') {
      const pv = await pool.query(
        `SELECT p.*, d.name as department_name
         FROM providers p
         LEFT JOIN departments d ON p.department_id = d.id
         WHERE p.user_id = $1`, [user.id]
      );
      profile = pv.rows[0] || null;
    }

    logger.info('User login successful', { userId: user.id, role: user.role, requestId: req.requestId });

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role },
      profile,
    });
  } catch (err) {
    logger.error('Login error', { error: err.message, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, role, is_active, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    let profile = null;

    if (user.role === 'patient') {
      const pt = await pool.query(
        `SELECT p.*, pr.first_name as provider_first, pr.last_name as provider_last
         FROM patients p
         LEFT JOIN providers pr ON p.primary_provider_id = pr.id
         WHERE p.user_id = $1`, [user.id]
      );
      profile = pt.rows[0] || null;
    } else if (user.role === 'provider') {
      const pv = await pool.query(
        `SELECT p.*, d.name as department_name
         FROM providers p
         LEFT JOIN departments d ON p.department_id = d.id
         WHERE p.user_id = $1`, [user.id]
      );
      profile = pv.rows[0] || null;
    }

    res.json({ user, profile });
  } catch (err) {
    logger.error('Get me error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
