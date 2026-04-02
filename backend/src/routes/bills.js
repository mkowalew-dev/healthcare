const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const router = express.Router();

// GET /api/bills
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, patientId } = req.query;
    let whereClause = '1=1';
    const params = [];
    let idx = 1;

    if (req.user.role === 'patient') {
      const pt = await pool.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (!pt.rows[0]) return res.json([]);
      whereClause += ` AND b.patient_id = $${idx++}`;
      params.push(pt.rows[0].id);
    } else if (patientId) {
      whereClause += ` AND b.patient_id = $${idx++}`;
      params.push(patientId);
    }

    if (status) {
      whereClause += ` AND b.status = $${idx++}`;
      params.push(status);
    }

    const result = await pool.query(`
      SELECT b.*,
        a.scheduled_at as appointment_date, a.type as appointment_type,
        pr.first_name as provider_first, pr.last_name as provider_last, pr.specialty
      FROM bills b
      LEFT JOIN appointments a ON b.appointment_id = a.id
      LEFT JOIN providers pr ON a.provider_id = pr.id
      WHERE ${whereClause}
      ORDER BY b.created_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    logger.error('Get bills error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/bills/summary
router.get('/summary', authenticate, async (req, res) => {
  try {
    let patientId;
    if (req.user.role === 'patient') {
      const pt = await pool.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (!pt.rows[0]) return res.json({ total_owed: 0, overdue: 0, paid_ytd: 0 });
      patientId = pt.rows[0].id;
    } else {
      patientId = req.query.patientId;
    }

    const result = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('pending','partial') THEN patient_amount - paid_amount ELSE 0 END), 0) as total_owed,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN patient_amount - paid_amount ELSE 0 END), 0) as overdue,
        COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW()) THEN paid_amount ELSE 0 END), 0) as paid_ytd,
        COUNT(CASE WHEN status IN ('pending', 'partial', 'overdue') THEN 1 END) as pending_count
      FROM bills
      WHERE patient_id = $1
    `, [patientId]);

    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Get bills summary error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/bills/:id/pay
router.post('/:id/pay', authenticate, async (req, res) => {
  const { amount, paymentMethod, cardLast4 } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const billResult = await client.query(
      'SELECT * FROM bills WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );

    if (!billResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bill not found' });
    }

    const bill = billResult.rows[0];
    const remaining = parseFloat(bill.patient_amount) - parseFloat(bill.paid_amount);
    const payAmount = Math.min(parseFloat(amount), remaining);

    if (payAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bill is already paid' });
    }

    const confirmationNumber = 'PAY-' + Date.now().toString(36).toUpperCase();
    const newPaid = parseFloat(bill.paid_amount) + payAmount;
    const newStatus = newPaid >= parseFloat(bill.patient_amount) ? 'paid' : 'partial';

    await client.query(
      'UPDATE bills SET paid_amount = $1, status = $2 WHERE id = $3',
      [newPaid, newStatus, bill.id]
    );

    const payment = await client.query(`
      INSERT INTO payments (bill_id, patient_id, amount, payment_method, confirmation_number)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [bill.id, bill.patient_id, payAmount, paymentMethod || 'credit_card', confirmationNumber]);

    await client.query('COMMIT');

    logger.info('Payment processed', {
      billId: bill.id,
      amount: payAmount,
      confirmationNumber,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      confirmationNumber,
      amountPaid: payAmount,
      newStatus,
      payment: payment.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Payment error', { error: err.message });
    res.status(500).json({ error: 'Payment processing failed' });
  } finally {
    client.release();
  }
});

// GET /api/bills/payments
router.get('/payments', authenticate, async (req, res) => {
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
      SELECT p.*, b.description as bill_description
      FROM payments p
      JOIN bills b ON p.bill_id = b.id
      WHERE p.patient_id = $1
      ORDER BY p.payment_date DESC
    `, [patientId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
