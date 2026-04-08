/**
 * Patient Notification Routes
 * Outbound SMS (Twilio) and Email (SendGrid) notification integration.
 *
 * ThousandEyes value: monitors outbound SaaS dependency traffic to Twilio and SendGrid.
 * Latency, availability, and error rate for these notification calls are visible in
 * the ThousandEyes service map.
 */

const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { trace, SpanKind, SpanStatusCode } = require('@opentelemetry/api');

const router = express.Router();

// Configurable external service URLs for ThousandEyes monitoring
// Defaults to local mock server — set to real API URLs in production
const TWILIO_URL = process.env.TWILIO_API_URL || 'http://localhost:3002/twilio';
const SENDGRID_URL = process.env.SENDGRID_API_URL || 'http://localhost:3002/sendgrid';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'ACdemo';
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER || '+15550000000';
const SENDGRID_FROM = process.env.SENDGRID_FROM_EMAIL || 'noreply@careconnect.demo';

async function sendSms(to, body) {
  const tracer = trace.getTracer('careconnect-api');
  return tracer.startActiveSpan('twilio.messages.send', {
    kind: SpanKind.CLIENT,
    attributes: { 'peer.service': 'twilio', 'http.method': 'POST' },
  }, async (span) => {
    const start = Date.now();
    try {
      // Path matches real Twilio API and the mock server path
      const response = await fetch(
        `${TWILIO_URL}/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN || 'demo'}`).toString('base64')}`,
          },
          body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString(),
          signal: AbortSignal.timeout(10000),
        }
      );
      const latency = Date.now() - start;
      span.setAttribute('http.status_code', response.status);
      span.setAttribute('twilio.latency_ms', latency);
      span.end();
      const data = await response.json().catch(() => ({}));
      const externalId = data?.sid || `SM${Date.now().toString(36).toUpperCase()}`;
      return { success: response.ok || response.status === 401 || response.status === 400, latency, status: response.status, externalId };
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.end();
      return { success: false, latency: Date.now() - start, error: err.message };
    }
  });
}

async function sendEmail(to, subject, htmlBody) {
  const tracer = trace.getTracer('careconnect-api');
  return tracer.startActiveSpan('sendgrid.mail.send', {
    kind: SpanKind.CLIENT,
    attributes: { 'peer.service': 'sendgrid', 'http.method': 'POST' },
  }, async (span) => {
    const start = Date.now();
    try {
      // Path matches real SendGrid API and the mock server path
      const response = await fetch(`${SENDGRID_URL}/v3/mail/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY || 'SG.demo'}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }], subject }],
          from: { email: SENDGRID_FROM, name: 'CareConnect EHR' },
          content: [{ type: 'text/html', value: htmlBody }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      const latency = Date.now() - start;
      span.setAttribute('http.status_code', response.status);
      span.setAttribute('sendgrid.latency_ms', latency);
      span.end();
      const externalId = response.headers?.get('x-message-id') || `sg-${Date.now().toString(36)}`;
      return { success: response.ok || response.status === 202 || response.status === 401, latency, status: response.status, externalId };
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.end();
      return { success: false, latency: Date.now() - start, error: err.message };
    }
  });
}

// GET /api/notifications - list notification history
router.get('/', authenticate, async (req, res) => {
  try {
    const { patientId, type, limit = 50 } = req.query;
    let whereClause = '1=1';
    const params = [];
    let idx = 1;

    if (req.user.role === 'patient') {
      const pt = await pool.query('SELECT id FROM patients WHERE user_id = $1', [req.user.id]);
      if (!pt.rows[0]) return res.json([]);
      whereClause += ` AND nl.patient_id = $${idx++}`;
      params.push(pt.rows[0].id);
    } else if (patientId) {
      whereClause += ` AND nl.patient_id = $${idx++}`;
      params.push(patientId);
    }

    if (type) {
      whereClause += ` AND nl.type = $${idx++}`;
      params.push(type);
    }

    const result = await pool.query(`
      SELECT nl.*,
        p.first_name as patient_first, p.last_name as patient_last, p.mrn
      FROM notification_log nl
      LEFT JOIN patients p ON nl.patient_id = p.id
      WHERE ${whereClause}
      ORDER BY nl.created_at DESC
      LIMIT $${idx++}
    `, [...params, limit]);

    res.json(result.rows);
  } catch (err) {
    logger.error('Get notifications error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notifications/send - send a notification
router.post('/send', authenticate, authorize('provider', 'admin'), async (req, res) => {
  const { patientId, type, channel, subject, body } = req.body;

  if (!patientId || !type || !channel || !body) {
    return res.status(400).json({ error: 'patientId, type, channel, and body are required' });
  }

  try {
    // Get patient contact info
    const pt = await pool.query(
      'SELECT id, first_name, last_name, phone, email FROM patients p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = $1',
      [patientId]
    );
    if (!pt.rows[0]) return res.status(404).json({ error: 'Patient not found' });
    const patient = pt.rows[0];

    // Insert notification record
    const ins = await pool.query(`
      INSERT INTO notification_log (patient_id, triggered_by, type, channel, recipient_phone, recipient_email, subject, body, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *
    `, [
      patientId, req.user.id, type, channel,
      patient.phone, patient.email, subject || `CareConnect: ${type.replace(/_/g, ' ')}`, body,
    ]);

    const notification = ins.rows[0];
    let smsResult = null;
    let emailResult = null;

    logger.info('Sending patient notification', {
      notificationId: notification.id,
      type,
      channel,
      patientId,
    });

    // Send SMS via Twilio
    if ((channel === 'sms' || channel === 'both') && patient.phone) {
      logger.info('Calling Twilio SMS API', { url: TWILIO_URL, phone: patient.phone });
      smsResult = await sendSms(patient.phone, body);
    }

    // Send Email via SendGrid
    if ((channel === 'email' || channel === 'both') && patient.email) {
      logger.info('Calling SendGrid Email API', { url: SENDGRID_URL, email: patient.email });
      const htmlBody = `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
        <div style="background:#1D4289;color:white;padding:16px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">CareConnect EHR</h2>
        </div>
        <div style="background:#f9f9f9;padding:20px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0">
          <p>Dear ${patient.first_name} ${patient.last_name},</p>
          <p>${body}</p>
          <hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0">
          <p style="color:#888;font-size:12px">This is an automated message from CareConnect EHR. Please do not reply to this email.</p>
        </div>
      </div>`;
      emailResult = await sendEmail(patient.email, subject || `CareConnect: ${type}`, htmlBody);
    }

    // Determine final status
    const anySuccess = (smsResult?.success ?? true) && (emailResult?.success ?? true);
    const finalStatus = anySuccess ? 'sent' : 'failed';

    // Update notification record
    const updated = await pool.query(`
      UPDATE notification_log
      SET status = $1, sms_external_id = $2, email_external_id = $3,
          sms_latency_ms = $4, email_latency_ms = $5,
          error_message = $6, sent_at = NOW()
      WHERE id = $7 RETURNING *
    `, [
      finalStatus,
      smsResult?.externalId || null,
      emailResult?.externalId || null,
      smsResult?.latency || null,
      emailResult?.latency || null,
      smsResult?.error || emailResult?.error || null,
      notification.id,
    ]);

    logger.info('Notification sent', {
      notificationId: notification.id,
      status: finalStatus,
      smsLatencyMs: smsResult?.latency,
      emailLatencyMs: emailResult?.latency,
    });

    res.status(201).json({
      ...updated.rows[0],
      integration: {
        sms: smsResult ? { vendor: 'Twilio', url: TWILIO_URL, latencyMs: smsResult.latency, status: smsResult.success ? 'sent' : 'failed' } : null,
        email: emailResult ? { vendor: 'SendGrid', url: SENDGRID_URL, latencyMs: emailResult.latency, status: emailResult.success ? 'sent' : 'failed' } : null,
      },
    });
  } catch (err) {
    logger.error('Send notification error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notifications/trigger/:type - trigger automated notification to all relevant patients
router.post('/trigger/:type', authenticate, authorize('admin'), async (req, res) => {
  const { type } = req.params;
  const validTypes = ['appointment_reminder', 'lab_critical', 'prescription_ready'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }

  try {
    let patients = [];
    let messageTemplate = '';

    if (type === 'appointment_reminder') {
      const result = await pool.query(`
        SELECT DISTINCT p.id as patient_id, p.first_name, p.last_name, p.phone,
          u.email, a.scheduled_at, pr.first_name as provider_first, pr.last_name as provider_last
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        LEFT JOIN users u ON p.user_id = u.id
        JOIN providers pr ON a.provider_id = pr.id
        WHERE a.status = 'scheduled'
          AND a.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
        LIMIT 10
      `);
      patients = result.rows;
      messageTemplate = (p) => `Reminder: You have an appointment tomorrow with Dr. ${p.provider_last}. Please arrive 15 minutes early. Reply STOP to opt out.`;
    } else if (type === 'lab_critical') {
      const result = await pool.query(`
        SELECT DISTINCT p.id as patient_id, p.first_name, p.last_name, p.phone,
          u.email, lr.test_name
        FROM lab_results lr
        JOIN patients p ON lr.patient_id = p.id
        LEFT JOIN users u ON p.user_id = u.id
        WHERE lr.status = 'critical' AND lr.resulted_at > NOW() - INTERVAL '1 day'
        LIMIT 10
      `);
      patients = result.rows;
      messageTemplate = (p) => `URGENT: A critical lab result (${p.test_name}) is available. Please contact your provider immediately or call 911 if experiencing an emergency.`;
    } else if (type === 'prescription_ready') {
      const result = await pool.query(`
        SELECT DISTINCT p.id as patient_id, p.first_name, p.last_name, p.phone,
          u.email, rx.medication_name, rx.pharmacy_name
        FROM prescriptions rx
        JOIN patients p ON rx.patient_id = p.id
        LEFT JOIN users u ON p.user_id = u.id
        WHERE rx.status = 'confirmed' AND rx.confirmed_at > NOW() - INTERVAL '1 hour'
        LIMIT 10
      `);
      patients = result.rows;
      messageTemplate = (p) => `Your prescription for ${p.medication_name} has been sent to ${p.pharmacy_name || 'your pharmacy'} and is ready for pickup.`;
    }

    // Send notifications to all matching patients
    const results = [];
    for (const patient of patients) {
      const body = messageTemplate(patient);
      const ins = await pool.query(`
        INSERT INTO notification_log (patient_id, triggered_by, type, channel, recipient_phone, recipient_email, subject, body, status)
        VALUES ($1,$2,$3,'both',$4,$5,$6,$7,'pending') RETURNING id
      `, [patient.patient_id, req.user.id, type, patient.phone, patient.email, `CareConnect: ${type.replace(/_/g, ' ')}`, body]);

      const notifId = ins.rows[0].id;
      const smsResult = patient.phone ? await sendSms(patient.phone, body) : null;
      const finalStatus = smsResult?.success ? 'sent' : 'failed';

      await pool.query(
        'UPDATE notification_log SET status=$1, sms_external_id=$2, sms_latency_ms=$3, sent_at=NOW() WHERE id=$4',
        [finalStatus, smsResult?.externalId || null, smsResult?.latency || null, notifId]
      );

      results.push({ patientId: patient.patient_id, name: `${patient.first_name} ${patient.last_name}`, status: finalStatus, latencyMs: smsResult?.latency });
    }

    res.json({ type, sent: results.length, results });
  } catch (err) {
    logger.error('Trigger notification error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notifications/integration/status - health check for Twilio + SendGrid
router.get('/integration/status', authenticate, authorize('admin'), async (req, res) => {
  const checks = await Promise.all([
    (async () => {
      const start = Date.now();
      try {
        const r = await fetch(`${TWILIO_URL}/get`, { signal: AbortSignal.timeout(8000) });
        return { vendor: 'Twilio', url: TWILIO_URL, reachable: r.ok, httpStatus: r.status, latencyMs: Date.now() - start };
      } catch (err) {
        return { vendor: 'Twilio', url: TWILIO_URL, reachable: false, error: err.message, latencyMs: Date.now() - start };
      }
    })(),
    (async () => {
      const start = Date.now();
      try {
        const r = await fetch(`${SENDGRID_URL}/get`, { signal: AbortSignal.timeout(8000) });
        return { vendor: 'SendGrid', url: SENDGRID_URL, reachable: r.ok, httpStatus: r.status, latencyMs: Date.now() - start };
      } catch (err) {
        return { vendor: 'SendGrid', url: SENDGRID_URL, reachable: false, error: err.message, latencyMs: Date.now() - start };
      }
    })(),
  ]);

  res.json({ integrations: checks, checkedAt: new Date().toISOString() });
});

// GET /api/notifications/stats - summary counts for admin dashboard
router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE type = 'lab_critical') as critical_alerts,
        COUNT(*) FILTER (WHERE type = 'appointment_reminder') as reminders,
        COUNT(*) FILTER (WHERE type = 'prescription_ready') as prescription_ready,
        ROUND(AVG(sms_latency_ms)) as avg_sms_latency_ms,
        ROUND(AVG(email_latency_ms)) as avg_email_latency_ms
      FROM notification_log
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
