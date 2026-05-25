# Changelog

All notable changes to CareConnect EHR are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.0.1] — 2026-05-25

### Performance

**API — eliminated double DB round-trips**
- `GET /api/appointments` — patient and provider role lookups (`SELECT id FROM patients/providers WHERE user_id = $1`) are now resolved directly via the already-joined `patients`/`providers` table columns (`p.user_id`, `pr.user_id`), removing one serial DB round-trip per request
- `GET /api/labs` and `GET /api/labs/lis-orders` — patient/provider ID lookups replaced with an inline subquery, collapsing two sequential DB calls into one
- `GET /api/medications` — same subquery fix for patient role

**API — pagination on appointments**
- `GET /api/appointments` now accepts optional `?limit=N&offset=N` query params for server-side pagination; existing callers without these params are unaffected

**Database — missing indexes added**
- `clinical_notes(patient_id)` — was causing full table scans on every `/api/notes` request
- `patients(user_id)` — used in all patient-role lookups and the new subqueries
- `providers(user_id)` — used in all provider-role lookups and the new subqueries

**Frontend — JS bundle split**
- Added Vite `manualChunks` in `vite.config.ts` splitting the 854 kB monolithic bundle into four cacheable vendor chunks:
  - `vendor-react` (~140 kB) — React, ReactDOM, react-router-dom
  - `vendor-otel` (~150 kB) — @splunk/otel-web, @opentelemetry/api
  - `vendor-utils` (~80 kB) — axios, date-fns, lucide-react, clsx, react-hook-form
  - `vendor-charts` (~300 kB) — recharts; **deferred until a chart page is visited**

**Frontend — lazy route loading**
- All page components in `App.tsx` (clinical portal) and `AppPatient.tsx` (patient portal) converted from eager static imports to `React.lazy()` dynamic imports, wrapped in `<Suspense>`
- `recharts` and its dependants no longer load on initial page paint for any route

**Nginx — gzip compression**
- Added `/etc/nginx/conf.d/gzip.conf` via `04-update.sh` with `gzip_vary`, `gzip_proxied any`, `gzip_comp_level 6`, covering JS, CSS, JSON, SVG, and plain text
- Expected wire-size reduction: ~65% on JS/CSS assets

---

## [2.0.0] — 2026-05-19

### Added

**PACS Radiology System (VM5 — local)**
- Standalone PACS server (`pacs/server/`) — DICOMweb API (port 3021), JWT auth shared with EHR accounts, WADO-URI image delivery, DICOM index built at startup from `studies/*.dcm`
- Cornerstone.js viewer (`pacs/viewer/`) — full-screen DICOM viewer (port 5174) with Window/Level, Pan, Zoom, Ruler, Angle tools and per-slice fetch latency overlay
- Bandwidth probe endpoints (`/probe/small`, `/probe/medium`, `/probe/large`) — incompressible payloads sized to scout (~200 kB), CT slice (~2 MB), and volume (~20 MB) for ThousandEyes throughput tests
- Scheduled latency anomaly (cron-driven, Mon–Fri 10:00–10:15 AM) — injects configurable WAN delay on WADO and probe endpoints without a PM2 restart
- `deploy/local-deploy.sh` — manages PACS install, start/stop, latency control, OTel setup, and DICOM sample downloads on VM5
- `deploy/configs/otel-collector-pacs.yaml` — dedicated OTel Collector config for PACS APM traces, host metrics, and log forwarding

**MyChart Scheduled Failure Injection**
- `backend/src/middleware/failure-injector.js` — Express middleware that injects daily patient-portal failures on a configurable schedule
- Two failure modes: `api` (instant HTTP 503) and `db` (8–12 s delay then 503) to produce ThousandEyes two-phase alert signatures and Splunk APM error traces
- Affected services: `careconnect-labs`, `careconnect-appointments`, `careconnect-billing`, `careconnect-notifications`
- Health endpoints (`/health`) permanently exempt
- OTel spans tagged with `mychart.failure.type`, `mychart.patient_impact`, and `mychart.failure.window_*` for APM trace filtering
- Configured via `MYCHART_FAILURE_ENABLED`, `MYCHART_FAILURE_TYPE`, `MYCHART_FAILURE_HOUR`, `MYCHART_FAILURE_MINUTE`, `MYCHART_FAILURE_DURATION` in `config.env`

**Multi-Region Web Tier**
- Second us-west-1 VM1 group (`FRONTEND_PUBLIC_IPS_UW1`, `FRONTEND_PRIVATE_IPS_UW1`, `FRONTEND_ALB_DNS_UW1`)
- AWS Global Accelerator fronting both regional ALBs with anycast routing to nearest healthy region
- `aws-deploy.sh` `update frontend` loop covers both regions in one command; React bundle built once and rsync'd to all VMs

**Playwright Endpoint Synthetic Tests**
- `playwright-tests/` — Playwright test suite for CareConnect, MyChart, and PACS login flows
- Launches Chrome externally (no automation flags) so the ThousandEyes Endpoint Agent extension reports real network telemetry
- `scripts/run-tests.ps1` — PowerShell launcher handling NTFS junction, profile patch, and Chrome lifecycle
- Windows Task Scheduler integration for 15-minute synthetic cadence

**BFF (Backend-for-Frontend) Proxy**
- `bff/` — lightweight Express proxy (port 3003) adding a dedicated `careconnect-bff` APM node between browser and API
- Creates three-tier Splunk service map: `browser (RUM) → careconnect-bff → careconnect-api → postgresql`
- Deployed as `careconnect-bff` systemd service on VM1

### Changed
- Nginx config on VM1 now serves two React SPAs from the same `dist/` directory — `index.html` for clinical portal, `patient.html` for MyChart — routed by `Host` header
- `02-setup-api.sh` and `04-update.sh` extended with `MYCHART_FAILURE_*` env var injection
- `deploy/config.env` extended with `PACS_*`, `MYCHART_FAILURE_*`, and multi-region web tier variables

---

## [1.0.0] — 2026-05-01

### Added
- CareConnect EHR — initial release
- Clinical portal (providers, admins) and MyChart patient portal as separate React SPAs
- Node.js API with 11 PM2 domain services (gateway, patients, labs, rx, notifications, FHIR, admin, billing, AI, providers, appointments)
- PostgreSQL 17 schema with full EHR data model (patients, providers, appointments, labs, medications, billing, messages, clinical notes, vitals, prescriptions)
- External integration simulations: Surescripts ePrescribing (SCRIPT 10.6), Quest/LabCorp LIS (HL7 ORM_O01), Twilio SMS, SendGrid Email
- FHIR R4 API (Patient, Observation, MedicationRequest, AllergyIntolerance, DiagnosticReport)
- Splunk Observability: RUM (clinical + patient), APM (OTel traces), Infrastructure, Logs (HEC)
- ThousandEyes: `/health`, `/ping`, `/fhir/metadata`, W3C `traceparent` propagation, mock GET probe endpoints
- AWS multi-VM deployment: `aws-deploy.sh` orchestrating VM1 (web), VM2 (API), VM3 (DB), VM4 (Mock)
- Demo seed data: 8 providers, 10 patients, 15 appointments, 21 lab results, 22 medications, 8 bills
