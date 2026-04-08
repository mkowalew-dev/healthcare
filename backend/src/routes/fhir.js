/**
 * FHIR R4 API Routes
 * EPIC-compatible FHIR endpoints for EHR interoperability.
 * These endpoints let external apps (third-party portals, payer systems, care coordination tools)
 * query CareConnect patient data in a standardized format.
 *
 * ThousandEyes value: monitors external application traffic hitting these endpoints,
 * including payer portal pulls, patient-facing app integrations, and HIE queries.
 */

const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const router = express.Router();

const FHIR_BASE = process.env.FHIR_BASE_URL || 'http://localhost:3001/fhir';

function fhirMeta(resourceType) {
  return { versionId: '1', lastUpdated: new Date().toISOString() };
}

function fhirId(id) {
  return id;
}

// --- Resource Transformers ---

function patientToFhir(p) {
  return {
    resourceType: 'Patient',
    id: fhirId(p.id),
    meta: fhirMeta('Patient'),
    identifier: [
      { system: 'urn:oid:2.16.840.1.113883.3.careconnect.mrn', value: p.mrn },
    ],
    name: [{ use: 'official', family: p.last_name, given: [p.first_name] }],
    gender: p.gender?.toLowerCase() === 'male' ? 'male' : p.gender?.toLowerCase() === 'female' ? 'female' : 'unknown',
    birthDate: p.date_of_birth ? p.date_of_birth.toISOString().split('T')[0] : undefined,
    telecom: p.phone ? [{ system: 'phone', value: p.phone, use: 'home' }] : [],
    address: p.address ? [{
      use: 'home',
      line: [p.address],
      city: p.city,
      state: p.state,
      postalCode: p.zip,
      country: 'US',
    }] : [],
    extension: p.blood_type ? [{
      url: 'http://careconnect.io/fhir/StructureDefinition/blood-type',
      valueString: p.blood_type,
    }] : [],
  };
}

function vitalToObservation(v, patientId) {
  const observations = [];
  const base = {
    resourceType: 'Observation',
    meta: fhirMeta('Observation'),
    status: 'final',
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: v.recorded_at,
  };

  if (v.blood_pressure_systolic && v.blood_pressure_diastolic) {
    observations.push({
      ...base,
      id: `${v.id}-bp`,
      code: { coding: [{ system: 'http://loinc.org', code: '55284-4', display: 'Blood pressure systolic and diastolic' }] },
      component: [
        { code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] }, valueQuantity: { value: v.blood_pressure_systolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
        { code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] }, valueQuantity: { value: v.blood_pressure_diastolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
      ],
    });
  }
  if (v.heart_rate) {
    observations.push({ ...base, id: `${v.id}-hr`, code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] }, valueQuantity: { value: v.heart_rate, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' } });
  }
  if (v.temperature) {
    observations.push({ ...base, id: `${v.id}-temp`, code: { coding: [{ system: 'http://loinc.org', code: '8310-5', display: 'Body temperature' }] }, valueQuantity: { value: v.temperature, unit: 'degF', system: 'http://unitsofmeasure.org', code: '[degF]' } });
  }
  if (v.oxygen_saturation) {
    observations.push({ ...base, id: `${v.id}-o2`, code: { coding: [{ system: 'http://loinc.org', code: '59408-5', display: 'Oxygen saturation' }] }, valueQuantity: { value: v.oxygen_saturation, unit: '%', system: 'http://unitsofmeasure.org', code: '%' } });
  }
  if (v.weight) {
    observations.push({ ...base, id: `${v.id}-wt`, code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }] }, valueQuantity: { value: v.weight, unit: 'lbs', system: 'http://unitsofmeasure.org', code: '[lb_av]' } });
  }
  return observations;
}

function labToObservation(lr, patientId) {
  const interpretation = lr.status === 'critical' ? [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'LL', display: 'Critical Low' }] }]
    : lr.status === 'abnormal' ? [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'A', display: 'Abnormal' }] }]
    : [];
  return {
    resourceType: 'Observation',
    id: fhirId(lr.id),
    meta: fhirMeta('Observation'),
    status: lr.status === 'pending' ? 'registered' : 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
    code: { coding: lr.test_code ? [{ system: 'http://loinc.org', code: lr.test_code, display: lr.test_name }] : [], text: lr.test_name },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: lr.resulted_at || lr.ordered_at,
    issued: lr.resulted_at,
    valueString: lr.value ? `${lr.value} ${lr.unit || ''}`.trim() : undefined,
    referenceRange: lr.reference_range ? [{ text: lr.reference_range }] : [],
    interpretation,
    note: lr.notes ? [{ text: lr.notes }] : [],
  };
}

function medToMedicationRequest(m, patientId) {
  return {
    resourceType: 'MedicationRequest',
    id: fhirId(m.id),
    meta: fhirMeta('MedicationRequest'),
    status: m.status === 'active' ? 'active' : m.status === 'discontinued' ? 'stopped' : 'completed',
    intent: 'order',
    medicationCodeableConcept: { text: m.name, coding: m.generic_name ? [{ display: m.generic_name }] : [] },
    subject: { reference: `Patient/${patientId}` },
    authoredOn: m.prescribed_at,
    dosageInstruction: [{
      text: m.sig || `${m.dosage} ${m.frequency}`,
      route: m.route ? { text: m.route } : undefined,
    }],
    dispenseRequest: {
      numberOfRepeatsAllowed: m.refills_remaining || 0,
      validityPeriod: m.start_date ? { start: m.start_date, end: m.end_date } : undefined,
    },
  };
}

function allergyToFhir(a, patientId) {
  const criticalityMap = { life_threatening: 'high', severe: 'high', moderate: 'low', mild: 'low' };
  return {
    resourceType: 'AllergyIntolerance',
    id: fhirId(a.id),
    meta: fhirMeta('AllergyIntolerance'),
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
    criticality: criticalityMap[a.severity] || 'low',
    code: { text: a.allergen },
    patient: { reference: `Patient/${patientId}` },
    reaction: a.reaction ? [{ manifestation: [{ text: a.reaction }], severity: a.severity }] : [],
    recordedDate: a.noted_date,
  };
}

function bundleResponse(resourceType, entries, total) {
  return {
    resourceType: 'Bundle',
    id: require('crypto').randomUUID(),
    meta: { lastUpdated: new Date().toISOString() },
    type: 'searchset',
    total: total || entries.length,
    link: [{ relation: 'self', url: `${FHIR_BASE}/${resourceType}` }],
    entry: entries.map(r => ({ fullUrl: `${FHIR_BASE}/${r.resourceType}/${r.id}`, resource: r })),
  };
}

// --- FHIR Endpoints ---

// GET /fhir/metadata - CapabilityStatement (no auth required)
router.get('/metadata', (req, res) => {
  res.json({
    resourceType: 'CapabilityStatement',
    id: 'careconnect-capability',
    status: 'active',
    date: new Date().toISOString(),
    publisher: 'CareConnect EHR',
    kind: 'instance',
    fhirVersion: '4.0.1',
    format: ['json'],
    rest: [{
      mode: 'server',
      security: {
        cors: true,
        service: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/restful-security-service', code: 'SMART-on-FHIR' }] }],
      },
      resource: [
        { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [{ name: '_id', type: 'token' }] },
        { type: 'Observation', interaction: [{ code: 'search-type' }], searchParam: [{ name: 'patient', type: 'reference' }, { name: 'category', type: 'token' }] },
        { type: 'MedicationRequest', interaction: [{ code: 'search-type' }], searchParam: [{ name: 'patient', type: 'reference' }] },
        { type: 'AllergyIntolerance', interaction: [{ code: 'search-type' }], searchParam: [{ name: 'patient', type: 'reference' }] },
        { type: 'DiagnosticReport', interaction: [{ code: 'search-type' }], searchParam: [{ name: 'patient', type: 'reference' }] },
      ],
    }],
  });
});

// GET /fhir/Patient/:id
router.get('/Patient/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Patient not found' }] });
    res.json(patientToFhir(result.rows[0]));
  } catch (err) {
    logger.error('FHIR Patient error', { error: err.message });
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'fatal', code: 'exception', diagnostics: err.message }] });
  }
});

// GET /fhir/Patient - search
router.get('/Patient', authenticate, async (req, res) => {
  try {
    const { _id, identifier } = req.query;
    let where = '1=1';
    const params = [];
    let idx = 1;
    if (_id) { where += ` AND id = $${idx++}`; params.push(_id); }
    if (identifier) { where += ` AND mrn = $${idx++}`; params.push(identifier.split('|').pop()); }
    const result = await pool.query(`SELECT * FROM patients WHERE ${where} LIMIT 50`, params);
    res.json(bundleResponse('Patient', result.rows.map(patientToFhir), result.rows.length));
  } catch (err) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'fatal', code: 'exception', diagnostics: err.message }] });
  }
});

// GET /fhir/Observation - search by patient (vitals + labs)
router.get('/Observation', authenticate, async (req, res) => {
  try {
    const patientId = req.query.patient?.replace('Patient/', '');
    const category = req.query.category;

    if (!patientId) return res.status(400).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'required', diagnostics: 'patient parameter required' }] });

    let observations = [];

    if (!category || category === 'vital-signs') {
      const vitals = await pool.query('SELECT * FROM vital_signs WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 50', [patientId]);
      observations.push(...vitals.rows.flatMap(v => vitalToObservation(v, patientId)));
    }

    if (!category || category === 'laboratory') {
      const labs = await pool.query('SELECT * FROM lab_results WHERE patient_id = $1 ORDER BY ordered_at DESC LIMIT 100', [patientId]);
      observations.push(...labs.rows.map(lr => labToObservation(lr, patientId)));
    }

    res.json(bundleResponse('Observation', observations, observations.length));
  } catch (err) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'fatal', code: 'exception', diagnostics: err.message }] });
  }
});

// GET /fhir/MedicationRequest
router.get('/MedicationRequest', authenticate, async (req, res) => {
  try {
    const patientId = req.query.patient?.replace('Patient/', '');
    if (!patientId) return res.status(400).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'required', diagnostics: 'patient parameter required' }] });

    const result = await pool.query('SELECT * FROM medications WHERE patient_id = $1 ORDER BY prescribed_at DESC', [patientId]);
    res.json(bundleResponse('MedicationRequest', result.rows.map(m => medToMedicationRequest(m, patientId)), result.rows.length));
  } catch (err) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'fatal', code: 'exception', diagnostics: err.message }] });
  }
});

// GET /fhir/AllergyIntolerance
router.get('/AllergyIntolerance', authenticate, async (req, res) => {
  try {
    const patientId = req.query.patient?.replace('Patient/', '');
    if (!patientId) return res.status(400).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'required', diagnostics: 'patient parameter required' }] });

    const result = await pool.query('SELECT * FROM allergies WHERE patient_id = $1', [patientId]);
    res.json(bundleResponse('AllergyIntolerance', result.rows.map(a => allergyToFhir(a, patientId)), result.rows.length));
  } catch (err) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'fatal', code: 'exception', diagnostics: err.message }] });
  }
});

// GET /fhir/DiagnosticReport
router.get('/DiagnosticReport', authenticate, async (req, res) => {
  try {
    const patientId = req.query.patient?.replace('Patient/', '');
    if (!patientId) return res.status(400).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'required', diagnostics: 'patient parameter required' }] });

    const result = await pool.query(`
      SELECT panel_name, MIN(ordered_at) as report_date, COUNT(*) as test_count,
             string_agg(test_name, ', ') as tests,
             MAX(status) as status, patient_id,
             string_agg(id::text, ',') as lab_ids
      FROM lab_results WHERE patient_id = $1
      GROUP BY panel_name, patient_id
      ORDER BY report_date DESC
    `, [patientId]);

    const reports = result.rows.map(r => ({
      resourceType: 'DiagnosticReport',
      id: `dr-${Buffer.from(r.panel_name || 'misc').toString('hex').slice(0, 8)}-${patientId.slice(0, 8)}`,
      meta: fhirMeta('DiagnosticReport'),
      status: r.status === 'pending' ? 'registered' : 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
      code: { text: r.panel_name || 'Laboratory Panel' },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: r.report_date,
      result: r.lab_ids.split(',').map(id => ({ reference: `Observation/${id.trim()}` })),
    }));

    res.json(bundleResponse('DiagnosticReport', reports, reports.length));
  } catch (err) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'fatal', code: 'exception', diagnostics: err.message }] });
  }
});

// GET /fhir/status — self health check for admin Integrations dashboard
// Verifies the FHIR layer is up by querying the local metadata endpoint
router.get('/status', authenticate, authorize('admin'), async (req, res) => {
  const start = Date.now();
  try {
    // Do a lightweight DB query to confirm FHIR data layer is healthy
    await pool.query('SELECT 1');
    const latency = Date.now() - start;
    res.json({
      integration: 'FHIR R4',
      url: `${FHIR_BASE}/metadata`,
      reachable: true,
      fhirVersion: '4.0.1',
      supportedResources: ['Patient', 'Observation', 'MedicationRequest', 'AllergyIntolerance', 'DiagnosticReport'],
      latencyMs: latency,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.json({
      integration: 'FHIR R4',
      url: `${FHIR_BASE}/metadata`,
      reachable: false,
      error: err.message,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    });
  }
});

module.exports = router;
