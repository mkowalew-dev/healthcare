# Changelog

All notable changes to CareConnect EHR are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.1.1] — 2026-05-31

### Fixed

**Nginx — `mobile.pseudo-co.com` served clinical portal at root**
- `try_files $uri $uri/ /haiku.html` in the mobile server block caused Nginx to serve `index.html` (clinical portal) when the request path was `/`, because the `$uri/` check found the `/var/www/careconnect/` directory and the default `index` directive served `index.html` from it. Changed to `try_files $uri /haiku.html` — the directory check is not needed for an SPA fallback and was the root cause. The `/haiku/` sub-path worked correctly before the fix because no `haiku/` directory exists in the Vite build output.
- Applied in `deploy/03-setup-frontend.sh` and `deploy/04-update.sh`

**`aws-deploy.sh status` — all web VMs reported `000ERR`**
- Status check was hitting VM1 public IPs directly on port 80 (`http://<ip>/ping`). VM1 security groups correctly restrict port 80 to the ALB SG only, so direct-IP checks always fail in production. Changed web tier checks to use HTTPS via the ALB hostnames (`https://careconnect.pseudo-co.com/ping`, `https://mychart.pseudo-co.com/ping`, `https://mobile.pseudo-co.com/ping`) — the real user path — and replaced per-VM HTTP probes with SSH → `systemctl is-active nginx/careconnect-bff`.
- Added per-VM Haiku service check: SSH → `curl localhost:3022/health`
- Fixed cosmetic `000000ERR` output: `curl -w "%{http_code}"` always writes `000` on failure; the redundant `|| echo "000ERR"` caused duplication

**Haiku login — email field was blank**
- `HaikuLogin.tsx` now pre-seeds `provider@demo.com` in the email field, consistent with the admin portal pre-filling `admin@demo.com`

**`mobile.pseudo-co.com` — subdomain moved from path to dedicated hostname**
- Haiku was originally served at `careconnect.pseudo-co.com/haiku/` and required a no-trailing-slash redirect (`location = /haiku { return 301 /haiku/; }`). Replaced with a dedicated `mobile.pseudo-co.com` Nginx server block — no path prefix, no redirect edge cases
- `MOBILE_HOST` variable added to all deploy scripts and `config.env.example`; CORS and BFF origins updated
- Vite dev server retains the `/haiku/` rewrite plugin for local development (subdomains not available on localhost without `/etc/hosts` changes)

---

## [2.1.0] — 2026-05-31

### Added

**Haiku — Mobile Clinician Application**

Haiku is a mobile-first companion app for providers, modelled after EPIC Haiku. It gives clinicians at-a-glance access to their in-basket, patient worklist, schedule, and quick chart view from a phone or tablet. It runs as a third React SPA (`haiku.html`) served at `careconnect.pseudo-co.com/haiku/` — no new hostname or VM required.

**Backend — `careconnect-haiku` aggregation service (port 3022)**
- New PM2 service (`src/services/haiku-service.js`) running on loopback port 3022
- Registered in `tracing.js` loopback map so Splunk APM names it correctly in the service map
- Proxied by the API gateway at `/api/haiku/*`
- Six REST endpoints, all provider-scoped (JWT required):
  - `GET /api/haiku/inbox` — In-basket: unread messages + critical/abnormal labs pending sign-off + medications with zero refills remaining; returns `badge_count` for the app icon
  - `GET /api/haiku/schedule` — Today's appointments for the authenticated provider in chronological order
  - `GET /api/haiku/worklist` — All assigned patients with urgency signals (critical lab count, abnormal lab count, active medication count, today's appointment flag)
  - `GET /api/haiku/patients/:id/quickview` — Single aggregated mobile payload: latest vitals, active diagnoses (problem list), top 5 recent labs, active medications, allergies
  - `PATCH /api/haiku/labs/:id/acknowledge` — Signs a critical/abnormal lab result with a timestamped Haiku annotation; removes it from the inbox
  - `PATCH /api/haiku/messages/:id/read` — Marks an inbox message as read from the mobile app

**Frontend — Haiku SPA (`haiku.html` → `/haiku/*`)**
- New Vite build entry point (`haiku.html`) — produced alongside `index.html` and `patient.html` in the same `npm run build`
- Splunk RUM initialised as a separate application (`careconnect-haiku`) for independent mobile session tracking
- `AppHaiku.tsx` router with JWT auth guard (provider-only) and four route-level lazy-loaded pages
- Mobile bottom navigation bar with badge count on the Inbox tab (driven by `badge_count` from the API)
- Touch-optimised UI: large tap targets, card-based layout, iOS-style status styling

**Pages:**
- **Inbox** (`/haiku/inbox`) — Three-tab in-basket (Labs / Messages / Refills); lab cards show value, reference range, and a Sign Result action; messages mark as read on tap
- **Patients** (`/haiku/patients`) — Worklist with live search (name or MRN); urgency indicators (red triangle for critical labs, orange count for abnormal); today's appointment badge
- **Quick View** (`/haiku/patients/:id`) — At-a-glance chart: vitals grid (BP, HR, SpO₂, Temp, Weight, Pain), allergy list with severity badges, problem list with ICD codes, recent labs, active meds
- **Schedule** (`/haiku/schedule`) — Today's timeline with status chips (Scheduled / Checked In / Completed / No Show), chief complaint, and location; links through to Quick View

**Deployment**
- `deploy/02-setup-api.sh` — `careconnect-haiku` PM2 entry added to ecosystem template (initial provision)
- `deploy/04-update.sh` `api` — PM2 ecosystem regenerated with `careconnect-haiku` on updates
- `deploy/03-setup-frontend.sh` — adds a new `mobile.pseudo-co.com` Nginx server block that serves `haiku.html` as the SPA fallback; `MOBILE_HOST` variable added; BFF CORS includes mobile origin
- `deploy/04-update.sh` — same Nginx server block in the regenerated config; API CORS and BFF CORS updated to include mobile origin
- `deploy/02-setup-api.sh` — `MOBILE_HOST` added to `CORS_ORIGIN` on first provision
- `deploy/aws-deploy.sh` — `MOBILE_HOST` threaded through all four SSH env blocks (`init api`, `init frontend`, `update api`, `update frontend`); status output shows Haiku portal URL
- `deploy/config.env.example` — `MOBILE_HOST=mobile.pseudo-co.com` added; Route 53 DNS note updated
- DNS: add `mobile.pseudo-co.com` A alias → `GLOBAL_ACCELERATOR_DNS` in Route 53; add `mobile.*` host-header rule to both internet-facing ALBs
- Deploy command: `bash deploy/aws-deploy.sh update api && bash deploy/aws-deploy.sh update frontend`

---

## [2.0.2] — 2026-05-31

### Added

**Frontend — data-testid coverage for ThousandEyes transaction tests**
- `PatientChart` (provider view): added `data-testid` to patient banner, all Summary tab cards (`card-problem-list`, `card-allergies`, `card-latest-vitals`), tab content containers (`card-medications-table`, `card-labs-table`, `card-appointments-table`, `card-vitals-placeholder`), individual note cards (`note-card-{id}`), and empty state
- `Dashboard` (patient view): added `data-testid` to welcome banner (`dashboard-welcome-banner`) and all five card containers (`card-upcoming-appointments`, `card-recent-labs`, `card-quick-actions`, `card-billing-summary`, `card-active-medications`)
- Enables transaction test steps to `await` specific cards before proceeding, preventing false timeouts on the Labs and Patient Chart flows

**Frontend — admin login portal**
- `/admin/login` route added alongside the existing `/login` and patient portal routes
- Login page detects the `/admin` path and renders an "Admin Portal" hero with `admin@demo.com` pre-filled

### Fixed

**Frontend — font loading caused ThousandEyes transaction test timeouts**
- Replaced Google Fonts CDN (`fonts.gstatic.com`) with `@fontsource` self-hosted packages — eliminates external DNS/TCP on cold loads (incognito mode)
- IBM Plex Sans `@font-face` declarations rewritten with `font-display: optional`: browser commits to the system fallback immediately in incognito instead of stalling render waiting for the font file
- IBM Plex Mono removed as a web font entirely; `font-mono` now uses the system monospace stack (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas`). This was the primary cause — the font was fetched lazily the first time the Labs tab rendered, producing 15–21 second waterfall entries that caused transaction step timeouts

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
