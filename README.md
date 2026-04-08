# CareConnect EHR

An EPIC-compatible Electronic Health Record (EHR) demo application built for demonstrating ThousandEyes Assurance and Splunk Observability technologies.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS (Cisco theme) |
| Backend | Node.js + Express |
| Database | PostgreSQL 15 |
| Auth | JWT (12h expiry) |
| Charts | Recharts |
| Tracing | OpenTelemetry + Splunk APM |

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| **Patient** | `patient@demo.com` | `Demo123!` |
| **Provider** | `provider@demo.com` | `Demo123!` |
| **Admin** | `admin@demo.com` | `Demo123!` |

---

## Quick Start

**Prerequisites:** Node.js 20+, PostgreSQL 15

1. Start PostgreSQL and create the database:
```bash
createdb careconnect
```

2. Backend:
```bash
cd backend
cp .env.example .env
npm install
npm run seed      # Creates schema + seeds data
npm run dev       # API on :3001
```

3. Mock External Services (required for ePrescribing, Lab Orders, Notifications):
```bash
cd backend
npm run mock      # Mock services on :3002
```

4. Frontend:
```bash
cd frontend
npm install
npm run dev       # React app on :5173
```

> **Tip:** Run API and mock together: `cd backend && npm run dev:all`

---

## Features

### Patient Portal (MyChart-like)
- **Dashboard** — Upcoming appointments, billing alerts, lab results summary, active medications
- **Appointments** — View upcoming/past/cancelled visits, schedule new appointments
- **Test Results** — Lab results with reference ranges, abnormal flagging, A1C trend chart
- **Medications** — Active prescriptions, refill requests
- **Billing** — Statements, insurance breakdown, online payment
- **Messages** — Secure messaging with care team
- **Health Summary** — Vitals trends, allergies, problem list, demographics
- **Notifications** — SMS and email alerts with delivery status and latency metrics

### Provider Portal (Clinical Workspace)
- **Dashboard** — Today's schedule, recent messages, patient metrics
- **Patient List** — Search patients by name/MRN, quick chart access
- **Patient Chart** — Full EPIC-like chart: Summary, Medications, Labs, Visits, Notes, Vitals
- **Schedule** — Weekly calendar view of appointments
- **Messages** — Inbox/sent with reply capability
- **ePrescribing** — Submit prescriptions to Surescripts SCRIPT 10.6 with pharmacy selection, quick-fill medications, and real-time Rx confirmation IDs

### Admin Portal
- **Dashboard** — KPIs, appointment trend charts, department utilization, user distribution
- **User Management** — View all users, activate/deactivate accounts
- **Departments** — Department overview with provider counts
- **Integration Health** — Live connectivity dashboard for all external services, latency metrics, notification trigger panel, and mock chaos controls

---

## External Integration Simulations

CareConnect simulates four real EHR integration use cases. Each makes outbound HTTP calls that ThousandEyes can monitor end-to-end. A local mock server (port 3002) handles all calls with realistic response payloads and configurable latency.

| Integration | Protocol | Mock Endpoint | ThousandEyes Value |
|-------------|----------|--------------|-------------------|
| **Surescripts ePrescribing** | SCRIPT 10.6 | `/surescripts/api/v2/NewRxRequest` | Cross-network RX routing latency |
| **Quest Diagnostics LIS** | HL7 ORM_O01 | `/quest/orders/v1/create` | Lab order transmission latency |
| **LabCorp LIS** | HL7 ORM_O01 | `/labcorp/orders/v1/create` | Lab order transmission latency |
| **Twilio SMS** | REST API | `/twilio/2010-04-01/Accounts/*/Messages.json` | SMS delivery latency |
| **SendGrid Email** | REST v3 | `/sendgrid/v3/mail/send` | Email delivery latency |
| **FHIR R4 API** | HTTP REST | `/fhir/*` | External app integration traffic |

### Adjusting mock latency

```bash
# Simulate Surescripts outage during a demo
curl -X PATCH http://localhost:3002/config \
  -H 'Content-Type: application/json' \
  -d '{"surescripts": {"failureRate": 1.0}}'

# Slow Quest to simulate cross-country network congestion
curl -X PATCH http://localhost:3002/config \
  -d '{"quest": {"latencyMs": 2500}}'

# Reset all services to defaults
curl -X PATCH http://localhost:3002/config \
  -d '{"surescripts":{"latencyMs":180,"failureRate":0},"quest":{"latencyMs":240,"failureRate":0},"twilio":{"latencyMs":120,"failureRate":0}}'
```

Or use **Admin → Integrations → Mock Simulation Controls** in the UI.

---

## Observability Integration

### ThousandEyes
- `/health` endpoint for synthetic monitoring (tests full path: ALB → API → PostgreSQL)
- `/fhir/metadata` — FHIR CapabilityStatement for external integration monitoring
- All API calls include `x-request-id` correlation headers
- W3C `traceparent` / `tracestate` propagated on all requests
- Mock services expose `/surescripts/get`, `/quest/get`, `/twilio/get`, `/sendgrid/get` for HTTP Server tests

### Splunk
- All API requests logged in structured JSON with `requestId`, `userId`, `duration`, `statusCode`
- Integration calls logged with `vendor`, `latencyMs`, `url` fields for service-level visibility
- OpenTelemetry traces via `@splunk/otel` — service map shows API → Mock dependency

---

## API Endpoints

```
GET  /health                                   Health check (DB connectivity)
GET  /fhir/metadata                            FHIR R4 CapabilityStatement
POST /api/auth/login                           Login
GET  /api/auth/me                              Current user

GET  /api/patients                             List patients (provider/admin)
GET  /api/patients/me                          Patient profile (patient)
GET  /api/patients/:id                         Patient details
GET  /api/patients/:id/summary                 Full chart summary

GET  /api/providers                            List providers
GET  /api/providers/:id/availability           Available time slots

GET  /api/appointments                         List appointments
POST /api/appointments                         Schedule appointment
PATCH /api/appointments/:id/cancel             Cancel appointment

GET  /api/labs                                 Lab results
GET  /api/labs/lis-orders                      LIS order tracking (provider/admin)
GET  /api/labs/integration/status              Quest/LabCorp connectivity (admin)
POST /api/labs                                 Order lab → LIS (provider/admin)

GET  /api/medications                          Medications
POST /api/medications/:id/refill-request       Request refill

GET  /api/eprescribe                           Prescription history
GET  /api/eprescribe/:id                       Single prescription
POST /api/eprescribe                           Submit ePrescription → Surescripts
PATCH /api/eprescribe/:id/cancel               Cancel prescription
GET  /api/eprescribe/integration/status        Surescripts connectivity (admin)

GET  /api/notifications                        Notification history
POST /api/notifications/send                   Send SMS/email notification
POST /api/notifications/trigger/:type          Bulk trigger (admin)
GET  /api/notifications/stats                  7-day delivery stats (admin)
GET  /api/notifications/integration/status     Twilio/SendGrid connectivity (admin)

GET  /fhir/Patient/:id                         FHIR R4 Patient resource
GET  /fhir/Patient?_id=...                     FHIR R4 Patient search
GET  /fhir/Observation?patient=...             FHIR R4 Observations (vitals + labs)
GET  /fhir/MedicationRequest?patient=...       FHIR R4 MedicationRequests
GET  /fhir/AllergyIntolerance?patient=...      FHIR R4 AllergyIntolerances
GET  /fhir/DiagnosticReport?patient=...        FHIR R4 DiagnosticReports

GET  /api/bills                                Bills
GET  /api/bills/summary                        Balance summary
POST /api/bills/:id/pay                        Process payment

GET  /api/messages                             Messages (inbox/sent)
POST /api/messages                             Send message

GET  /api/admin/stats                          System statistics
GET  /api/admin/users                          All users
```

---

## Seed Data

The database is pre-loaded with:
- **8 providers** across 10 departments (Internal Medicine, Cardiology, Family Medicine, Pediatrics, Orthopedics, OB/GYN, Neurology, Endocrinology)
- **10 patients** with full demographics, insurance, and emergency contacts
- **15 appointments** (upcoming, past, cancelled)
- **21 lab results** (normal, abnormal, critical, pending)
- **22 medications** (active and discontinued)
- **8 bills** with insurance breakdown (paid, pending, overdue)
- **5 messages** in 4 conversation threads
- **2 clinical notes** with SOAP format
- **7 vital sign records** with trending data
- **Allergies, diagnoses, and problem lists** for all patients

---

## Deployment

See [`deploy/DEPLOYMENT.md`](deploy/DEPLOYMENT.md) for the full multi-VM guide.

**Summary:**
| Script | VM | Purpose |
|--------|----|---------|
| `01-setup-db.sh` | VM3 | PostgreSQL setup |
| `02-setup-api.sh` | VM2 | Node.js + PM2 API setup |
| `03-setup-frontend.sh` | VM1 | React build + serve |
| `04-update.sh api\|frontend\|mock` | VM2/VM1/VM4 | Zero-downtime updates |
| `05-setup-otel-collector.sh` | All VMs | Splunk OTel Collector |
| `06-setup-mock.sh` | VM4 | Mock external services setup |

**One-command deploy from local machine:**
```bash
bash deploy/deploy.sh all       # Deploys API + Frontend + Mock
bash deploy/deploy.sh mock      # Mock services only
```
