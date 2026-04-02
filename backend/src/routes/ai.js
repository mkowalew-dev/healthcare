const express = require('express');
const router = express.Router();
const AnthropicSDK = require('@anthropic-ai/sdk');
const Anthropic = AnthropicSDK.default || AnthropicSDK;
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const MAX_ITERATIONS = 5;

// ── Tool schemas (what Claude sees) ────────────────────────

const patientTools = [
  {
    name: 'get_appointments',
    description: "Get the patient's appointments. Use status 'all' unless they ask for a specific type.",
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'scheduled', 'completed', 'cancelled'],
          description: "Filter by status. 'scheduled' = upcoming visits.",
        },
      },
      required: ['status'],
    },
  },
  {
    name: 'get_medications',
    description: "Get the patient's current active medications with dosage and instructions.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_lab_results',
    description: "Get the patient's recent lab results including test values, reference ranges, and any abnormal flags.",
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Number of results (max 20, default 10).' },
      },
      required: [],
    },
  },
  {
    name: 'get_bills',
    description: "Get the patient's billing statements, balance summary, and payment history.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_health_summary',
    description: "Get the patient's health summary: recent vitals, allergies, and active diagnoses.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

const providerTools = [
  {
    name: 'search_patients',
    description: 'Search for patients by name or MRN.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Patient name or MRN to search for.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_patient_chart',
    description: "Get a full clinical summary for a patient: active medications, recent labs, allergies, diagnoses, and upcoming appointments. Use after search_patients to get the patient_id.",
    input_schema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string', description: "The patient's UUID from search_patients results." },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'get_today_schedule',
    description: "Get the provider's appointment schedule for today.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

const adminTools = [
  {
    name: 'get_system_stats',
    description: 'Get system-wide statistics: user counts by role, appointment counts by status, and revenue summary.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

// ── Tool executors ─────────────────────────────────────────

async function runPatientTool(name, input, userId) {
  const { rows: [patient] } = await pool.query(
    'SELECT id, first_name, last_name, mrn FROM patients WHERE user_id = $1',
    [userId]
  );
  if (!patient) throw new Error('Patient record not found');

  switch (name) {
    case 'get_appointments': {
      let sql = `
        SELECT a.id, a.scheduled_at, a.type, a.status, a.chief_complaint, a.duration_minutes, a.location,
               p.first_name || ' ' || p.last_name AS provider_name, p.specialty
        FROM appointments a
        JOIN providers p ON a.provider_id = p.id
        WHERE a.patient_id = $1`;
      const params = [patient.id];
      if (input.status && input.status !== 'all') {
        sql += ` AND a.status = $2`;
        params.push(input.status);
      }
      sql += ` ORDER BY a.scheduled_at DESC LIMIT 15`;
      const { rows } = await pool.query(sql, params);
      return rows;
    }

    case 'get_medications': {
      const { rows } = await pool.query(
        `SELECT name, generic_name, dosage, frequency, route, start_date, status,
                instructions, refills_remaining
         FROM medications
         WHERE patient_id = $1 AND status = 'active'
         ORDER BY start_date DESC`,
        [patient.id]
      );
      return rows;
    }

    case 'get_lab_results': {
      const limit = Math.min(input.limit || 10, 20);
      const { rows } = await pool.query(
        `SELECT test_name, panel_name, value, unit, reference_range, status, resulted_at, notes
         FROM lab_results
         WHERE patient_id = $1
         ORDER BY resulted_at DESC NULLS LAST LIMIT $2`,
        [patient.id, limit]
      );
      return rows;
    }

    case 'get_bills': {
      const [{ rows: bills }, { rows: [summary] }] = await Promise.all([
        pool.query(
          `SELECT description, service_date, due_date, total_amount, insurance_amount,
                  patient_amount, paid_amount, status
           FROM bills WHERE patient_id = $1 ORDER BY due_date DESC`,
          [patient.id]
        ),
        pool.query(
          `SELECT
             COALESCE(SUM(CASE WHEN status IN ('pending','overdue') THEN patient_amount - paid_amount ELSE 0 END), 0) AS outstanding,
             COALESCE(SUM(CASE WHEN status = 'overdue' THEN patient_amount - paid_amount ELSE 0 END), 0) AS overdue,
             COALESCE(SUM(paid_amount), 0) AS total_paid
           FROM bills WHERE patient_id = $1`,
          [patient.id]
        ),
      ]);
      return { bills, summary };
    }

    case 'get_health_summary': {
      const [vitals, allergies, diagnoses] = await Promise.all([
        pool.query(
          `SELECT recorded_at, heart_rate, blood_pressure_systolic, blood_pressure_diastolic,
                  temperature, respiratory_rate, oxygen_saturation, weight, height, bmi, pain_level
           FROM vital_signs WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 3`,
          [patient.id]
        ),
        pool.query(
          'SELECT allergen, reaction, severity FROM allergies WHERE patient_id = $1',
          [patient.id]
        ),
        pool.query(
          `SELECT description, icd_code, status, diagnosed_date
           FROM diagnoses WHERE patient_id = $1 AND status IN ('active','chronic')`,
          [patient.id]
        ),
      ]);
      return {
        patient: { name: `${patient.first_name} ${patient.last_name}`, mrn: patient.mrn },
        recent_vitals: vitals.rows,
        allergies: allergies.rows,
        active_diagnoses: diagnoses.rows,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function runProviderTool(name, input, userId) {
  const { rows: [provider] } = await pool.query(
    'SELECT id, first_name, last_name, specialty FROM providers WHERE user_id = $1',
    [userId]
  );
  if (!provider) throw new Error('Provider record not found');

  switch (name) {
    case 'search_patients': {
      const q = `%${input.query}%`;
      const { rows } = await pool.query(
        `SELECT p.id, p.mrn, p.first_name || ' ' || p.last_name AS name,
                p.date_of_birth, p.gender, p.insurance_provider
         FROM patients p
         WHERE p.first_name ILIKE $1 OR p.last_name ILIKE $1
            OR (p.first_name || ' ' || p.last_name) ILIKE $1
            OR p.mrn ILIKE $1
         LIMIT 10`,
        [q]
      );
      return rows;
    }

    case 'get_patient_chart': {
      const pid = input.patient_id;
      const [meds, labs, allergies, diagnoses, upcoming] = await Promise.all([
        pool.query(
          `SELECT name, dosage, frequency, status FROM medications
           WHERE patient_id = $1 AND status = 'active' LIMIT 10`,
          [pid]
        ),
        pool.query(
          `SELECT test_name, value, unit, reference_range, status, resulted_at
           FROM lab_results WHERE patient_id = $1
           ORDER BY resulted_at DESC NULLS LAST LIMIT 8`,
          [pid]
        ),
        pool.query(
          'SELECT allergen, reaction, severity FROM allergies WHERE patient_id = $1',
          [pid]
        ),
        pool.query(
          `SELECT description, icd_code, status FROM diagnoses
           WHERE patient_id = $1 AND status IN ('active','chronic')`,
          [pid]
        ),
        pool.query(
          `SELECT a.scheduled_at, a.type, a.status, a.chief_complaint
           FROM appointments a
           WHERE a.patient_id = $1 AND a.scheduled_at >= NOW()
           ORDER BY a.scheduled_at ASC LIMIT 5`,
          [pid]
        ),
      ]);
      return {
        active_medications: meds.rows,
        recent_labs: labs.rows,
        allergies: allergies.rows,
        active_diagnoses: diagnoses.rows,
        upcoming_appointments: upcoming.rows,
      };
    }

    case 'get_today_schedule': {
      const { rows } = await pool.query(
        `SELECT a.scheduled_at, a.type, a.status, a.chief_complaint, a.duration_minutes,
                pt.first_name || ' ' || pt.last_name AS patient_name, pt.mrn, pt.date_of_birth
         FROM appointments a
         JOIN patients pt ON a.patient_id = pt.id
         WHERE a.provider_id = $1 AND DATE(a.scheduled_at) = CURRENT_DATE
         ORDER BY a.scheduled_at ASC`,
        [provider.id]
      );
      return rows;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function runAdminTool(name) {
  switch (name) {
    case 'get_system_stats': {
      const [users, appts, revenue] = await Promise.all([
        pool.query(`SELECT role, COUNT(*)::int FROM users WHERE is_active = true GROUP BY role`),
        pool.query(`SELECT status, COUNT(*)::int FROM appointments GROUP BY status`),
        pool.query(`
          SELECT
            COALESCE(SUM(CASE WHEN status IN ('pending','overdue') THEN patient_amount - paid_amount END), 0) AS outstanding,
            COALESCE(SUM(paid_amount), 0) AS collected
          FROM bills`),
      ]);
      return { users: users.rows, appointments: appts.rows, revenue: revenue.rows[0] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── System prompt ──────────────────────────────────────────

function systemPrompt(user, profile) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  if (user.role === 'patient') {
    const name = profile ? `${profile.first_name} ${profile.last_name}` : user.email;
    return `You are CareConnect AI, a helpful healthcare assistant in the CareConnect patient portal.
Today is ${today}. You are assisting patient: ${name}.

You have access to this patient's health records through tools. Use them proactively to answer questions about appointments, medications, lab results, bills, and health summary.

Guidelines:
- Use plain, empathetic language — avoid unnecessary jargon
- For abnormal lab values, acknowledge them clearly and advise discussing with their care team
- For billing questions, provide exact figures from their records
- Never provide diagnoses or replace professional medical advice
- For emergencies, always advise calling 911 or contacting their care team immediately`;
  }

  if (user.role === 'provider') {
    const name = profile ? `Dr. ${profile.first_name} ${profile.last_name}` : user.email;
    return `You are CareConnect AI, a clinical assistant in the CareConnect provider portal.
Today is ${today}. You are assisting provider: ${name} (${profile?.specialty || 'Medicine'}).

You have tools to search patients and pull chart summaries. Be concise and clinical — present data efficiently with the most relevant information first. Use standard medical terminology.`;
  }

  return `You are CareConnect AI, a system assistant in the CareConnect admin portal.
Today is ${today}. You have access to system-wide statistics. Be concise and data-focused.`;
}

// ── POST /api/ai/chat ──────────────────────────────────────

router.post('/chat', authenticate, async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI assistant is not configured on this server' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Load profile for system prompt
    let profile = null;
    if (req.user.role === 'patient') {
      const { rows } = await pool.query(
        'SELECT first_name, last_name, mrn FROM patients WHERE user_id = $1', [req.user.id]
      );
      profile = rows[0] || null;
    } else if (req.user.role === 'provider') {
      const { rows } = await pool.query(
        'SELECT first_name, last_name, specialty FROM providers WHERE user_id = $1', [req.user.id]
      );
      profile = rows[0] || null;
    }

    const tools = req.user.role === 'patient' ? patientTools
                : req.user.role === 'provider' ? providerTools
                : adminTools;

    // Seed conversation — cap history at 10 turns
    const messages = [
      ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.trim() },
    ];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const stream = client.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 2048,
        system: systemPrompt(req.user, profile),
        tools,
        messages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          send({ t: 'text', d: event.delta.text });
        }
      }

      const final = await stream.finalMessage();

      if (final.stop_reason === 'end_turn') break;

      if (final.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: final.content });

        const results = [];
        for (const block of final.content) {
          if (block.type !== 'tool_use') continue;
          let result;
          try {
            if (req.user.role === 'patient') result = await runPatientTool(block.name, block.input, req.user.id);
            else if (req.user.role === 'provider') result = await runProviderTool(block.name, block.input, req.user.id);
            else result = await runAdminTool(block.name);
          } catch (err) {
            logger.warn('AI tool error', { tool: block.name, error: err.message, userId: req.user.id });
            result = { error: err.message };
          }
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        }
        messages.push({ role: 'user', content: results });
      } else {
        break;
      }
    }

    send({ t: 'done' });
  } catch (err) {
    logger.error('AI chat error', { error: err.message, userId: req.user.id });
    send({ t: 'error', m: 'An error occurred. Please try again.' });
  }

  res.end();
});

module.exports = router;
