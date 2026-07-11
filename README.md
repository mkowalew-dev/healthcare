# CareConnect EHR

**v2.5.0** — An EPIC-compatible Electronic Health Record (EHR) demo application built for demonstrating ThousandEyes Assurance and Splunk Observability technologies.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS (Cisco theme) |
| Backend | Node.js + Express (12 PM2 domain services) |
| Database | PostgreSQL 17 |
| Auth | JWT (12h expiry) |
| Charts | Recharts (lazy-loaded) |
| Tracing | OpenTelemetry + Splunk APM |
| RUM | @splunk/otel-web (clinical, patient, and Haiku portals) |
| Internal Portal | React 18 + Vite + Tailwind CSS + IBM Plex Sans (port 8090) |

## Demo Credentials

| Role | Email | Password | Portal |
|------|-------|----------|--------|
| **Patient** | `patient@careconnect.demo` | `Demo123!` | mychart.pseudo-co.com |
| **Provider** | `provider@careconnect.demo` | `Demo123!` | careconnect.pseudo-co.com · mobile.pseudo-co.com |
| **Admin** | `admin@careconnect.demo` | `Demo123!` | careconnect.pseudo-co.com |
| **Radiologist** | `dr.chen@careconnect.demo` | `Demo123!` | pacs.pseudo-co.com:5174 |
| **Radiologist** | `dr.patel@careconnect.demo` | `Demo123!` | pacs.pseudo-co.com:5174 |
| **CT/MRI Tech** | `tech.jones@careconnect.demo` | `Demo123!` | pacs.pseudo-co.com:5174 |

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

### Haiku — Mobile Clinician App (`mobile.pseudo-co.com`)
Modelled after EPIC Haiku. Provider-only PWA optimised for phones and tablets.
- **Inbox** — Three-tab in-basket: critical/abnormal labs pending sign-off (with Sign Result action), unread messages, and refill requests; badge count on the nav tab
- **Patients** — Assigned patient worklist with live search; urgency signals (critical lab count, today's appointment flag)
- **Quick View** — At-a-glance patient chart: latest vitals grid, allergies, problem list, recent labs, active medications
- **Schedule** — Today's appointment timeline with status chips and chief complaint; taps through to Quick View

### Internal Employee Portal (`portal/`)

SharePoint-style intranet built on the same Cisco design system as the EHR (IBM Plex Sans, `cisco-blue`/`cisco-dark-blue` palette, identical sidebar and card patterns). Runs as a completely separate build — independent of the EHR frontend.

| Page | Content |
|------|---------|
| **Dashboard** | Hero banner, KPI tiles (CCHX stock, revenue YTD, patient satisfaction, headcount), announcements feed, 30-day stock area chart, company stories, upcoming events, employee spotlight |
| **News & Announcements** | Category-filtered, searchable accordion list; pinned + priority indicators |
| **Company Stories** | Featured article banner, card grid, full-article detail view |
| **Performance** | Revenue bar chart (actual vs budget), satisfaction trend line chart, workforce donut, 6 KPI tiles |
| **Resources** | HR, IT, Clinical, and Legal/Compliance document library |
| **Directory** | Searchable employee card grid with department filter |
| **Events Calendar** | Category-filtered events list with RSVP toggle |

**Tech:** React 18 + TypeScript + Vite + Tailwind CSS (Cisco theme) + Recharts + IBM Plex Sans (self-hosted)  
**Port:** 8090 (configurable)  
**Dev:** `cd portal && npm run dev`  
**Release:** `cd portal && make release` → `careconnect-portal-{version}.tar.gz`

---

### Smart Care Facility Platform (Azure — optional)

Three additional services extend the demo with an ambient intelligence and virtual care layer, deployed to Azure VMs in two regions. Each is a standalone Node.js service managed via `healthcare-deploy.sh`.

| Service | VM | Region | Port | Function |
|---------|-----|--------|------|----------|
| **SCFP** — Smart Care Facility Platform | VM6a + VM6b | Azure Central US | 3030 | AI-powered room monitoring, fall detection, bed sensor arrays, staff workflow optimization |
| **VNS** — Virtual Nursing Station | VM7a + VM7b | Azure West US 2 | 3031 (HTTPS) | Virtual nursing sessions, aggregated alert triage, patient assessments, EHR documentation, shift handover |
| **CPM** — Continuous Patient Monitoring | VM8a + VM8b | Azure Central US | 3032 | Predictive patient monitoring, NEWS2 Early Warning Score, deterioration trend detection, IoT device registry |

VNS is fronted by a public Azure Application Gateway (`vns.pseudo-co.com`, SSL termination at AppGW). SCFP and CPM are behind internal Application Gateways. VNS aggregates alerts from SCFP and CPM cross-region, and writes nursing assessments back to the CareConnect EHR via `POST /api/notes/service`.

**Smart Care Portal:** `https://vns.pseudo-co.com/` — four-tab dashboard (Command Center, Rooms & Sensors, Patient Monitoring, Nursing Sessions). Demo credentials: same `@careconnect.demo` accounts as the EHR.

**Deploy:** `bash deploy/healthcare-deploy.sh init scfp` → `init cpm` → `init vns`

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

#### Endpoint Synthetic Tests (Playwright + ThousandEyes Endpoint Agent)

The `playwright-tests/` directory contains a scheduled Playwright test suite that runs login flows from an on-premises Windows test machine with the ThousandEyes Endpoint Agent Chrome extension installed. This captures **real end-user network path visibility** — latency, routing, and loss between the on-prem site and each application — rather than cloud-agent synthetic probes.

| Test | File | What it validates |
|------|------|------------------|
| CareConnect provider login | `tests/careconnect-login.spec.ts` | Login form loads, provider signs in, no error banner |
| MyChart patient login | `tests/mychart-login.spec.ts` | Login form loads, patient signs in, redirected off `/login` |
| PACS radiologist login | `tests/pacs-login.spec.ts` | Login form loads, email pre-filled, radiologist signs in to worklist |

**How it works:** Chrome is launched externally by `run-tests.ps1` (not by Playwright) so none of Playwright's automation flags are injected. Playwright connects to the running Chrome via the Chrome DevTools Protocol (CDP). Because Chrome runs as a normal user browser, the ThousandEyes Endpoint Agent extension operates normally and reports network telemetry for every page load performed during the tests.

See [`deploy/DEPLOYMENT.md` → Endpoint Synthetic Tests](deploy/DEPLOYMENT.md) for setup and scheduling instructions.

### Splunk
- All API requests logged in structured JSON with `requestId`, `userId`, `duration`, `statusCode`
- Integration calls logged with `vendor`, `latencyMs`, `url` fields for service-level visibility
- OpenTelemetry traces via `@splunk/otel` — service map shows API → Mock dependency

---

## Performance Characteristics

The API and frontend are optimized for realistic demo latency profiles:

**API query optimization**
- Patient/provider role lookups use a single JOIN or inline subquery rather than a pre-fetch — eliminates one DB round-trip on every authenticated list call
- `GET /api/appointments` supports `?limit=N&offset=N` for pagination
- Indexes on `clinical_notes(patient_id)`, `patients(user_id)`, and `providers(user_id)` ensure all role-based WHERE clauses hit indexes

**Frontend bundle splitting**
The React build produces four cacheable vendor chunks plus per-route async chunks:

| Chunk | Contents | Load behaviour |
|-------|----------|----------------|
| `vendor-react` | React, ReactDOM, react-router-dom | Always — initial load |
| `vendor-otel` | @splunk/otel-web, @opentelemetry/api | Always — RUM must instrument the full lifecycle |
| `vendor-utils` | axios, date-fns, lucide-react, clsx, react-hook-form | Always — shared utilities |
| `vendor-charts` | recharts | On-demand — deferred until a chart page is visited |
| Per-route chunks | Each page component | On-demand — loaded on first navigation to that route |

**Nginx gzip compression** (`/etc/nginx/conf.d/gzip.conf`) is applied at `comp_level 6` on JS, CSS, JSON, and SVG — reducing the initial JS payload from ~370 kB to ~130 kB over the wire.

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

GET  /api/haiku/inbox                          In-basket: unread msgs + critical labs + refill requests (provider)
GET  /api/haiku/schedule                       Today's appointments for authenticated provider
GET  /api/haiku/worklist                       Assigned patients with urgency signals (provider)
GET  /api/haiku/patients/:id/quickview         Aggregated mobile chart summary (provider)
PATCH /api/haiku/labs/:id/acknowledge          Sign/acknowledge a lab result from Haiku (provider)
PATCH /api/haiku/messages/:id/read             Mark inbox message as read from Haiku (provider)
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

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for full release history.

**Versioning:** `CHANGELOG.md` is the single source of truth for the version. The most recent `## [X.Y.Z]` heading is auto-synced into `frontend/package.json` and `backend/package.json` by a pre-commit hook. Bump the version by adding a new CHANGELOG entry — the package.json files update themselves on commit. Enable the hook once per clone:

```bash
git config core.hooksPath .githooks
# or run the sync manually at any time:
./scripts/sync-version.sh          # apply
./scripts/sync-version.sh --check  # verify only (used in CI)
```

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

**Internal Portal (Ubuntu — standalone):**

The portal ships as a self-contained tarball. A GitHub Actions workflow (`.github/workflows/portal-release.yml`) builds and publishes it automatically when `portal/**` changes on `main`, and creates a versioned GitHub Release on a `portal-vX.Y.Z` tag.

**Host requirements (Ubuntu target):**

| Requirement | Notes |
|---|---|
| Ubuntu 20.04 LTS or newer | Uses `apt-get` and `systemctl`; any Debian-based distro with systemd works |
| Root / sudo access | `install.sh` requires root — enforced at startup |
| Internet access | Required only if nginx is not already installed (`apt-get install nginx`) |
| nginx | Auto-installed by `install.sh` if absent — no manual pre-install needed |
| Port 8090 available | Or pass `--port N`; open in firewall if UFW is active: `sudo ufw allow 8090/tcp` |
| **No Node.js required** | The tarball contains pre-built static assets — no runtime dependencies |

```bash
# Build locally
cd portal && make release
# → careconnect-portal-1.0.0.tar.gz

# Install on any Ubuntu host
tar -xzf careconnect-portal-1.0.0.tar.gz
cd careconnect-portal-1.0.0
sudo ./install.sh                 # serves on :8090
sudo ./install.sh --port 9000     # custom port
sudo ./install.sh --uninstall     # remove

# Tag and release via CI
git tag portal-v1.0.0 && git push origin portal-v1.0.0
```

**Endpoint Synthetic Tests (Windows test machine):**
```powershell
# One-time setup
git clone <repo> C:\Users\<user>\healthcare
cd C:\Users\<user>\healthcare\playwright-tests
npm install
copy .env.example .env   # then edit .env with your URLs and Chrome profile path

# Run tests
.\scripts\run-tests.ps1
.\scripts\run-tests.ps1 -TestFilter "PACS"   # single suite
```
