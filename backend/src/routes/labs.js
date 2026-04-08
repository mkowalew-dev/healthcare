const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { trace, SpanKind, SpanStatusCode } = require('@opentelemetry/api');

const router = express.Router();

// GET /api/labs/lis-orders - list LIS orders (must be before /:id)
router.get('/lis-orders', authenticate, authorize('provider', 'admin'), async (req, res) => {
  try {
    const { patientId } = req.query;
    let whereClause = '1=1';
    const params = [];
    let idx = 1;

    if (req.user.role === 'provider') {
      const pv = await pool.query('SELECT id FROM providers WHERE user_id = $1', [req.user.id]);
      if (pv.rows[0]) {
        whereClause += ` AND lo.provider_id = $${idx++}`;
        params.push(pv.rows[0].id);
      }
    }
    if (patientId) {
      whereClause += ` AND lo.patient_id = $${idx++}`;
      params.push(patientId);
    }

    const result = await pool.query(`
      SELECT lo.*,
        p.first_name as patient_first, p.last_name as patient_last, p.mrn,
        lr.test_name, lr.panel_name
      FROM lis_orders lo
      LEFT JOIN patients p ON lo.patient_id = p.id
      LEFT JOIN lab_results lr ON lo.lab_result_id = lr.id
      WHERE ${whereClause}
      ORDER BY lo.ordered_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/labs/integration/status - LIS connectivity check (must be before /:id)
router.get('/integration/status', authenticate, authorize('admin'), async (req, res) => {
  const vendors = [
    { name: 'Quest', url: process.env.QUEST_LIS_URL || 'http://localhost:3002/quest' },
    { name: 'LabCorp', url: process.env.LABCORP_LIS_URL || 'http://localhost:3002/labcorp' },
  ];

  const checks = await Promise.all(vendors.map(async (v) => {
    const start = Date.now();
    try {
      const response = await fetch(`${v.url}/get`, { signal: AbortSignal.timeout(5000) });
      return { vendor: v.name, url: v.url, reachable: response.ok, httpStatus: response.status, latencyMs: Date.now() - start };
    } catch (err) {
      return { vendor: v.name, url: v.url, reachable: false, error: err.message, latencyMs: Date.now() - start };
    }
  }));

  res.json({ integrations: checks, checkedAt: new Date().toISOString() });
});

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

// POST /api/labs - order new lab with LIS integration
router.post('/', authenticate, authorize('provider', 'admin'), async (req, res) => {
  const { patientId, testName, testCode, panelName, notes, lisVendor, priority, icd10Codes, specimenType } = req.body;

  if (!patientId || !testName) {
    return res.status(400).json({ error: 'patientId and testName are required' });
  }

  try {
    const pv = await pool.query('SELECT id, npi, first_name, last_name FROM providers WHERE user_id = $1', [req.user.id]);
    const provider = pv.rows[0];
    const providerId = provider?.id || null;

    // Insert lab result record
    const result = await pool.query(`
      INSERT INTO lab_results (patient_id, provider_id, test_name, test_code, panel_name, notes)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [patientId, providerId, testName, testCode, panelName, notes]);

    const lab = result.rows[0];
    const vendor = lisVendor || 'Quest';
    const orderNum = `LIS${Date.now().toString(36).toUpperCase()}`;

    // Determine LIS URL based on vendor (configurable for ThousandEyes monitoring)
    // Defaults to local mock server — set to real LIS URLs in production
    const lisUrls = {
      Quest: process.env.QUEST_LIS_URL || 'http://localhost:3002/quest',
      LabCorp: process.env.LABCORP_LIS_URL || 'http://localhost:3002/labcorp',
      BioReference: process.env.BIOREFERENCE_LIS_URL || 'http://localhost:3002/quest',
    };
    const lisUrl = lisUrls[vendor] || lisUrls.Quest;

    // Build LIS order payload (HL7 ORM message structure)
    const lisPayload = {
      messageType: 'ORM_O01',
      orderNumber: orderNum,
      orderingProvider: {
        npi: provider?.npi || '',
        firstName: provider?.first_name || '',
        lastName: provider?.last_name || '',
      },
      patient: { id: patientId },
      order: {
        testCode,
        testName,
        panelName,
        priority: priority || 'routine',
        icd10Codes,
        specimenType,
        notes,
        orderedAt: new Date().toISOString(),
      },
    };

    logger.info('Sending order to LIS', { orderNumber: orderNum, vendor, url: `${lisUrl}/post`, testName });

    // Outbound call to LIS (ThousandEyes monitors this)
    const peerService = vendor === 'LabCorp' ? 'labcorp' : 'quest-diagnostics';
    const tracer = trace.getTracer('careconnect-api');
    let lisResult = { success: false, latency: 0, error: 'Not attempted' };
    await tracer.startActiveSpan(`${peerService}.order.create`, {
      kind: SpanKind.CLIENT,
      attributes: { 'peer.service': peerService, 'http.method': 'POST', 'lis.vendor': vendor },
    }, async (span) => {
      const lisStart = Date.now();
      try {
        const lisResponse = await fetch(`${lisUrl}/orders/v1/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-LIS-Vendor': vendor,
            'X-Order-Number': orderNum,
          },
          body: JSON.stringify(lisPayload),
          signal: AbortSignal.timeout(15000),
        });
        lisResult = {
          success: lisResponse.ok || lisResponse.status === 400,
          latency: Date.now() - lisStart,
          status: lisResponse.status,
        };
        span.setAttribute('http.status_code', lisResponse.status);
        span.setAttribute('lis.latency_ms', lisResult.latency);
        span.end();
      } catch (fetchErr) {
        lisResult = { success: false, latency: Date.now() - lisStart, error: fetchErr.message };
        span.recordException(fetchErr);
        span.setStatus({ code: SpanStatusCode.ERROR, message: fetchErr.message });
        span.end();
      }
    });

    // Create LIS order tracking record
    await pool.query(`
      INSERT INTO lis_orders (
        patient_id, provider_id, lab_result_id, order_number, lis_vendor,
        priority, icd10_codes, specimen_type, status, lis_confirmation,
        external_response, latency_ms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      patientId, providerId, lab.id, orderNum, vendor,
      priority || 'routine', icd10Codes, specimenType,
      lisResult.success ? 'received' : 'ordered',
      lisResult.success ? orderNum : null,
      JSON.stringify(lisResult),
      lisResult.latency,
    ]);

    logger.info('LIS order result', { orderNumber: orderNum, vendor, latencyMs: lisResult.latency });

    res.status(201).json({
      ...lab,
      integration: {
        vendor,
        url: lisUrl,
        orderNumber: orderNum,
        latencyMs: lisResult.latency,
        status: lisResult.success ? 'received' : 'ordered',
      },
    });
  } catch (err) {
    logger.error('Order lab error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
