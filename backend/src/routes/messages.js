const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const router = express.Router();

// GET /api/messages - inbox
router.get('/', authenticate, async (req, res) => {
  try {
    const { type } = req.query; // 'inbox', 'sent', 'archived'

    let whereClause;
    if (type === 'sent') {
      whereClause = 'm.sender_id = $1 AND m.is_archived = false';
    } else if (type === 'archived') {
      whereClause = '(m.recipient_id = $1 OR m.sender_id = $1) AND m.is_archived = true';
    } else {
      whereClause = 'm.recipient_id = $1 AND m.is_archived = false';
    }

    const result = await pool.query(`
      SELECT
        m.*,
        su.email as sender_email, su.role as sender_role,
        ru.email as recipient_email, ru.role as recipient_role,
        CASE
          WHEN su.role = 'provider' THEN (SELECT first_name || ' ' || last_name FROM providers WHERE user_id = su.id)
          WHEN su.role = 'patient' THEN (SELECT first_name || ' ' || last_name FROM patients WHERE user_id = su.id)
          ELSE su.email
        END as sender_name,
        CASE
          WHEN ru.role = 'provider' THEN (SELECT 'Dr. ' || first_name || ' ' || last_name FROM providers WHERE user_id = ru.id)
          WHEN ru.role = 'patient' THEN (SELECT first_name || ' ' || last_name FROM patients WHERE user_id = ru.id)
          ELSE ru.email
        END as recipient_name
      FROM messages m
      JOIN users su ON m.sender_id = su.id
      JOIN users ru ON m.recipient_id = ru.id
      WHERE ${whereClause}
      ORDER BY m.sent_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (err) {
    logger.error('Get messages error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/messages/unread-count
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM messages WHERE recipient_id = $1 AND read_at IS NULL AND is_archived = false',
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/messages - send message
router.post('/', authenticate, async (req, res) => {
  const { recipientId, subject, body, messageType, threadId } = req.body;

  try {
    const result = await pool.query(`
      INSERT INTO messages (thread_id, sender_id, recipient_id, subject, body, message_type)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [threadId || uuidv4(), req.user.id, recipientId, subject, body, messageType || 'general']);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Send message error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/messages/:id/read
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE messages SET read_at = NOW() WHERE id = $1 AND recipient_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Message not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/messages/providers - get list of providers to message
router.get('/providers-list', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id as provider_id, u.id as user_id, p.first_name, p.last_name, p.specialty, d.name as department
      FROM providers p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN departments d ON p.department_id = d.id
      ORDER BY p.last_name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
