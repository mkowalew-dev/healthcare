# ThousandEyes API Test Suite — CareConnect EHR

Configured using the **API Test** type (Network & Synthetics → Test Settings → Web & API Tests → API Performance). Each test is a multi-step sequence: step 1 logs in and extracts a JWT, subsequent steps use `{{token}}` as the Bearer token. No external cron refresh needed.

> **Agent requirement:** Enterprise Agents running API tests must have the BrowserBot component installed. API tests are not supported on Cisco devices.

---

## Credentials repository

Store secrets in **Settings → Credentials Repository** before creating any test. Reference them in step fields — **including step URLs** — with `{{$credentialName}}`. Centralizing the repeatedly-used patient and provider identifiers here keeps PHI-style values out of the individual test definitions and lets you re-point the entire suite at a different seed record by editing a single vault entry.

| Credential name | Value | Used for |
|----------------|-------|----------|
| `cc_provider_password` | `Demo123!` | Provider / admin login password |
| `cc_admin_password` | `Demo123!` | Admin login password |
| `cc_patient_id` | `66666666-0000-0000-0000-000000000001` | Seeded demo patient — John Smith (`patient@careconnect.demo`); used in most step URLs |
| `cc_provider_id` | `33333333-0000-0000-0000-000000000001` | Seeded demo provider — Dr. Michael Chen (`provider@careconnect.demo`); used in Providers test URLs |

> Credentials are masked in test results and never exposed in the UI or API response — so the patient and provider IDs stay out of shared test output as well.

---

## Fixed seed identifiers

These IDs are stable across all seeded deployments. Rather than hardcoding them, they live in the credential vault (above) and are referenced in step URLs as `{{$cc_patient_id}}` and `{{$cc_provider_id}}`, giving the suite a single point of administration.

| Resource | Vault reference | Value |
|----------|-----------------|-------|
| Patient — John Smith (`patient@careconnect.demo`) | `{{$cc_patient_id}}` | `66666666-0000-0000-0000-000000000001` |
| Provider — Dr. Michael Chen (`provider@careconnect.demo`) | `{{$cc_provider_id}}` | `33333333-0000-0000-0000-000000000001` |

---

## Test inventory

| Test name | Steps | Auth | Timeout |
|-----------|-------|------|---------|
| `CareConnect — Infrastructure` | 2 | None | 5 s |
| `CareConnect — FHIR R4 Suite` | 8 | Provider login | 20 s |
| `CareConnect — Labs & LIS` | 4 | Provider login | 15 s |
| `CareConnect — Providers` | 5 | Provider login | 15 s |
| `CareConnect — ePrescriptions` | 4 | Provider login | 12 s |
| `CareConnect — Appointments` | 4 | Provider login | 12 s |
| `CareConnect — Patients & Clinical` | 7 | Provider login | 20 s |
| `CareConnect — Integration Status` | 5 | Admin login | 15 s |
| `CareConnect — Haiku Mobile` | 7 | Provider login | 15 s |
| `CareConnect — AI Liveness` | 1 | None | 5 s |
| `CareConnect — AI Assistant` | 3 | Provider login | 30 s |

Set **API Target Time for View** to 3 s on all tests. Set it to **2 s** on the Haiku test — mobile clinicians making time-critical decisions (critical lab sign-off) have lower tolerance for latency than desktop users. Set it to **10 s** on the AI Assistant test — SSE streams take longer than REST responses as Claude generates output token-by-token.

> Frequency values in each test header are recommended defaults — adjust per environment. Cheap liveness checks run hot (1 min); read suites and integration heartbeats run at the standard 5 min cadence. Token-consuming AI tests run at 30 min to limit Anthropic API spend.

---

## Test 1 — Infrastructure

**Test name:** `CareConnect — Infrastructure`  
**Timeout:** 5 s  
**Frequency:** 1 min  
**Base URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** The fastest, cheapest signal that the load balancer and API gateway are up. It runs without authentication, so it keeps reporting even when the login path or database is degraded — isolating "is the edge reachable" from "is the application healthy."

---

**Step 1 — Health check**

Confirms the API gateway is up and its database connection is healthy. This is the canonical liveness probe — it returns `"status":"healthy"` only when the gateway can reach Postgres.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/health` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"status":"healthy"` |

---

**Step 2 — ALB ping**

A lightweight load-balancer reachability check served by nginx at the edge. It returns `pong` without touching the API or database, isolating network/ALB health from application health.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/ping` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `pong` |

> Also create a matching `MyChart — Infrastructure` test pointing to `https://mychart.pseudo-co.com/health` and `/ping` with the same assertions.

---

## Test 2 — FHIR R4 Suite

**Test name:** `CareConnect — FHIR R4 Suite`  
**Timeout:** 20 s  
**Frequency:** 5 min  
**Base URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** Exercises the EPIC-compatible FHIR R4 surface that external apps, payer portals, and HIE partners depend on. Each resource type is validated independently, so a single broken transformer is easy to localize.

---

**Step 1 — Login (provider)**

Authenticates as the demo provider and extracts the JWT used as the Bearer token for every subsequent step. A failure here fails the whole sequence.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://careconnect.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"provider@careconnect.demo","password":"{{$cc_provider_password}}"}` |
| Content-Type header | `application/json` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `token` | `token` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"token"` |

---

**Step 2 — FHIR CapabilityStatement**

Fetches the FHIR conformance/metadata document. Confirms the FHIR layer is serving and advertising R4 (`4.0.1`).

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/metadata` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"CapabilityStatement"` |
| Response Body | contains | `"fhirVersion":"4.0.1"` |

---

**Step 3 — FHIR Patient by ID**

Reads a single Patient resource by its stable seeded UUID. Validates the Patient read interaction and resource transform.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/Patient/{{$cc_patient_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"Patient"` |

---

**Step 4 — FHIR Patient search**

Searches Patient by `_id`. Confirms search returns a FHIR `Bundle` (searchset) rather than a bare resource.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/Patient?_id={{$cc_patient_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"Bundle"` |

---

**Step 5 — FHIR Observations**

Searches Observations (vitals + labs) for the patient. Confirms the Observation search returns a `Bundle`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/Observation?patient={{$cc_patient_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"Bundle"` |

---

**Step 6 — FHIR MedicationRequest**

Searches the patient's active and historical medication orders. Confirms MedicationRequest search returns a `Bundle`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/MedicationRequest?patient={{$cc_patient_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"Bundle"` |

---

**Step 7 — FHIR AllergyIntolerance**

Searches the patient's allergy list. Confirms AllergyIntolerance search returns a `Bundle`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/AllergyIntolerance?patient={{$cc_patient_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"Bundle"` |

---

**Step 8 — FHIR DiagnosticReport**

Searches diagnostic reports (lab panels grouped into reports). Confirms DiagnosticReport search returns a `Bundle`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/DiagnosticReport?patient={{$cc_patient_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"Bundle"` |

---

## Test 3 — Labs & LIS

**Test name:** `CareConnect — Labs & LIS`  
**Timeout:** 15 s  
**Frequency:** 5 min  
**Base URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** Covers the clinician lab-review path and the Quest/LabCorp LIS integration surface. The admin-only LIS *integration status* endpoint is validated in [Test 8 — Integration Status, Step 3](#step-3--quest--labcorp-lis); this test stays on the provider token, which returns `403 Insufficient permissions` on that admin-only endpoint, so it is intentionally omitted here.

---

**Step 1 — Login (provider)**

Authenticates as the demo provider and extracts the JWT used as the Bearer token for every subsequent step. A failure here fails the whole sequence.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://careconnect.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"provider@careconnect.demo","password":"{{$cc_provider_password}}"}` |
| Content-Type header | `application/json` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `token` | `token` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"token"` |

---

**Step 2 — Labs list**

Lists the patient's lab results and extracts the first result ID for the next step. Confirms result rows carry `test_name`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/labs?patientId={{$cc_patient_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `labId` | `[0].id` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"test_name"` |

---

**Step 3 — Lab result by ID**

Reads a single lab result using the `{{labId}}` extracted in step 2. Confirms the result detail includes the test name and its `value` (the `lab_results` column is `value`, not `result_value`).

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/labs/{{labId}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"test_name"` |
| Response Body | contains | `"value"` |

---

**Step 4 — LIS orders list**

Lists outbound LIS orders (HL7 ORM records) and confirms rows carry `order_number` (the `lis_orders` column is `order_number`, not `order_id`). ⚠️ **Data prerequisite:** `lis_orders` is only written by `POST /api/labs` and is **not** seeded, so a freshly seeded deployment returns `[]` and the body assertion fails — seed `lis_orders` or scope this step to the HTTP 200 check only.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/labs/lis-orders` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"order_number"` |

---

## Test 4 — Providers

**Test name:** `CareConnect — Providers`  
**Timeout:** 15 s  
**Frequency:** 5 min  
**Base URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** Validates the provider directory and scheduling-availability endpoints that power both the desktop portal and patient-facing booking.

---

**Step 1 — Login (provider)**

Authenticates as the demo provider and extracts the JWT used as the Bearer token for every subsequent step. A failure here fails the whole sequence.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://careconnect.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"provider@careconnect.demo","password":"{{$cc_provider_password}}"}` |
| Content-Type header | `application/json` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `token` | `token` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"token"` |

---

**Step 2 — Provider list**

Lists providers and extracts the first provider ID. Confirms rows carry `specialty`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/providers` |
| Auth | Bearer Token → `{{token}}` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `providerId` | `[0].id` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"specialty"` |

---

**Step 3 — Provider by ID**

Reads Dr. Michael Chen by his stable seeded UUID (no extraction needed). Confirms the profile includes the specialty and the expected name.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/providers/{{$cc_provider_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"specialty"` |
| Response Body | contains | `"Michael"` |

---

**Step 4 — Provider availability**

Returns open scheduling slots for the provider as a bare JSON array of `{time, available}` objects — there is no `slots` wrapper key, so the assertion checks `available`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/providers/{{$cc_provider_id}}/availability` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"available"` |

---

**Step 5 — Provider me (self-profile)**

Returns the authenticated provider's own profile, resolved from the JWT. Confirms the response includes `first_name`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/providers/me` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"first_name"` |

---

## Test 5 — ePrescriptions

**Test name:** `CareConnect — ePrescriptions`  
**Timeout:** 12 s  
**Frequency:** 5 min  
**Base URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** Exercises the ePrescribe read path and the Surescripts SCRIPT 10.6 integration surface used for medication ordering.

---

**Step 1 — Login (provider)**

Authenticates as the demo provider and extracts the JWT used as the Bearer token for every subsequent step. A failure here fails the whole sequence.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://careconnect.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"provider@careconnect.demo","password":"{{$cc_provider_password}}"}` |
| Content-Type header | `application/json` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `token` | `token` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"token"` |

---

**Step 2 — Prescription list**

Lists the patient's prescriptions and extracts the first prescription ID. Confirms rows carry `medication_name`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/eprescribe?patientId={{$cc_patient_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `rxId` | `[0].id` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"medication_name"` |

---

**Step 3 — Prescription by ID**

Reads a single prescription using `{{rxId}}` from step 2. Confirms the detail includes the medication name and the `surescripts_rx_id` assigned on submission.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/eprescribe/{{rxId}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"medication_name"` |
| Response Body | contains | `"surescripts_rx_id"` |

---

**Step 4 — Surescripts integration status**

Checks reachability of the Surescripts ePrescribing network. Confirms the connectivity payload includes `reachable`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/eprescribe/integration/status` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"reachable"` |

---

## Test 6 — Appointments

**Test name:** `CareConnect — Appointments`  
**Timeout:** 12 s  
**Frequency:** 5 min  
**Base URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** Covers the appointment list/detail path and re-validates the JWT mid-sequence. The list is paginated to keep the payload small.

---

**Step 1 — Login (provider)**

Authenticates as the demo provider and extracts the JWT used as the Bearer token for every subsequent step. A failure here fails the whole sequence.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://careconnect.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"provider@careconnect.demo","password":"{{$cc_provider_password}}"}` |
| Content-Type header | `application/json` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `token` | `token` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"token"` |

---

**Step 2 — Appointments list**

Lists the patient's appointments (capped with `?limit=10`) and extracts the first appointment ID. The list was unbounded before v2.0.1 (212 kB); pagination was added in the v2.0.1 performance work. Confirms rows carry `scheduled_at`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/appointments?patientId={{$cc_patient_id}}&limit=10` |
| Auth | Bearer Token → `{{token}}` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `apptId` | `[0].id` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"scheduled_at"` |

---

**Step 3 — Appointment by ID**

Reads a single appointment using `{{apptId}}` from step 2. Confirms the detail includes `scheduled_at` and `status`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/appointments/{{apptId}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"scheduled_at"` |
| Response Body | contains | `"status"` |

---

**Step 4 — Current user (auth validation)**

Calls `/api/auth/me` to confirm the token is still valid mid-sequence. Confirms the response includes `role`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/auth/me` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"role"` |

---

## Test 7 — Patients & Clinical

**Test name:** `CareConnect — Patients & Clinical`  
**Timeout:** 20 s  
**Frequency:** 5 min  
**Base URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** The heaviest clinical read path — patient demographics, the aggregated chart summary, vitals, medications, and notes. The summary step is the most expensive call in the suite.

---

**Step 1 — Login (provider)**

Authenticates as the demo provider and extracts the JWT used as the Bearer token for every subsequent step. A failure here fails the whole sequence.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://careconnect.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"provider@careconnect.demo","password":"{{$cc_provider_password}}"}` |
| Content-Type header | `application/json` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `token` | `token` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"token"` |

---

**Step 2 — Patient list**

Lists the provider's patients. Confirms rows carry `mrn`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/patients` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"mrn"` |

---

**Step 3 — Patient by ID**

Reads the seeded patient (John Smith) by UUID. Confirms the record includes the MRN and expected name.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/patients/{{$cc_patient_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"mrn"` |
| Response Body | contains | `"John"` |

---

**Step 4 — Patient chart summary**

The most expensive call — full chart aggregation across multiple tables. Confirms the aggregated payload includes `activeMedications` and `recentLabs` (the summary endpoint's actual top-level keys).

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/patients/{{$cc_patient_id}}/summary` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"activeMedications"` |
| Response Body | contains | `"recentLabs"` |

---

**Step 5 — Patient vitals**

Returns the patient's vital-sign history. Confirms rows carry `blood_pressure_systolic` (the schema stores systolic/diastolic separately — there is no combined `blood_pressure` field).

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/patients/{{$cc_patient_id}}/vitals` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"blood_pressure_systolic"` |

---

**Step 6 — Medications list**

Lists the patient's medications. The `medications` table column is `name` (not `medication_name`, which belongs to the ePrescribe `prescriptions` table), so the assertion checks the medication-specific `generic_name`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/medications?patientId={{$cc_patient_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"generic_name"` |

---

**Step 7 — Clinical notes**

Lists the patient's clinical notes. Confirms rows carry `note_type`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/notes?patientId={{$cc_patient_id}}` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"note_type"` |

---

## Test 8 — Integration Status

**Test name:** `CareConnect — Integration Status`  
**Timeout:** 15 s  
**Frequency:** 5 min  
**Base URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** A cheap, high-value heartbeat across every external SaaS dependency (Surescripts, Quest/LabCorp, Twilio/SendGrid, FHIR). It runs on the admin token because the integration-status endpoints are admin-only.

---

**Step 1 — Login (admin)**

Authenticates as the demo admin and extracts `{{adminToken}}` — the integration-status endpoints require the admin role, so this test uses an admin login rather than the provider login.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://careconnect.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"admin@careconnect.demo","password":"{{$cc_admin_password}}"}` |
| Content-Type header | `application/json` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `adminToken` | `token` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"token"` |

---

**Step 2 — Surescripts (ePrescribing)**

Checks the Surescripts ePrescribing dependency. Confirms the payload reports `reachable:true`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/eprescribe/integration/status` |
| Auth | Bearer Token → `{{adminToken}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"reachable":true` |

---

**Step 3 — Quest / LabCorp LIS**

Checks the Quest and LabCorp LIS dependencies. Confirms the payload includes the per-vendor `integrations` array.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/labs/integration/status` |
| Auth | Bearer Token → `{{adminToken}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"integrations"` |

---

**Step 4 — Twilio / SendGrid notifications**

Checks the Twilio SMS and SendGrid email dependencies. Confirms the payload includes `reachable` for each vendor.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/notifications/integration/status` |
| Auth | Bearer Token → `{{adminToken}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"reachable"` |

---

**Step 5 — FHIR integration status**

Checks the FHIR R4 data layer. Confirms the payload includes `fhirVersion`.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/status` |
| Auth | Bearer Token → `{{adminToken}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"fhirVersion"` |

---

## Test 9 — Haiku Mobile

**Test name:** `CareConnect — Haiku Mobile`  
**Timeout:** 15 s  
**Frequency:** 5 min  
**Base URL:** `https://mobile.pseudo-co.com` — all steps in this test use the mobile subdomain, giving ThousandEyes a distinct network path to trace and Splunk RUM a separate `careconnect-haiku` session to measure.

> **Why this test matters?** Haiku is used at the point of care — a clinician glancing at their phone between patient rooms. Any response > 3 s is clinically disruptive, so alert thresholds for this test are tighter than the desktop portal equivalents. The in-basket and aggregation endpoints are the highest-value mobile signals.

---

**Step 1 — Login (provider)**

Authenticates as the demo provider against the mobile subdomain and extracts the JWT used as the Bearer token for every subsequent step. A failure here fails the whole sequence.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://mobile.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"provider@careconnect.demo","password":"{{$cc_provider_password}}"}` |
| Content-Type header | `application/json` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `token` | `token` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"token"` |

---

**Step 2 — In-basket (inbox)**

The highest-value Haiku endpoint. Aggregates unread messages, critical/abnormal labs, and zero-refill medications in a single call. A slow or failed response means the provider misses critical alert badges. Extracts a critical-lab ID and a message ID for later steps.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://mobile.pseudo-co.com/api/haiku/inbox` |
| Auth | Bearer Token → `{{token}}` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `criticalLabId` | `critical_labs[0].id` |
| `msgId` | `messages[0].id` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"badge_count"` |
| Response Body | contains | `"critical_labs"` |
| Response Body | contains | `"messages"` |
| Response Body | contains | `"refill_requests"` |

---

**Step 3 — Today's schedule**

Validates that the schedule aggregation works and returns the appointment shape expected by the mobile UI.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://mobile.pseudo-co.com/api/haiku/schedule` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |

---

**Step 4 — Patient worklist**

Validates the worklist aggregation including urgency signal counts, and extracts a patient ID for the next step.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://mobile.pseudo-co.com/api/haiku/worklist` |
| Auth | Bearer Token → `{{token}}` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `patientId` | `[0].id` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"critical_labs"` |
| Response Body | contains | `"active_meds"` |

---

**Step 5 — Patient Quick View**

The most expensive Haiku call — six parallel DB queries aggregated into one mobile payload (vitals, diagnoses, labs, meds, allergies, patient demographics). Uses the seeded patient UUID so the step never fails due to an empty worklist.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://mobile.pseudo-co.com/api/haiku/patients/{{$cc_patient_id}}/quickview` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"vitals"` |
| Response Body | contains | `"medications"` |
| Response Body | contains | `"allergies"` |
| Response Body | contains | `"diagnoses"` |
| Response Body | contains | `"recent_labs"` |

---

**Step 6 — Auth validation (token integrity)**

Confirms the JWT is still valid after the full sequence. Mirrors the pattern used in the Appointments test.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://mobile.pseudo-co.com/api/auth/me` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"role"` |

---

**Step 7 — Lab acknowledge (write path)**

Exercises the Haiku write path by acknowledging a critical lab via PATCH, using the `{{criticalLabId}}` extracted in step 2, and verifies the `careconnect-haiku` service handles PATCH requests correctly. A `404` is an acceptable pass as well — it occurs when `criticalLabId` is empty or the lab was already acknowledged on a prior run — so configure the assertion/alert to treat `200` **or** `404` as success and the step stays green across seed states.

| Field | Value |
|-------|-------|
| Method | `PATCH` |
| URL | `https://mobile.pseudo-co.com/api/haiku/labs/{{criticalLabId}}/acknowledge` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |

---

## Test 10 — AI Liveness

**Test name:** `CareConnect — AI Liveness`
**Timeout:** 5 s
**Frequency:** 2 min
**Base URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** Confirms the `careconnect-ai` microservice (port 3018) is running and routing correctly through the API gateway — without spending a single Anthropic token. The AI service returns `401` before invoking Claude when no valid JWT is supplied. A non-401 response (`502`, `503`, `504`) means the gateway cannot reach the AI service process; a `200` means the auth middleware has broken.

---

**Step 1 — AI service reachability (unauthenticated)**

Sends an unauthenticated POST and asserts a `401`. Auth middleware rejects the request before any Claude API call is made, so this step costs zero tokens while still proving the full routing path — nginx → API gateway → `careconnect-ai` (port 3018).

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://careconnect.pseudo-co.com/api/ai/chat` |
| Auth | None |
| Body | `{"message":"hello","history":[]}` |
| Content-Type header | `application/json` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `401` |

---

## Test 11 — AI Assistant

**Test name:** `CareConnect — AI Assistant`
**Timeout:** 30 s
**Frequency:** 30 min
**Base URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** Validates the full AI path — JWT auth → `careconnect-ai` service → Anthropic Claude API → SSE stream completion. Catches failures the liveness test cannot see: an expired or rate-limited Anthropic API key, a Claude API error wrapped in an SSE error event, or a broken streaming pipeline. The `"hello"` prompt minimises token usage while still exercising role-based tool selection and the SSE completion event.
>
> **Agent selection:** Assign to **one cloud agent only — US East** (the region matching your ALB). Running from multiple agents multiplies Anthropic token spend linearly with no additional signal for detecting outages.

---

**Step 1 — Login (provider)**

Authenticates as the demo provider and extracts the JWT used as the Bearer token for the AI chat step. A failure here fails the whole sequence.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://careconnect.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"provider@careconnect.demo","password":"{{$cc_provider_password}}"}` |
| Content-Type header | `application/json` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `token` | `token` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"token"` |

---

**Step 2 — AI ping (real Anthropic call, plain JSON)**

Calls `GET /api/ai/ping` — a dedicated probe endpoint that makes a real, non-streaming Anthropic API call (`max_tokens=5`) and returns plain JSON. This avoids the `text/event-stream` limitation of the main chat endpoint while still proving the complete path: JWT auth → `careconnect-ai` service → Anthropic API key valid → Claude responds. A `503` indicates the API key is missing, expired, or Anthropic rejected the request.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/ai/ping` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"status":"ok"` |
| Response Body | contains | `"model"` |

---

**Step 3 — Tool-call validation (hallucination detection)**

Calls `GET /api/ai/validate` — a probe that forces Claude to invoke `get_patient_chart` on the seeded patient (`{{$cc_patient_id}}`) using `tool_choice: { type: "tool", name: "get_patient_chart" }`. This makes the test deterministic: Claude cannot respond with text instead of a tool call. The endpoint executes the tool against the real database, then asserts at least one of `active_medications`, `recent_labs`, or `allergies` is non-empty. A `"data_verified":false` response means the DB returned empty arrays for the seeded patient — a seeding or data integrity issue, not an AI issue. A missing `"tool_called"` field means Claude did not perform a tool call, indicating a model behaviour regression.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/ai/validate` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"status":"ok"` |
| Response Body | contains | `"tool_called":"get_patient_chart"` |
| Response Body | contains | `"data_verified":true` |

---

## Anthropic API network monitoring

These three tests monitor the Anthropic API dependency at the network layer — DNS resolution and TCP/TLS reachability — without making any model inference calls. They mirror the DNS Trace, DNS Nameservers, and API Server tests in the ThousandEyes AWS Bedrock deploy template, adapted for `api.anthropic.com`.

> **Why not the Bedrock template?** CareConnect calls the Anthropic API directly (`api.anthropic.com`) via `@anthropic-ai/sdk` — it does not use AWS Bedrock. The Bedrock template targets `bedrock-runtime.{region}.amazonaws.com` and does not apply. If the team migrates to Bedrock-hosted Claude in the future, the Bedrock deploy template can be applied as-is and these three custom tests replaced.

| Test name | Type | Frequency | Agents |
|-----------|------|-----------|--------|
| `Anthropic API — DNS Trace` | DNS Trace | 2 min | Cloud US East + US West · Enterprise Agent at clinic site |
| `Anthropic API — DNS Nameservers` | DNS Server | 2 min | Cloud US East + US West · Enterprise Agent at clinic site |
| `Anthropic API — Reachability` | HTTP Server | 2 min | Cloud US East + US West · Enterprise Agent at clinic site |

**Anthropic API — DNS Trace**
- **Domain:** `api.anthropic.com`
- **Why:** Surfaces DNS resolution failures and routing anomalies before the AI service attempts a connection. Appears in Path Visualization alongside the application hop path.

**Anthropic API — DNS Nameservers**
- **Domain:** `api.anthropic.com`
- **Why:** Validates each authoritative nameserver responds correctly; isolates single-nameserver failures from full DNS outages.

**Anthropic API — Reachability**
- **URL:** `https://api.anthropic.com`
- **Assert:** HTTP Status Code is not `5xx` *(Anthropic returns `404` on the root — expected and still proves TLS handshake + routing)*
- **Why:** Confirms TCP/TLS connectivity to Anthropic's API surface without invoking model inference. A `5xx` here with a healthy AI Liveness test (401) pinpoints an Anthropic-side outage rather than a local service failure.

---

## Alert thresholds

Configure these in **Alert Rules** assigned to each test.

| Test | Availability alert | Response time alert |
|------|--------------------|---------------------|
| Infrastructure (health/ping) | Any step HTTP ≠ 200 | > 500 ms |
| FHIR R4 Suite | Any step HTTP ≠ 200, or assertion fails | Total sequence > 10 s |
| Labs & LIS | Any step HTTP ≠ 200 | Total sequence > 8 s |
| Providers | Any step HTTP ≠ 200 | Total sequence > 8 s |
| ePrescriptions | Any step HTTP ≠ 200 | Total sequence > 8 s |
| Appointments | Any step HTTP ≠ 200 | Total sequence > 6 s |
| Patients & Clinical | Any step HTTP ≠ 200 | Total sequence > 12 s |
| Integration Status | Any step HTTP ≠ 200, or `"reachable":true` missing | Total sequence > 10 s |
| **Haiku Mobile** | **Any step HTTP ≠ 200 (step 7 also accepts 404), or assertion fails** | **Total sequence > 8 s · inbox step alone > 3 s** |
| AI Liveness | HTTP ≠ 401 (service unreachable or auth middleware broken) | > 1 s (a slow 401 indicates `careconnect-ai` is overloaded) |
| AI Assistant | Any step HTTP ≠ 200; step 2: `"status":"ok"` or `"model"` missing; step 3: `"tool_called":"get_patient_chart"` missing or `"data_verified":true` missing | Total sequence > 20 s |
| Anthropic API — Reachability | HTTP 5xx | > 2 s |

For the Integration Status test, set **"Error Type = Any"** on the alert rule so that an assertion failure on `"reachable":true` triggers the same alert as an HTTP 503.

For the AI Liveness test, set **"Error Type = Any"** so that an assertion failure (non-401 response) triggers the same alert as a connection error — a `200` indicating broken auth is as critical as a `503` indicating a dead process.

For the AI Assistant test, create **two alert rules**:
1. **AI — Availability**: Error Type = Any, triggers when any step returns non-200 or a body assertion fails. A `503` on step 2 indicates the Anthropic API key is missing, expired, or rate-limited; `"status":"ok"` missing with HTTP 200 indicates an unexpected response shape. Rationale: either condition means every portal user loses access to the AI assistant.
2. **AI — Latency**: Condition = Total sequence response time > 20 000 ms. Assign to the single US East cloud agent running this test. This catches Claude API degradation (slow inference) before hitting the 30 s test timeout.

For the Haiku Mobile test, create **two alert rules**:
1. **Haiku — Availability**: Error Type = Any, triggers when any step returns non-200 (except step 7, which also accepts 404) or an assertion fails. Rationale: a failed inbox call means a provider cannot see critical lab alerts.
2. **Haiku — Latency**: Condition = Response time of step 2 (inbox) > 3 000 ms. Assign to at least one cloud agent in the same AWS region as your deployment. This catches `careconnect-haiku` service degradation before it affects the full sequence timeout.

---

## Recommended agent selection

| Agent type | Purpose |
|------------|---------|
| Cloud agents — US East / US West | Baseline availability and latency from AWS regions matching your ALB placement |
| Cloud agents — EU / APAC | Simulate cross-region access for international integration partners (Surescripts, Quest) |
| Enterprise Agent at clinic site | Network-path visibility (BGP, hops) from the actual clinical network to the ALB |
| Enterprise Agent on LTE/5G cellular network | **Haiku Mobile test only** — simulates a provider using the app on a mobile data connection outside the hospital; surfaces latency variance not visible from wired cloud agents |
| **Single cloud agent — US East only** | **AI Assistant test only** — running from multiple agents multiplies Anthropic token spend linearly; one regional agent is sufficient to detect Claude API outages and latency degradation |

> **Haiku agent recommendation:** Assign the Haiku Mobile test to **both** a cloud agent (wired baseline) and a cellular Enterprise Agent (mobile path). The inbox aggregation endpoint calls four internal loopback services; cellular jitter often exposes timeout fragility that wired agents do not. A delta > 500 ms between the two agent groups is a reliable indicator of mobile network path degradation worth investigating.

---

## Bulk validation script

Run this before configuring ThousandEyes to confirm all endpoints return 200 from your local machine.

```bash
#!/bin/bash
BASE=https://careconnect.pseudo-co.com
MOBILE=https://mobile.pseudo-co.com
PATIENT=66666666-0000-0000-0000-000000000001
PROVIDER=33333333-0000-0000-0000-000000000001

TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"provider@careconnect.demo","password":"Demo123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

ADMIN_TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@careconnect.demo","password":"Demo123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

check() {
  local name="$1" url="$2" token="${3:-$TOKEN}"
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $token" "$url")
  [ "$http_code" = "200" ] \
    && printf "  ✓  %-55s %s\n" "$name" "$http_code" \
    || printf "  ✗  %-55s %s\n" "$name" "$http_code"
}

echo ""
echo "=== Infrastructure ==="
check "Health"                    "$BASE/health"                              ""
check "Ping"                      "$BASE/ping"                                ""

echo ""
echo "=== FHIR R4 ==="
check "CapabilityStatement"       "$BASE/fhir/metadata"
check "Patient by ID"             "$BASE/fhir/Patient/$PATIENT"
check "Patient search"            "$BASE/fhir/Patient?_id=$PATIENT"
check "Observation"               "$BASE/fhir/Observation?patient=$PATIENT"
check "MedicationRequest"         "$BASE/fhir/MedicationRequest?patient=$PATIENT"
check "AllergyIntolerance"        "$BASE/fhir/AllergyIntolerance?patient=$PATIENT"
check "DiagnosticReport"          "$BASE/fhir/DiagnosticReport?patient=$PATIENT"

echo ""
echo "=== Labs & LIS ==="
LAB_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/labs?patientId=$PATIENT" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id']) if d else print('')")
check "Labs list"                 "$BASE/api/labs?patientId=$PATIENT"
[ -n "$LAB_ID" ] && check "Lab by ID"    "$BASE/api/labs/$LAB_ID"
check "LIS orders"                "$BASE/api/labs/lis-orders"
# LIS integration status is admin-only — checked under "Integration Status" below

echo ""
echo "=== Providers ==="
check "Provider list"             "$BASE/api/providers"
check "Provider by ID"            "$BASE/api/providers/$PROVIDER"
check "Provider availability"     "$BASE/api/providers/$PROVIDER/availability"
check "Provider me"               "$BASE/api/providers/me"

echo ""
echo "=== ePrescriptions ==="
RX_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/eprescribe?patientId=$PATIENT" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id']) if d else print('')")
check "ePrescribe list"           "$BASE/api/eprescribe?patientId=$PATIENT"
[ -n "$RX_ID" ] && check "ePrescribe by ID" "$BASE/api/eprescribe/$RX_ID"
check "Surescripts status"        "$BASE/api/eprescribe/integration/status"  "$ADMIN_TOKEN"

echo ""
echo "=== Appointments ==="
APPT_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/appointments?patientId=$PATIENT&limit=10" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id']) if d else print('')")
check "Appointments list"         "$BASE/api/appointments?patientId=$PATIENT&limit=10"
[ -n "$APPT_ID" ] && check "Appointment by ID" "$BASE/api/appointments/$APPT_ID"

echo ""
echo "=== Patients & Clinical ==="
check "Patient list"              "$BASE/api/patients"
check "Patient by ID"             "$BASE/api/patients/$PATIENT"
check "Patient summary"           "$BASE/api/patients/$PATIENT/summary"
check "Patient vitals"            "$BASE/api/patients/$PATIENT/vitals"
check "Medications list"          "$BASE/api/medications?patientId=$PATIENT"
check "Clinical notes"            "$BASE/api/notes?patientId=$PATIENT"

echo ""
echo "=== Integration Status ==="
check "Surescripts"               "$BASE/api/eprescribe/integration/status"  "$ADMIN_TOKEN"
check "Quest / LabCorp LIS"       "$BASE/api/labs/integration/status"        "$ADMIN_TOKEN"
check "Twilio / SendGrid"         "$BASE/api/notifications/integration/status" "$ADMIN_TOKEN"
check "FHIR status"               "$BASE/fhir/status"                        "$ADMIN_TOKEN"

echo ""
echo "=== Haiku Mobile (mobile.pseudo-co.com) ==="
check "Inbox (in-basket)"         "$MOBILE/api/haiku/inbox"
check "Schedule (today)"          "$MOBILE/api/haiku/schedule"
check "Worklist (assigned pts)"   "$MOBILE/api/haiku/worklist"
check "Quick View (patient)"      "$MOBILE/api/haiku/patients/$PATIENT/quickview"

echo ""
echo "=== AI Assistant ==="
# Liveness — no auth → expect 401 (proves routing without burning tokens)
ai_liveness=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST $BASE/api/ai/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello","history":[]}')
[ "$ai_liveness" = "401" ] \
  && printf "  ✓  %-55s %s (expected 401)\n" "AI service liveness (no auth)" "$ai_liveness" \
  || printf "  ✗  %-55s %s (expected 401)\n" "AI service liveness (no auth)" "$ai_liveness"

# Functional — authenticated ping; real Anthropic call, plain JSON response
ai_ping=$(curl -s -m 20 \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/ai/ping")
echo "$ai_ping" | grep -q '"status":"ok"' \
  && printf "  ✓  %-55s Anthropic responded ok\n"  "AI ping functional" \
  || printf "  ✗  %-55s status:ok missing — check API key or Anthropic\n" "AI ping functional"
echo "$ai_ping" | grep -q '"model"' \
  && printf "  ✓  %-55s model field present\n" "AI ping model field" \
  || printf "  ✗  %-55s model field missing\n" "AI ping model field"

# Hallucination detection — forces get_patient_chart tool call on seeded patient
ai_val=$(curl -s -m 20 \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/ai/validate")
echo "$ai_val" | grep -q '"tool_called":"get_patient_chart"' \
  && printf "  ✓  %-55s tool call verified\n"     "AI validate tool_called" \
  || printf "  ✗  %-55s tool_called missing\n"     "AI validate tool_called"
echo "$ai_val" | grep -q '"data_verified":true' \
  && printf "  ✓  %-55s seeded DB data returned\n" "AI validate data_verified" \
  || printf "  ✗  %-55s data_verified false — check seed\n" "AI validate data_verified"

echo ""
```

Save as `validate-endpoints.sh` and run `chmod +x validate-endpoints.sh && ./validate-endpoints.sh`. All lines should show ✓ before creating the ThousandEyes tests.

---

## Platform Failure Domain Coverage

No single ThousandEyes test type covers the full failure surface. Each type operates at a distinct layer of the stack and catches failures the others cannot see. The tests in this section are organised by failure domain, not by feature area, so that a ThousandEyes alert immediately identifies which layer of the platform is broken.

| Test type | Failure domain | What it uniquely catches |
|-----------|---------------|--------------------------|
| **DNS Trace / DNS Server** | DNS resolution | Propagation failures, hijacking, single-nameserver outages — fires before any HTTP test can run |
| **HTTP Server** | Network / ALB / TLS | TCP unreachability, TLS cert expiry, load balancer health — unauthenticated, so it reports even when auth is broken |
| **Page Load** | Frontend delivery | JS bundle errors, CDN failures, render-blocking assets — measured in a real browser, not an HTTP client |
| **Transaction** | User experience / auth | Broken login form, navigation failures, content that doesn't render — simulates what a real user actually sees |
| **API Test** | Application logic | Auth middleware, response shape, cross-service routing, data quality — what API clients depend on |

### Full platform test inventory by type

| Test name | Type | Component | Failure domain |
|-----------|------|-----------|----------------|
| `CareConnect — Infrastructure` | API | CareConnect | ALB + DB health |
| `CareConnect — Provider Portal` | Page Load | CareConnect | Frontend delivery |
| `CareConnect — Provider Workflow` | Transaction | CareConnect | Auth + UX |
| `CareConnect — FHIR R4 Suite` | API | CareConnect | FHIR API layer |
| `CareConnect — Labs & LIS` | API | CareConnect | Lab/LIS API |
| `CareConnect — Providers` | API | CareConnect | Provider API |
| `CareConnect — ePrescriptions` | API | CareConnect | ePrescribe API |
| `CareConnect — Appointments` | API | CareConnect | Scheduling API |
| `CareConnect — Patients & Clinical` | API | CareConnect | Clinical data API |
| `CareConnect — Integration Status` | API | CareConnect | External SaaS dependencies |
| `CareConnect — Haiku Mobile` | API | Haiku | Mobile API |
| `CareConnect — AI Liveness` | API | AI service | AI routing |
| `CareConnect — AI Assistant` | API | AI service | Claude API path |
| `Anthropic API — DNS Trace` | DNS Trace | Anthropic | Anthropic DNS |
| `Anthropic API — DNS Nameservers` | DNS Server | Anthropic | Anthropic nameservers |
| `Anthropic API — Reachability` | HTTP Server | Anthropic | Anthropic TCP/TLS |
| `Smart Care — VNS DNS` | DNS Trace | VNS | VNS DNS resolution |
| `Smart Care — VNS Liveness` | HTTP Server | VNS | VNS network / ALB |
| `Smart Care — SCFP Liveness` | HTTP Server | SCFP | SCFP network / ALB |
| `Smart Care — CPM Liveness` | HTTP Server | CPM | CPM network / ALB |
| `Smart Care — VNS Portal` | Page Load | VNS | Nursing portal frontend |
| `Smart Care — Nurse Workflow` | Transaction | VNS | Nurse auth + UX |
| `Smart Care — VNS & Command Center` | API | VNS | Cross-service aggregation |
| `Smart Care — SCFP Room Intelligence` | API | SCFP | Room sensors, sitters, alert workflow |
| `Smart Care — CPM Patient Monitoring` | API | CPM | Vitals, EWS, ADL, device health, alerts |

---

## CareConnect — Page Load & Transaction Tests

These two tests supplement the existing CareConnect API suite by covering the browser-facing failure domains that API tests cannot reach. Schedule them at 5 min — the same cadence as the clinical API tests.

---

### CareConnect — Provider Portal (Page Load)

**Test name:** `CareConnect — Provider Portal`
**Test type:** Page Load
**Timeout:** 30 s
**Frequency:** 5 min
**URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** The provider portal is a React SPA served as a JS bundle from a CDN. A broken Webpack build, CDN cache purge, or missing asset returns HTTP 200 with an empty shell — the API Infrastructure test stays green while every provider sees a blank screen. This Page Load test runs in a real browser (BrowserBot), catches asset-delivery failures, and measures the DOM Load and Page Load waterfall that providers actually experience.

*Alert thresholds:*
| Condition | Threshold |
|-----------|-----------|
| Availability | Page Load error (HTTP or render error) |
| DOM Load time | > 3 000 ms |
| Page Load time | > 8 000 ms |

> Assign to cloud agents in the same AWS region as the ALB. Also assign to the Enterprise Agent at the clinic site — provider workstations on the clinical LAN have different DNS and proxy paths than cloud agents; a DOM Load delta > 1 s between the EA and the cloud agent is a reliable indicator of local network or proxy-cache degradation.

---

### CareConnect — Provider Workflow (Transaction)

**Test name:** `CareConnect — Provider Workflow`
**Test type:** Transaction
**Timeout:** 45 s
**Frequency:** 5 min
**Start URL:** `https://careconnect.pseudo-co.com`

> **Why this test matters?** Exercises the complete provider login-to-patient-chart path in a real browser using BrowserBot. Catches failures no other test type can see: a login form whose submit button is mis-wired, a patient list that renders empty due to a frontend data-fetch error, or a chart that loads with broken auth context. Because it uses the TE marker API (`test.step`), each phase appears as a separate timing segment in the Waterfall view, making it easy to isolate which step degraded.

> **Credentials:** Use `{{$cc_provider_password}}` from the vault. Do not hardcode passwords in the transaction script — TE injects vault credentials as environment variables accessible via `process.env`.

*Transaction script:*

```javascript
import { By, until } from 'selenium-webdriver';
import { driver, test } from 'thousandeyes';

runScript();

async function runScript() {
  await test.step('Load login page', async () => {
    await driver.get('https://careconnect.pseudo-co.com');
    await driver.wait(until.elementLocated(By.css('input[type="email"]')), 8000);
  });

  await test.step('Enter credentials', async () => {
    await driver.findElement(By.css('input[type="email"]'))
      .sendKeys('provider@careconnect.demo');
    await driver.findElement(By.css('input[type="password"]'))
      .sendKeys(process.env.CC_PROVIDER_PASSWORD);
  });

  await test.step('Submit and await dashboard', async () => {
    await driver.findElement(By.css('button[type="submit"]')).click();
    await driver.wait(until.urlContains('/dashboard'), 12000);
    await driver.wait(until.elementLocated(By.css('[data-testid="patient-list"], .patient-list, table')), 8000);
  });

  await test.step('Open patient chart', async () => {
    const firstRow = await driver.wait(
      until.elementLocated(By.css('[data-testid="patient-row"]:first-child, tbody tr:first-child')),
      8000
    );
    await firstRow.click();
    await driver.wait(until.elementLocated(By.css('[data-testid="patient-chart"], .patient-chart, .chart-header')), 10000);
  });
}
```

*Alert thresholds:*
| Condition | Threshold |
|-----------|-----------|
| Availability | Any step error or timeout |
| Total transaction time | > 25 000 ms |
| Step 3 (login → dashboard) | > 8 000 ms |

> **Agent selection:** Assign to a **single Enterprise Agent at the clinic site** and one cloud agent. The transaction simulates a provider at a workstation — the EA gives you the real clinical-network experience. Running from too many cloud agents multiplies BrowserBot load with no additional failure-domain signal, since browser-side failures are deterministic (either the JS renders or it doesn't).

---

## Smart Care Component Tests

The Smart Care tier extends CareConnect with three integrated microservices: a Virtual Nursing Station portal (VNS), an AI-powered room intelligence platform (SCFP), and a continuous patient monitoring service (CPM). The Smart Care test suite uses all five ThousandEyes test types, each targeting a distinct failure domain.

| Service | Subdomain | Port | Auth model |
|---------|-----------|------|------------|
| VNS — Virtual Nursing Station | `vns.pseudo-co.com` | 3031 | Cookie session (`sc_session`, 8-hour TTL) |
| SCFP — Smart Care Facility Platform | `scfp.pseudo-co.com` | 3030 | None (internal microservice) |
| CPM — Continuous Patient Monitoring | `cpm.pseudo-co.com` | 3032 | None (internal microservice) |

> **Auth model note:** VNS uses cookie-based sessions rather than JWT Bearer tokens. TE API tests extract the session value from the `Set-Cookie` response header using the regex `sc_session=([^;]+)` and replay it as a `Cookie: sc_session={{session_cookie}}` request header in subsequent steps — configure this in each step's **Request Headers** field. SCFP and CPM expose no authentication; they are directly reachable on their own subdomains and are also proxied through VNS at `/proxy/scfp/*` and `/proxy/cpm/*`.

### Additional credentials (Smart Care)

Add these entries to **Settings → Credentials Repository** alongside the existing CareConnect credentials.

| Credential name | Value | Used for |
|----------------|-------|----------|
| `sc_nurse_password` | `Demo123!` | VNS nurse login password |
| `sc_room_id` | `room-301` | Stable seeded SCFP room — 3-North, high fall-risk |
| `sc_cpm_patient_id` | `PT-10000` | Stable seeded CPM patient — Margaret Okonkwo, ICU |

### Test inventory (Smart Care)

| Test name | Type | Failure domain | Freq |
|-----------|------|---------------|------|
| `Smart Care — VNS DNS` | DNS Trace | DNS resolution | 2 min |
| `Smart Care — VNS DNS Nameservers` | DNS Server | Per-nameserver health | 2 min |
| `Smart Care — VNS Liveness` | HTTP Server | Network / ALB / TLS | 1 min |
| `Smart Care — SCFP Liveness` | HTTP Server | Network / ALB / TLS | 1 min |
| `Smart Care — CPM Liveness` | HTTP Server | Network / ALB / TLS | 1 min |
| `Smart Care — VNS Portal` | Page Load | Frontend asset delivery | 5 min |
| `Smart Care — Nurse Workflow` | Transaction | Auth + UX rendering | 5 min |
| `Smart Care — VNS & Command Center` | API | Cross-service aggregation | 5 min |
| `Smart Care — SCFP Room Intelligence` | API | Room sensors, sitters, alert workflow | 5 min |
| `Smart Care — CPM Patient Monitoring` | API | Vitals, EWS, ADL, device health, alerts | 5 min |

Set **API Target Time for View** to 3 s on SCFP and CPM API tests; 5 s on the VNS & Command Center test (command-center fans out to two services). Page Load and Transaction alerts use DOM Load and step-timing thresholds, not the API Target Time field.

---

## Smart Care — DNS (DNS Trace)

**Test name:** `Smart Care — VNS DNS`
**Test type:** DNS Trace
**Frequency:** 2 min
**Domain:** `vns.pseudo-co.com`
**Agents:** Cloud US East + US West · Enterprise Agent at clinic site

> **Why this test matters?** DNS is the first thing a nurse's browser resolves when navigating to the VNS portal. A DNS failure silences every downstream test — HTTP Server, Page Load, Transaction, and API tests all report "connection refused" with no indication the root cause is DNS. Running this test independently means the ThousandEyes alert on `vns.pseudo-co.com` fires first, before the cascade of failures appears in the other Smart Care tests, giving the on-call team an immediate DNS vs. application distinction. SCFP and CPM are internal microservices not bookmarked by end users, so DNS monitoring is concentrated on the user-facing VNS domain.

> Also create a matching `Smart Care — VNS DNS Nameservers` (DNS Server test type) on the same domain and agent set. The DNS Nameservers test validates each authoritative nameserver independently, isolating single-nameserver failures from full DNS outages — the same pattern used for `Anthropic API — DNS Nameservers` above.

---

## Smart Care — HTTP Server Tests (Network / ALB layer)

Three separate HTTP Server tests — one per service. HTTP Server is the right type here because it is unauthenticated, single-URL, and measures TCP/TLS reachability at the network layer rather than application correctness. Separating the three services into independent tests gives each its own availability metric, alert rule, and Path Visualization in the TE dashboard — a single combined test would suppress the per-service availability signal.

---

### Smart Care — VNS Liveness (HTTP Server)

**Test name:** `Smart Care — VNS Liveness`
**Test type:** HTTP Server
**Timeout:** 5 s
**Frequency:** 1 min
**URL:** `https://vns.pseudo-co.com/health`
**Method:** GET

*Assertions:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"status":"healthy"` |

*Alert rule:* HTTP ≠ 200, or response time > 500 ms. Set **"Error Type = Any"** so that a TLS handshake failure or TCP timeout triggers the same alert as a `503`.

---

### Smart Care — SCFP Liveness (HTTP Server)

**Test name:** `Smart Care — SCFP Liveness`
**Test type:** HTTP Server
**Timeout:** 5 s
**Frequency:** 1 min
**URL:** `https://scfp.pseudo-co.com/health`
**Method:** GET

*Assertions:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"status":"healthy"` |

*Alert rule:* HTTP ≠ 200, or response time > 500 ms.

---

### Smart Care — CPM Liveness (HTTP Server)

**Test name:** `Smart Care — CPM Liveness`
**Test type:** HTTP Server
**Timeout:** 5 s
**Frequency:** 1 min
**URL:** `https://cpm.pseudo-co.com/health`
**Method:** GET

*Assertions:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"status":"healthy"` |

*Alert rule:* HTTP ≠ 200, or response time > 500 ms.

> **Agent selection for HTTP Server tests:** Assign all three to the same agent set — Cloud US East + US West and Enterprise Agent at clinic site. Running all three from the same agents makes the Path Visualization views directly comparable: if VNS is unreachable but SCFP and CPM are healthy, the path diverges at the VNS load balancer target group, not at the network edge.

---

## Smart Care — VNS Portal (Page Load)

**Test name:** `Smart Care — VNS Portal`
**Test type:** Page Load
**Timeout:** 30 s
**Frequency:** 5 min
**URL:** `https://vns.pseudo-co.com/login`

> **Why this test matters?** The VNS portal is a browser-rendered application. A broken JS bundle, a CDN miss on a critical chunk, or a render-blocking stylesheet can leave nurses staring at a blank or broken screen while the HTTP Server liveness test returns 200 — the health endpoint responds before the asset pipeline runs. The Page Load test runs in a real BrowserBot browser, loads all assets in the dependency waterfall, and measures the DOM Load time that determines when the login form is actually interactive. This is the only test type that catches frontend delivery failures.

*Alert thresholds:*
| Condition | Threshold |
|-----------|-----------|
| Availability | Page load error |
| DOM Load time | > 3 000 ms |
| Page Load time | > 8 000 ms |

> **Agent selection:** Assign to an Enterprise Agent at the clinic site (BrowserBot required) and one cloud agent in the ALB region. The DOM Load delta between the EA and the cloud agent surfaces any hospital-proxy or local-DNS overhead that slows the portal for nurses specifically. A delta > 1 s is worth investigating before it becomes a clinical complaint.

---

## Smart Care — Nurse Workflow (Transaction)

**Test name:** `Smart Care — Nurse Workflow`
**Test type:** Transaction
**Timeout:** 45 s
**Frequency:** 5 min
**Start URL:** `https://vns.pseudo-co.com/login`

> **Why this test matters?** Exercises the complete nurse login-to-command-center path in a real browser. Catches failures that no other test type can see: a cookie-set that succeeds at the HTTP layer but is rejected by the client-side session middleware, a session list that returns 200 from the API but renders empty due to a React state error, or a command center dashboard that never finishes loading because a downstream fetch silently hangs. Each `test.step` block maps to a discrete timing segment in the TE Waterfall, so the step that degrades is immediately visible in the alert detail.

> **Credentials:** Reference vault credential `sc_nurse_password` via `process.env.SC_NURSE_PASSWORD`. Map the vault entry to the environment variable in **Test Settings → Credentials** before saving the test.

*Transaction script:*

```javascript
import { By, until } from 'selenium-webdriver';
import { driver, test } from 'thousandeyes';

runScript();

async function runScript() {
  await test.step('Load VNS login page', async () => {
    await driver.get('https://vns.pseudo-co.com/login');
    await driver.wait(until.elementLocated(By.css('input[type="email"]')), 8000);
  });

  await test.step('Enter nurse credentials', async () => {
    await driver.findElement(By.css('input[type="email"]'))
      .sendKeys('nurse@careconnect.demo');
    await driver.findElement(By.css('input[type="password"]'))
      .sendKeys(process.env.SC_NURSE_PASSWORD);
  });

  await test.step('Submit login and await portal', async () => {
    await driver.findElement(By.css('button[type="submit"]')).click();
    // Wait for redirect away from /login — any authenticated route is acceptable
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return !url.includes('/login');
    }, 12000);
  });

  await test.step('Verify sessions list renders', async () => {
    // Sessions list is the first data-loaded view after login
    await driver.wait(
      until.elementLocated(By.css('[data-testid="sessions-list"], .sessions-list, .session-card')),
      10000
    );
  });

  await test.step('Open command center', async () => {
    // Navigate to the command center dashboard
    const ccLink = await driver.wait(
      until.elementLocated(By.css('[data-testid="command-center-link"], a[href*="command-center"], .nav-command-center')),
      8000
    );
    await ccLink.click();
    // Assert the aggregated stats panel loads — total_rooms comes from SCFP, monitored_patients from CPM
    await driver.wait(
      until.elementLocated(By.css('[data-testid="command-center"], .command-center-panel, .stats-panel')),
      10000
    );
  });
}
```

> **CSS selector note:** Selectors reference `data-testid` attributes first, with class-name fallbacks. If the VNS portal does not expose `data-testid` attributes, use the class-name fallbacks or inspect the rendered DOM and update accordingly. Do not use text-content selectors (`By.xpath("//button[text()='Login']")`) — they break on i18n or copy changes.

*Alert thresholds:*
| Condition | Threshold |
|-----------|-----------|
| Availability | Any step error or timeout |
| Total transaction time | > 30 000 ms |
| Step 3 (login → portal) | > 10 000 ms |
| Step 5 (command center load) | > 8 000 ms — a slow command center step means SCFP or CPM is taking too long to respond to the aggregation call |

> **Agent selection:** Assign to a **single Enterprise Agent at the clinic site** (BrowserBot required) and one cloud agent. Do not run from many agents — the Transaction test exercises the VNS login path, which creates a server-side session on each run; multiple agents multiplying at 5 min cadence could exhaust the session store under load.

---

## Test 12 — Smart Care VNS & Command Center

**Test name:** `Smart Care — VNS & Command Center`
**Timeout:** 20 s
**Frequency:** 5 min
**Base URL:** `https://vns.pseudo-co.com`

> **Why this test matters?** Covers the VNS cookie auth pattern, the active session workflow that virtual nurses use at the point of care, and the cross-service command-center fan-out that aggregates SCFP and CPM state into the charge-nurse dashboard. Steps 1–3 validate the nursing portal; steps 4–6 validate the operational hub. A failure in step 4 (command center returning non-200 while `/health` is green) specifically indicates VNS cannot reach SCFP or CPM internally — isolating the fault to the service mesh rather than any individual process.

> **Cookie auth pattern:** VNS uses cookie sessions rather than JWT Bearer tokens. Step 1 extracts the `sc_session` value from the `Set-Cookie` response header using the regex `sc_session=([^;]+)`. All subsequent steps pass `Cookie: sc_session={{session_cookie}}` as a request header — TE does not forward cookies between steps automatically.

---

**Step 1 — Login (nurse)**

Authenticates as the demo nurse and extracts the session cookie. A login that returns HTTP 200 but omits `sc_session` in `Set-Cookie` fails the sequence — configure the assertion on the header, not just the status code.

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://vns.pseudo-co.com/auth/login` |
| Auth | None |
| Body | `{"email":"nurse@careconnect.demo","password":"{{$sc_nurse_password}}"}` |
| Content-Type header | `application/json` |

*Post-Request → Extract variables:*
| Variable name | Source | Expression |
|---------------|--------|------------|
| `session_cookie` | Response Header `Set-Cookie` | `sc_session=([^;]+)` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Header `Set-Cookie` | contains | `sc_session` |

---

**Step 2 — Sessions list**

Lists active virtual nursing sessions and extracts the first session ID. Confirms session records carry `type` (the session badge: nursing consult, virtual sitter, care team conference, provider rounding).

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://vns.pseudo-co.com/api/sessions?status=active&limit=20` |
| Request Header | `Cookie: sc_session={{session_cookie}}` |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `sessionId` | `[0].id` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"type"` |
| Response Body | contains | `"status"` |

---

**Step 3 — Session by ID**

Reads the session extracted in step 2. Confirms the detail record includes room and patient context that virtual nurses act on during a consult.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://vns.pseudo-co.com/api/sessions/{{sessionId}}` |
| Request Header | `Cookie: sc_session={{session_cookie}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"room_number"` |
| Response Body | contains | `"patient_id"` |

---

**Step 4 — Command center dashboard**

The most expensive VNS call — fans out to SCFP (room counts, sitter coverage, active alerts) and CPM (patient counts, high-risk count, average EWS) in parallel before returning a merged payload. Confirms the response includes `total_rooms` (SCFP source) and `monitored_patients` (CPM source) — proving both downstream fan-out calls succeeded. A `502` while `/health` returns `200` isolates a VNS→downstream connectivity failure.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://vns.pseudo-co.com/api/command-center` |
| Request Header | `Cookie: sc_session={{session_cookie}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"total_rooms"` |
| Response Body | contains | `"monitored_patients"` |

---

**Step 5 — Aggregated alert feed**

Validates the unified VNS alert feed merging SCFP room alerts and CPM vital/ADL alerts. An empty `[]` body is acceptable — what matters is the HTTP 200, confirming VNS can reach both downstream services without a `502` or `503`. This step tests the alert aggregation path independently of the stats path validated in step 4.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://vns.pseudo-co.com/api/alerts` |
| Request Header | `Cookie: sc_session={{session_cookie}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |

---

**Step 6 — Shift handover report**

Fetches the aggregated shift handover document. Confirms the payload includes `generated_at` — always present regardless of session or alert state, making it a reliable assertion on both a live and a freshly seeded deployment.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://vns.pseudo-co.com/api/handover` |
| Request Header | `Cookie: sc_session={{session_cookie}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"generated_at"` |

---

## Test 14 — Smart Care SCFP Room Intelligence

**Test name:** `Smart Care — SCFP Room Intelligence`
**Timeout:** 20 s
**Frequency:** 5 min
**Base URL:** `https://scfp.pseudo-co.com`

> **Why this test matters?** SCFP is the ambient intelligence layer: PIR motion, bed-exit, fall-detection camera, staff badge RTLS, noise, and air-quality sensors feed a continuous event stream that drives virtual sitter assignment, alert triage, and AI workflow recommendations. This test covers the full SCFP monitoring surface — room inventory, fall events, the active virtual sitter list, the alert queue, and the alert acknowledge write path. SCFP generates new sensor events every 8 seconds, so the event and alert endpoints always carry data — there is no seed-state concern for any step.

---

**Step 1 — Rooms list**

Lists all monitored rooms. Confirms records carry `fall_risk` and `sensor_status` — the two fields that gate virtual sitter assignment in the VNS portal.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://scfp.pseudo-co.com/api/rooms` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"fall_risk"` |
| Response Body | contains | `"sensor_status"` |

---

**Step 2 — Room by ID**

Reads the stable seeded room (3-North, high fall-risk) by vault reference. Confirms the detail record includes `ai_monitoring_active` and `last_bed_exit` — the two sensor-derived fields that determine whether a room is escalated to virtual sitter coverage.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://scfp.pseudo-co.com/api/rooms/{{$sc_room_id}}` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"ai_monitoring_active"` |
| Response Body | contains | `"fall_risk_score"` |

---

**Step 3 — Fall detection events**

Queries the fall-events-only feed — SCFP's highest-priority clinical signal. Confirms records carry `ai_confidence` (the AI vision model score) and `sitter_active` (whether a virtual sitter was already assigned at the time of the event). A `sitter_active: false` on a high-confidence fall event means the escalation chain was not triggered.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://scfp.pseudo-co.com/api/events/falls?limit=20` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"ai_confidence"` |
| Response Body | contains | `"sitter_active"` |

---

**Step 4 — Virtual sitters list**

Lists all active virtual sitter sessions. Confirms records carry `indication` (the clinical reason: fall risk, confusion, agitation) and `video_feed_status` (active / degraded / offline). A sitter assigned to a room with `video_feed_status: "offline"` is providing no monitoring value — this field is the key device-health signal for the virtual sitter subsystem.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://scfp.pseudo-co.com/api/sitters` |
| Auth | None |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `sitterId` | `[0].id` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"indication"` |
| Response Body | contains | `"video_feed_status"` |

---

**Step 5 — Alert queue**

Queries the unacknowledged SCFP alert queue and extracts the first alert ID. Confirms alert records carry `message` (the pre-formatted clinical text sent to VNS) and `escalated` (whether the alert has already been forwarded to bedside staff).

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://scfp.pseudo-co.com/api/alerts?acknowledged=false&limit=20` |
| Auth | None |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `scfpAlertId` | `[0].id` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"message"` |
| Response Body | contains | `"escalated"` |

---

**Step 6 — Alert acknowledge (write path)**

Acknowledges the alert extracted in step 5. SCFP continuously generates new alerts, so the queue always has unacknowledged items and `scfpAlertId` is reliably populated. A `404` is acceptable — it occurs when the alert was acknowledged between step 5 and step 6 on a concurrent run; configure the assertion to treat `200` **or** `404` as a pass.

| Field | Value |
|-------|-------|
| Method | `PATCH` |
| URL | `https://scfp.pseudo-co.com/api/alerts/{{scfpAlertId}}/ack` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |

---

**Step 7 — AI staff workflow recommendations**

Fetches the AI-generated staff workflow recommendations. Confirms records carry `priority` and `recommendation` — the two fields rendered in the VNS command center for charge-nurse task prioritisation. A missing `recommendation` key with HTTP 200 means the AI workflow engine has silently regressed; the HTTP Server liveness test would still be green, making this assertion the only signal of the regression.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://scfp.pseudo-co.com/api/staff/workflow` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"priority"` |
| Response Body | contains | `"recommendation"` |

---

## Test 15 — Smart Care CPM Patient Monitoring

**Test name:** `Smart Care — CPM Patient Monitoring`
**Timeout:** 20 s
**Frequency:** 5 min
**Base URL:** `https://cpm.pseudo-co.com`

> **Why this test matters?** CPM is the predictive deterioration layer: wearable devices stream vitals every 15 seconds, the NEWS2 scoring engine computes an early warning score on each ingestion, and the ADL engine tracks six behavioural domains against each patient's personal 7-day baseline. A degraded CPM means clinicians lose the earliest possible deterioration signal — the step that most commonly triggers a CPM alert is a NEWS2 score crossing the high-risk threshold (≥ 7), which this test specifically validates. The monitoring device step is critical: a device with degraded signal or a low battery corrupts vital data quality silently before the device goes offline — this is the only test that catches that state before it becomes a clinical gap.

---

**Step 1 — Patients list**

Lists all monitored patients. Confirms records carry `current_ews` and `trend` — the two summary fields the CPM patient-list dashboard displays. A `trend: "deteriorating"` on a patient with `current_ews` ≥ 5 should always trigger a CPM alert within one vital cycle; this step confirms the list endpoint is serving live-computed values, not stale cache.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://cpm.pseudo-co.com/api/patients` |
| Auth | None |

*Post-Request → Extract variables:*
| Variable name | JSONPath |
|---------------|----------|
| `cpmPatientId` | `[0].id` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"current_ews"` |
| Response Body | contains | `"trend"` |

---

**Step 2 — Patient by ID**

Reads the stable seeded patient Margaret Okonkwo by vault reference. Confirms the record includes `device_id` (wearable linkage — must be present for vitals to ingest), `device_signal` (current RF quality), and `adl_risk` (ADL pipeline is scoring). A patient record missing `device_id` means the wearable pairing is broken and all downstream vitals steps would fail for that patient.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://cpm.pseudo-co.com/api/patients/{{$sc_cpm_patient_id}}` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"device_id"` |
| Response Body | contains | `"device_signal"` |
| Response Body | contains | `"adl_risk"` |

---

**Step 3 — Patient vitals**

Retrieves the 12 most recent vital readings for the seeded patient — six hours of data at the 15-second ingestion interval. Confirms readings carry `news2_score` (CPM scores NEWS2 on every ingestion, not only on the explicit EWS endpoint), `spo2`, and `rr` (respiration rate — the highest-weighted NEWS2 component, scoring up to 3 points). If `rr` is missing, the NEWS2 score is being computed with an incomplete parameter set.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://cpm.pseudo-co.com/api/patients/{{$sc_cpm_patient_id}}/vitals?limit=12` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"news2_score"` |
| Response Body | contains | `"spo2"` |
| Response Body | contains | `"rr"` |

---

**Step 4 — NEWS2 early warning score**

Fetches the full NEWS2 EWS breakdown for the seeded patient. Confirms the payload includes `components` (the per-parameter sub-scores: respiration rate, SpO₂, supplemental O₂, systolic BP, heart rate, consciousness, temperature) and `trend`. The `components` assertion is the key clinical correctness check — an endpoint that returns a `score` without `components` has broken the scoring decomposition that clinicians use to understand which physiological parameter is driving the high EWS.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://cpm.pseudo-co.com/api/patients/{{$sc_cpm_patient_id}}/ews` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"components"` |
| Response Body | contains | `"score"` |
| Response Body | contains | `"trend"` |

---

**Step 5 — ADL behavioural score**

Fetches the Activities of Daily Living composite score for the seeded patient. Confirms the payload includes `domains` (mobility, nutrition, sleep, hygiene, toileting, social engagement — all six must be present for a valid composite) and `adl_composite_score`. ADL deviation scoring compares current behaviour against each patient's personal 7-day baseline, making it patient-specific rather than population-normalised — this is the most clinically differentiated feature in the Smart Care tier.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://cpm.pseudo-co.com/api/patients/{{$sc_cpm_patient_id}}/adl` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"domains"` |
| Response Body | contains | `"adl_composite_score"` |
| Response Body | contains | `"adl_risk"` |

---

**Step 6 — Monitoring devices**

Lists all connected wearable monitoring devices and their hardware health state. Confirms records carry `battery`, `signal`, and `status`. This step is the only one in the entire Smart Care suite that covers the physical device layer: a wearable with `signal: "fair"` or `battery` below 20% will produce degraded or missing vitals before the HTTP Server liveness test has any indication of a problem. A device going `status: "offline"` silences all downstream vitals and EWS alerts for that patient with no other test catching it.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://cpm.pseudo-co.com/api/devices` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"battery"` |
| Response Body | contains | `"signal"` |
| Response Body | contains | `"status"` |

---

**Step 7 — CPM alert queue**

Lists all active CPM alerts combining vital-sign and ADL-deviation events in a single feed. Confirms alert records carry `alert_category` (the discriminator: `vital_signs` vs `adl_behavioral`) and `vitals_summary` (the inline vital snapshot attached to vital-sign alerts). The `vitals_summary` assertion verifies that the alert payload includes the clinical context clinicians need to act — an alert without vitals context requires an additional chart lookup, adding latency to the clinical response.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://cpm.pseudo-co.com/api/alerts?limit=50` |
| Auth | None |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"alert_category"` |
| Response Body | contains | `"vitals_summary"` |

---

## Alert thresholds (Smart Care)

Configure these in **Alert Rules** assigned to each Smart Care test. Each test type has its own alert model.

**DNS tests**
| Test | Alert condition |
|------|----------------|
| VNS DNS Trace | Resolution failure or NXDOMAIN on any agent |
| VNS DNS Nameservers | Any nameserver returns error or times out |

**HTTP Server tests**
| Test | Availability alert | Response time alert |
|------|--------------------|---------------------|
| VNS Liveness | HTTP ≠ 200 or connection failure | > 500 ms |
| SCFP Liveness | HTTP ≠ 200 or connection failure | > 500 ms |
| CPM Liveness | HTTP ≠ 200 or connection failure | > 500 ms |

Set **"Error Type = Any"** on all three HTTP Server alert rules — a TLS handshake failure returns no HTTP code and would not trigger a code-based rule alone.

**Page Load test**
| Test | Availability alert | Timing alert |
|------|--------------------|--------------|
| VNS Portal | Page load error | DOM Load > 3 000 ms · Page Load > 8 000 ms |

**Transaction test**
| Test | Alert condition |
|------|----------------|
| Nurse Workflow | Any step error or timeout · Total > 30 000 ms · Step 3 > 10 000 ms · Step 5 > 8 000 ms |

Create **two alert rules** for the Nurse Workflow test:
1. **Nurse Workflow — Availability**: triggers on any step error or timeout.
2. **Nurse Workflow — Latency**: triggers when step 5 (command center) exceeds 8 000 ms — catches a slow SCFP or CPM aggregation response before the total timeout fires.

**API tests**
| Test | Availability alert | Response time alert |
|------|--------------------|---------------------|
| VNS & Command Center | Any step HTTP ≠ 200, or `sc_session` missing, or `total_rooms` / `monitored_patients` absent | Total > 12 s · step 4 > 5 s |
| SCFP Room Intelligence | Any step HTTP ≠ 200 (step 6 also accepts 404), or `video_feed_status` / `recommendation` missing | Total > 10 s |
| CPM Patient Monitoring | Any step HTTP ≠ 200, or `components` / `domains` / `vitals_summary` missing | Total > 12 s |

For SCFP Room Intelligence, set **"Error Type = Any"** — a missing `recommendation` with HTTP 200 (AI workflow regression) must trigger the same alert as a `503`.

For CPM Patient Monitoring, create **two alert rules**:
1. **CPM — Availability**: Error Type = Any; triggers on any non-200 step or missing `components` / `domains` / `vitals_summary`.
2. **CPM — Device Health**: a separate alert rule is not configurable on an API test body assertion alone — instead, monitor `"signal":"fair"` or low `battery` in step 6 by setting the body assertion to `not contains "offline"` on `status`. Configure the alert to trigger when this assertion fails on two or more consecutive test runs — a transient offline status (device rebooting) should not page; a persistently offline device should.

---

## Recommended agent selection (Smart Care)

| Agent type | Tests |
|------------|-------|
| Cloud agents — US East / US West | All Smart Care tests — external availability baseline for all test types |
| Enterprise Agent at clinic site (BrowserBot) | VNS Portal (Page Load) + Nurse Workflow (Transaction) — BrowserBot required; also validates nurses reach VNS from the clinical LAN |
| Enterprise Agent at clinic site (no BrowserBot) | VNS DNS + VNS/SCFP/CPM Liveness + VNS & Command Center API — network-path visibility from the clinical network |
| Enterprise Agent on hospital Wi-Fi | SCFP Room Intelligence + CPM Patient Monitoring — sensor events and wearable telemetry traverse the hospital Wi-Fi; an EA on the same segment surfaces congestion that wired cloud agents miss |
| Single cloud agent — US East only | Nurse Workflow (Transaction) cloud baseline — avoid running Transactions from many agents; each run creates a server-side VNS session |

---

## Bulk validation script (Smart Care)

Run this before configuring ThousandEyes to confirm all Smart Care endpoints return expected responses from your local machine.

```bash
#!/bin/bash
VNS=https://vns.pseudo-co.com
SCFP=https://scfp.pseudo-co.com
CPM=https://cpm.pseudo-co.com
CPM_PT=PT-10000

# Obtain VNS session cookie
SESSION_COOKIE=$(curl -si -X POST $VNS/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nurse@careconnect.demo","password":"Demo123!"}' \
  | grep -i 'set-cookie' \
  | grep -oP 'sc_session=\K[^;]+')

if [ -z "$SESSION_COOKIE" ]; then
  echo "  ✗  VNS login failed — no sc_session cookie returned"
  exit 1
else
  printf "  ✓  %-55s session cookie obtained\n" "VNS login"
fi

check_no_auth() {
  local name="$1" url="$2"
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  [ "$http_code" = "200" ] \
    && printf "  ✓  %-55s %s\n" "$name" "$http_code" \
    || printf "  ✗  %-55s %s\n" "$name" "$http_code"
}

check_cookie() {
  local name="$1" url="$2"
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Cookie: sc_session=$SESSION_COOKIE" "$url")
  [ "$http_code" = "200" ] \
    && printf "  ✓  %-55s %s\n" "$name" "$http_code" \
    || printf "  ✗  %-55s %s\n" "$name" "$http_code"
}

echo ""
echo "=== Smart Care Infrastructure ==="
check_no_auth "VNS health"    "$VNS/health"
check_no_auth "VNS ping"      "$VNS/ping"
check_no_auth "SCFP health"   "$SCFP/health"
check_no_auth "SCFP ping"     "$SCFP/ping"
check_no_auth "CPM health"    "$CPM/health"
check_no_auth "CPM ping"      "$CPM/ping"

echo ""
echo "=== VNS & Command Center ==="
SESSION_ID=$(curl -s -H "Cookie: sc_session=$SESSION_COOKIE" \
  "$VNS/api/sessions?status=active&limit=20" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id']) if d else print('')")
check_cookie "Sessions list"              "$VNS/api/sessions?status=active&limit=20"
[ -n "$SESSION_ID" ] && check_cookie "Session by ID" "$VNS/api/sessions/$SESSION_ID"
check_cookie "Command center dashboard"   "$VNS/api/command-center"
check_cookie "Aggregated alert feed"      "$VNS/api/alerts"
check_cookie "Handover report"            "$VNS/api/handover"

echo ""
echo "=== SCFP Room Intelligence ==="
ROOM=room-301
check_no_auth "Rooms list"                "$SCFP/api/rooms"
check_no_auth "Room by ID"                "$SCFP/api/rooms/$ROOM"
check_no_auth "Fall detection events"     "$SCFP/api/events/falls?limit=20"
check_no_auth "Virtual sitters list"      "$SCFP/api/sitters"
SCFP_ALERT_ID=$(curl -s "$SCFP/api/alerts?acknowledged=false&limit=20" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id']) if d else print('')" 2>/dev/null)
check_no_auth "Alert queue"               "$SCFP/api/alerts?acknowledged=false&limit=20"
if [ -n "$SCFP_ALERT_ID" ]; then
  ack_code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$SCFP/api/alerts/$SCFP_ALERT_ID/ack")
  [ "$ack_code" = "200" ] || [ "$ack_code" = "404" ] \
    && printf "  ✓  %-55s %s (200 or 404 ok)\n" "Alert acknowledge" "$ack_code" \
    || printf "  ✗  %-55s %s\n" "Alert acknowledge" "$ack_code"
fi
check_no_auth "AI staff workflow"         "$SCFP/api/staff/workflow"

echo ""
echo "=== CPM Patient Monitoring ==="
check_no_auth "Patients list"             "$CPM/api/patients"
check_no_auth "Patient by ID"             "$CPM/api/patients/$CPM_PT"
check_no_auth "Patient vitals"            "$CPM/api/patients/$CPM_PT/vitals?limit=12"
check_no_auth "NEWS2 EWS"                 "$CPM/api/patients/$CPM_PT/ews"
check_no_auth "ADL score"                 "$CPM/api/patients/$CPM_PT/adl"
check_no_auth "Monitoring devices"        "$CPM/api/devices"
check_no_auth "CPM alert queue"           "$CPM/api/alerts?limit=50"

echo ""
```

Save as `validate-smartcare.sh` and run `chmod +x validate-smartcare.sh && ./validate-smartcare.sh`. All lines should show ✓ before creating the ThousandEyes tests.

