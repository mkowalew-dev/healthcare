# ThousandEyes API Test Suite — CareConnect EHR

Configured using the **API Test** type (Network & Synthetics → Test Settings → Web & API Tests → API Performance). Each test is a multi-step sequence: step 1 logs in and extracts a JWT, subsequent steps use `{{token}}` as the Bearer token. No external cron refresh needed.

> **Agent requirement:** Enterprise Agents running API tests must have the BrowserBot component installed. API tests are not supported on Cisco devices.

---

## Credentials repository

Store secrets in **Settings → Credentials Repository** before creating any test. Reference them in step fields with `{{$credentialName}}`.

| Credential name | Value |
|----------------|-------|
| `cc-provider-password` | `Demo123!` |
| `cc-admin-password` | `Demo123!` |

> Credentials are masked in test results and never exposed in the UI or API response.

---

## Fixed seed identifiers

Stable across all seeded deployments — safe to hardcode in step URLs.

| Resource | ID |
|----------|----|
| Patient (John Smith — `patient@careconnect.demo`) | `66666666-0000-0000-0000-000000000001` |
| Provider (Dr. Michael Chen — `provider@careconnect.demo`) | `33333333-0000-0000-0000-000000000001` |

---

## Test inventory

| Test name | Steps | Auth | Timeout |
|-----------|-------|------|---------|
| `CareConnect — Infrastructure` | 2 | None | 5 s |
| `CareConnect — FHIR R4 Suite` | 8 | Provider login | 20 s |
| `CareConnect — Labs & LIS` | 5 | Provider login | 15 s |
| `CareConnect — Providers` | 5 | Provider login | 15 s |
| `CareConnect — ePrescriptions` | 4 | Provider login | 12 s |
| `CareConnect — Appointments` | 4 | Provider login | 12 s |
| `CareConnect — Patients & Clinical` | 7 | Provider login | 20 s |
| `CareConnect — Integration Status` | 5 | Admin login | 15 s |
| `CareConnect — Haiku Mobile` | 6 | Provider login | 15 s |

Set **API Target Time for View** to 3 s on all tests. Set it to **2 s** on the Haiku test — mobile clinicians making time-critical decisions (critical lab sign-off) have lower tolerance for latency than desktop users.

---

## Test 1 — Infrastructure

**Test name:** `CareConnect — Infrastructure`  
**Timeout:** 5 s

---

**Step 1 — Health check**

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

---

> Also create a matching `MyChart — Infrastructure` test pointing to `https://mychart.pseudo-co.com/health` and `/ping` with the same assertions.

---

## Test 2 — FHIR R4 Suite

**Test name:** `CareConnect — FHIR R4 Suite`  
**Timeout:** 20 s

---

**Step 1 — Login (provider)**

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://careconnect.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"provider@careconnect.demo","password":"{{$cc-provider-password}}"}` |
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

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/Patient/66666666-0000-0000-0000-000000000001` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"Patient"` |

---

**Step 4 — FHIR Patient search**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/Patient?_id=66666666-0000-0000-0000-000000000001` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"Bundle"` |

---

**Step 5 — FHIR Observations**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/Observation?patient=66666666-0000-0000-0000-000000000001` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"Bundle"` |

---

**Step 6 — FHIR MedicationRequest**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/MedicationRequest?patient=66666666-0000-0000-0000-000000000001` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"Bundle"` |

---

**Step 7 — FHIR AllergyIntolerance**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/AllergyIntolerance?patient=66666666-0000-0000-0000-000000000001` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"resourceType":"Bundle"` |

---

**Step 8 — FHIR DiagnosticReport**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/DiagnosticReport?patient=66666666-0000-0000-0000-000000000001` |
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

---

**Step 1 — Login (provider)**

Same as [FHIR Suite Step 1](#step-1--login-provider) — POST to `/api/auth/login`, extract `{{token}}`.

---

**Step 2 — Labs list**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/labs?patientId=66666666-0000-0000-0000-000000000001` |
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

Uses `{{labId}}` extracted in step 2.

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
| Response Body | contains | `"result_value"` |

---

**Step 4 — LIS orders list**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/labs/lis-orders` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"order_id"` |

---

**Step 5 — LIS integration status**

This step uses the admin token injected via the Integration Status test (Test 8). If combining into one test, replace step 1 with admin login and use `{{adminToken}}` here.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/labs/integration/status` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"integrations"` |

---

## Test 4 — Providers

**Test name:** `CareConnect — Providers`  
**Timeout:** 15 s

---

**Step 1 — Login (provider)**

POST `/api/auth/login` → extract `{{token}}`. (Same as Test 2, Step 1.)

---

**Step 2 — Provider list**

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

Uses the seeded provider UUID (stable — no extraction needed).

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/providers/33333333-0000-0000-0000-000000000001` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"specialty"` |
| Response Body | contains | `"Michael"` |

---

**Step 4 — Provider availability**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/providers/33333333-0000-0000-0000-000000000001/availability` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"slots"` |

---

**Step 5 — Provider me (self-profile)**

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

---

**Step 1 — Login (provider)**

POST `/api/auth/login` → extract `{{token}}`.

---

**Step 2 — Prescription list**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/eprescribe?patientId=66666666-0000-0000-0000-000000000001` |
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

Uses `{{rxId}}` extracted in step 2.

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
| Response Body | contains | `"confirmation_id"` |

---

**Step 4 — Surescripts integration status**

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

---

**Step 1 — Login (provider)**

POST `/api/auth/login` → extract `{{token}}`.

---

**Step 2 — Appointments list**

`?limit=10` caps the response. The list was unbounded before v2.0.1 (212 kB); pagination was added as part of the v2.0.1 performance improvements.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/appointments?patientId=66666666-0000-0000-0000-000000000001&limit=10` |
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

Uses `{{apptId}}` extracted in step 2.

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

Confirms the token is still valid mid-sequence.

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

---

**Step 1 — Login (provider)**

POST `/api/auth/login` → extract `{{token}}`.

---

**Step 2 — Patient list**

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

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/patients/66666666-0000-0000-0000-000000000001` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"mrn"` |
| Response Body | contains | `"John"` |

---

**Step 4 — Patient chart summary**

This is the most expensive call — full chart aggregation across multiple tables.

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/patients/66666666-0000-0000-0000-000000000001/summary` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"medications"` |
| Response Body | contains | `"labs"` |

---

**Step 5 — Patient vitals**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/patients/66666666-0000-0000-0000-000000000001/vitals` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"blood_pressure"` |

---

**Step 6 — Medications list**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/medications?patientId=66666666-0000-0000-0000-000000000001` |
| Auth | Bearer Token → `{{token}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"medication_name"` |

---

**Step 7 — Clinical notes**

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/api/notes?patientId=66666666-0000-0000-0000-000000000001` |
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
**Frequency:** 5 min (integration status calls are cheap and high-value for demo alerting)

---

**Step 1 — Login (admin)**

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://careconnect.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"admin@careconnect.demo","password":"{{$cc-admin-password}}"}` |
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

| Field | Value |
|-------|-------|
| Method | `GET` |
| URL | `https://careconnect.pseudo-co.com/fhir/status` |
| Auth | Bearer Token → `{{adminToken}}` |

*Assertion Rules:*
| Subject | Operator | Value |
|---------|----------|-------|
| HTTP Status Code | is equal to | `200` |
| Response Body | contains | `"fhir"` |

---

## Test 9 — Haiku Mobile

**Test name:** `CareConnect — Haiku Mobile`
**Timeout:** 15 s
**Frequency:** 5 min (in-basket and aggregation endpoints are the highest-value mobile signals)
**Base URL:** `https://mobile.pseudo-co.com` — all steps in this test use the mobile subdomain, giving ThousandEyes a distinct network path to trace and Splunk RUM a separate `careconnect-haiku` session to measure.

> **Why stricter targets?** Haiku is used at the point of care — a clinician glancing at their phone between patient rooms. Any response > 3 s is clinically disruptive. Alert thresholds for this test are tighter than the desktop portal equivalents.

---

**Step 1 — Login (provider)**

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `https://mobile.pseudo-co.com/api/auth/login` |
| Auth | None |
| Body | `{"email":"provider@careconnect.demo","password":"{{$cc-provider-password}}"}` |
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

The highest-value Haiku endpoint. Aggregates unread messages, critical/abnormal labs, and zero-refill medications in a single call. A slow or failed response means the provider misses critical alert badges.

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

Validates that the schedule aggregation works and returns appointment shape expected by the mobile UI.

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

Validates the worklist aggregation including urgency signal counts. Extracts a patient ID for the next step.

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
| URL | `https://mobile.pseudo-co.com/api/haiku/patients/66666666-0000-0000-0000-000000000001/quickview` |
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

> **Optional step 7 — Lab acknowledge (write path)**
> Add this step if you want to exercise the write path and verify the `careconnect-haiku` service handles PATCH requests correctly. Use `{{criticalLabId}}` extracted in step 2 (skip gracefully if the variable is empty — there may be no critical labs in the current seed state).
>
> | Field | Value |
> |-------|-------|
> | Method | `PATCH` |
> | URL | `https://mobile.pseudo-co.com/api/haiku/labs/{{criticalLabId}}/acknowledge` |
> | Auth | Bearer Token → `{{token}}` |
>
> *Assertion:* HTTP Status Code is equal to `200` **or** `404` (404 is acceptable when `criticalLabId` is empty or already acknowledged).

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
| **Haiku Mobile** | **Any step HTTP ≠ 200, or assertion fails** | **Total sequence > 8 s · inbox step alone > 3 s** |

For the Integration Status test, set **"Error Type = Any"** on the alert rule so that an assertion failure on `"reachable":true` triggers the same alert as an HTTP 503.

For the Haiku Mobile test, create **two alert rules**:
1. **Haiku — Availability**: Error Type = Any, triggers when any step returns non-200 or an assertion fails. Rationale: a failed inbox call means a provider cannot see critical lab alerts.
2. **Haiku — Latency**: Condition = Response time of step 2 (inbox) > 3 000 ms. Assign to at least one cloud agent in the same AWS region as your deployment. This catches `careconnect-haiku` service degradation before it affects the full sequence timeout.

---

## Recommended agent selection

| Agent type | Purpose |
|------------|---------|
| Cloud agents — US East / US West | Baseline availability and latency from AWS regions matching your ALB placement |
| Cloud agents — EU / APAC | Simulate cross-region access for international integration partners (Surescripts, Quest) |
| Enterprise Agent at clinic site | Network-path visibility (BGP, hops) from the actual clinical network to the ALB |
| Enterprise Agent on LTE/5G cellular network | **Haiku Mobile test only** — simulates a provider using the app on a mobile data connection outside the hospital; surfaces latency variance not visible from wired cloud agents |

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
check "LIS integration status"    "$BASE/api/labs/integration/status"        "$ADMIN_TOKEN"

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
```

Save as `validate-endpoints.sh` and run `chmod +x validate-endpoints.sh && ./validate-endpoints.sh`. All lines should show ✓ before creating the ThousandEyes tests.
