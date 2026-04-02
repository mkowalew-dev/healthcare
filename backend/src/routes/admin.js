const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const router = express.Router();

// GET /api/admin/stats
router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [users, patients, providers, todayAppts, pendingBills, messages] = await Promise.all([
      pool.query('SELECT COUNT(*) as count, role FROM users GROUP BY role'),
      pool.query('SELECT COUNT(*) as count FROM patients'),
      pool.query('SELECT COUNT(*) as count FROM providers'),
      pool.query("SELECT COUNT(*) as count FROM appointments WHERE DATE(scheduled_at) = CURRENT_DATE AND status != 'cancelled'"),
      pool.query("SELECT COUNT(*) as count, SUM(patient_amount - paid_amount) as amount FROM bills WHERE status IN ('pending', 'overdue', 'partial')"),
      pool.query('SELECT COUNT(*) as count FROM messages WHERE read_at IS NULL'),
    ]);

    const usersByRole = {};
    users.rows.forEach(r => { usersByRole[r.role] = parseInt(r.count); });

    res.json({
      totalUsers: users.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
      usersByRole,
      totalPatients: parseInt(patients.rows[0].count),
      totalProviders: parseInt(providers.rows[0].count),
      appointmentsToday: parseInt(todayAppts.rows[0].count),
      pendingBills: {
        count: parseInt(pendingBills.rows[0].count),
        amount: parseFloat(pendingBills.rows[0].amount) || 0,
      },
      unreadMessages: parseInt(messages.rows[0].count),
    });
  } catch (err) {
    logger.error('Get admin stats error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/users
router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.role, u.is_active, u.created_at, u.last_login,
        CASE
          WHEN u.role = 'provider' THEN (SELECT 'Dr. ' || first_name || ' ' || last_name FROM providers WHERE user_id = u.id)
          WHEN u.role = 'patient' THEN (SELECT first_name || ' ' || last_name FROM patients WHERE user_id = u.id)
          ELSE 'System Admin'
        END as display_name,
        CASE
          WHEN u.role = 'provider' THEN (SELECT specialty FROM providers WHERE user_id = u.id)
          WHEN u.role = 'patient' THEN (SELECT mrn FROM patients WHERE user_id = u.id)
          ELSE NULL
        END as additional_info
      FROM users u
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id/toggle-active
router.patch('/users/:id/toggle-active', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, email, role, is_active',
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/appointments
router.get('/appointments', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const result = await pool.query(`
      SELECT
        DATE(scheduled_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_show
      FROM appointments
      WHERE scheduled_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(scheduled_at)
      ORDER BY date
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/departments
router.get('/departments', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*,
        COUNT(DISTINCT p.id) as provider_count,
        COUNT(DISTINCT a.id) as appointment_count_30d
      FROM departments d
      LEFT JOIN providers p ON p.department_id = d.id
      LEFT JOIN appointments a ON a.provider_id = p.id AND a.scheduled_at > NOW() - INTERVAL '30 days'
      GROUP BY d.id
      ORDER BY d.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
