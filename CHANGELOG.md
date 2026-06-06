# Changelog

All notable changes to CareConnect EHR are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.4.0] — 2026-06-06

### Changed

**Azure Smart Care — Application Gateway architecture**

Replaced all three Azure Standard Load Balancers with Azure Application Gateways, providing Layer 7 load balancing across the entire Smart Care tier.

- **VNS (VM7a/7b, West US 2):** Public Application Gateway with SSL termination — HTTPS :443 → HTTP :3031 to backend VMs. VMs now serve plain HTTP; no nginx on VMs.
- **SCFP (VM6a/6b, Central US):** Internal Application Gateway — HTTP :3030 with private frontend IP; VNS reaches SCFP via `SCFP_VNS_HOST` (cross-region).
- **CPM (VM8a/8b, Central US):** Internal Application Gateway — HTTP :3032 with private frontend IP; VNS reaches CPM via `CPM_VNS_HOST` (cross-region).
- Config vars renamed: `AZURE_LB_VNS_IP` → `AZURE_APPGW_VNS_IP`, `AZURE_LB_SCFP_IP` → `AZURE_APPGW_SCFP_IP`, `AZURE_LB_CPM_IP` → `AZURE_APPGW_CPM_IP`
- `DEPLOYMENT.md` provisioning tables updated with Application Gateway Standard_v2 settings for all three components
- Architecture diagram added to Step 5c showing the full two-region topology with cross-region and cross-cloud edges

**Vendor-neutral terminology**

Removed all third-party vendor name references throughout source files, deploy scripts, config comments, and documentation. Descriptions now reflect function rather than brand:
- SCFP: "AI-powered room monitoring and fall detection"
- VNS: "Virtual nursing and remote patient oversight"
- CPM: "Predictive patient monitoring and early warning scoring"

**Demo credential standardization**

All demo user accounts unified to `@careconnect.demo` domain across every touchpoint — seed data, login pre-fills, playwright tests, deploy script summaries, and documentation. Previously a mix of `@demo.com` and `@careconnect.demo`.

- `patient@careconnect.demo`, `provider@careconnect.demo`, `admin@careconnect.demo` — primary demo logins
- All named provider/patient accounts (`dr.williams@careconnect.demo` etc.) were already correct

**Deploy script cloud-agnostic naming**

- `deploy/aws-deploy.sh` → `deploy/healthcare-deploy.sh`
- `deploy/local-deploy.sh` → `deploy/pacs-deploy.sh`
- All internal cross-references updated

### Added

**VNS → EHR nursing assessment write-back**

When a virtual nursing assessment is submitted with `ehr_document: true`, VNS now creates a real `clinical_notes` record in the CareConnect database — visible in the provider's patient chart under the Notes tab.

- New endpoint: `POST /api/notes/service` — service-to-service note creation without a user JWT
- `serviceAuth` middleware validates `X-Service-Token` header against `SERVICE_TOKEN` env var
- `SERVICE_TOKEN` written to VM2 `.env` via `02-setup-api.sh` on init; updated via `04-update.sh` on subsequent `update api` runs
- Note content includes session type, nurse, pain score, orientation, mobility, fall risk reassessment, and escalation flag
- `SERVICE_TOKEN` must match on both VM2 (API) and VM7 (VNS); generated with `openssl rand -hex 24`

**Smart Care deployment redundancy**

All three Smart Care components now deploy as two-VM pairs for redundancy and ThousandEyes Cloud Insights service topology visibility:
- `SCFP_PUBLIC_IP_1` / `SCFP_PUBLIC_IP_2` — VM6a + VM6b
- `VNS_PUBLIC_IP_1` / `VNS_PUBLIC_IP_2` — VM7a + VM7b
- `CPM_PUBLIC_IP_1` / `CPM_PUBLIC_IP_2` — VM8a + VM8b
- All six `init_*` and `update_*` functions in `healthcare-deploy.sh` loop over `_1`/`_2` IPs; `_2` is optional (blank = single-VM mode)

---

## [2.3.0] — 2026-06-05

### Added

**Smart Care Facility Platform — VM6, VM7, VM8**

Three new VMs extend the CareConnect ecosystem with AI-powered room monitoring, virtual nursing, and predictive patient monitoring capabilities. All three follow the same deployment pattern as the existing VMs — same `healthcare-deploy.sh` orchestrator, same `config.env` source of truth, same Splunk O11y Cloud instrumentation stack.

**VM6 — Smart Care Facility Platform (SCFP)** · `scfp/server/` · port 3030
- AI-powered room monitoring, fall detection, bed exit alerts, and staff workflow optimization
- `SensorSimulator` class models 24 rooms (ICU, Step-down, Med-Surg) each with virtual sensor arrays: passive infrared motion (PIR), bed pressure/exit, fall detection camera with AI confidence score, staff badge proximity (RTLS), noise level, air quality index
- Seven weighted event types generate realistic sensor streams: `motion_detected`, `bed_exit_detected`, `staff_entry`, `staff_exit`, `call_light_activated`, `inactivity_alert`, `fall_detected` — fall events are rare (2% weight) with 0.85–0.99 AI confidence scores
- Fall risk scoring (0–100) per patient; AI workflow recommendations for rounding frequency, call light response, and ICU staffing gaps
- Alert ring buffer (100 entries) with per-severity filtering; `PATCH /api/alerts/:id/ack` to acknowledge; call light state cleared on ack
- Splunk APM service: `careconnect-scfp`; logs forwarded to Splunk Platform via journald → OTel Collector → HEC

**VM7 — Virtual Nursing Station (VNS)** · `vns/server/` · port 3031
- Virtual nursing and remote patient oversight: active video nursing sessions, aggregated alert triage, patient assessments, shift handover
- Built-in HTML dashboard served at `/` (no React build step) — auto-refreshes every 10 s with live session status, severity-coded alert queue, and stats cards; serves as a ThousandEyes Page Load test target
- Six simulated nursing sessions with real-time state transitions (connecting → active → completed → recycled every 3 minutes)
- Aggregates alerts from SCFP (VM6) and CPM (VM8) via outbound HTTP calls to their private IPs — these cross-VM calls appear as `careconnect-vns → careconnect-scfp` and `careconnect-vns → careconnect-cpm` edges in the Splunk APM service map
- `POST /api/sessions/:id/assess` for nursing assessment submission (pain score, orientation, mobility, fall risk reassessment, escalation flag); escalated sessions flagged in the dashboard
- `GET /api/handover` aggregates session summary, SCFP room stats, and CPM patient stats for shift handover
- Splunk APM service: `careconnect-vns`; upstream services resolved via `SCFP_HOST`/`CPM_HOST` env vars

**VM8 — Continuous Patient Monitoring (CPM)** · `cpm/server/` · port 3032
- Predictive patient monitoring and early warning scoring: continuous vital sign streaming, NEWS2 Early Warning Score calculation, deterioration trend detection, IoT device registry
- `VitalSimulator` class monitors 20 patients with continuous vital readings every 15 s (configurable); first 4 patients are seeded as unstable (elevated RR, low SpO2, high HR) to reliably produce high-risk alerts
- Full NEWS2 algorithm implementation: respiration rate (0–3), SpO2 (0–3), supplemental O2 (+2), systolic BP (0–3), heart rate (0–3), consciousness AVPU (0 or 3), temperature (0–3) — totals mapped to low/medium/high risk tiers
- Trend detection: compares latest score to score 2 readings ago → `improving`, `stable`, or `deteriorating`
- Alerts fire on `news2_high` (critical) or `news2_medium` + deteriorating trend (warning); acknowledged via `PATCH /api/alerts/:id/ack`
- `GET /api/patients/:id/ews` returns full NEWS2 breakdown by component (value + score) — useful for Splunk Log Observer correlation
- 20-entry IoT device registry (Masimo, Philips, GE, Nihon Kohden, BioIntelliSense, Current Health, Bardy Diagnostics) with battery and signal status
- Splunk APM service: `careconnect-cpm`

**Deploy scripts**
- `deploy/07-setup-scfp.sh` — idempotent Ubuntu 22.04 setup for VM6: installs Node.js 20, deploys `scfp/server/`, writes `.env`, configures `careconnect-scfp` systemd service
- `deploy/08-setup-vns.sh` — same pattern for VM7 (`careconnect-vns`); SCFP_HOST and CPM_HOST written to `.env`
- `deploy/09-setup-cpm.sh` — same pattern for VM8 (`careconnect-cpm`)

**OTel Collector configs**
- `deploy/configs/otel-collector-scfp.yaml` — host metrics + journald logs for VM6; `host.role=scfp`, `facility.type=smart-care-facility`
- `deploy/configs/otel-collector-vns.yaml` — host metrics + journald logs for VM7; `host.role=vns`, `facility.type=virtual-nursing`
- `deploy/configs/otel-collector-cpm.yaml` — host metrics + journald logs for VM8; `host.role=cpm`, `facility.type=continuous-monitoring`
- `init otel` in `healthcare-deploy.sh` automatically includes VM6–VM8 when their `*_PUBLIC_IP` vars are set

**`healthcare-deploy.sh` — new commands**
- `init scfp`, `init vns`, `init cpm` — first-time provisioning of each new VM
- `update scfp`, `update vns`, `update cpm` — rolling source updates via rsync + service restart
- `update all` — now includes SCFP/VNS/CPM when their public IPs are set
- `init all` — unchanged (provisions core EHR VMs); prints optional commands for the new VMs
- `status` — now checks VM6, VM7, VM8 health via SSH when their public IPs are set
- `init otel` — now covers VM6, VM7, VM8 alongside the existing VMs

**`config.env` / `config.env.example`**
- New sections: `SCFP_PUBLIC_IP`, `SCFP_PRIVATE_IP`, `SCFP_PORT`, `SCFP_ROOM_COUNT`, `SCFP_EVENT_INTERVAL_MS`
- `VNS_PUBLIC_IP`, `VNS_PRIVATE_IP`, `VNS_PORT`, `VNS_HOST`
- `CPM_PUBLIC_IP`, `CPM_PRIVATE_IP`, `CPM_PORT`, `CPM_DEVICE_COUNT`, `CPM_VITAL_INTERVAL_MS`

**`DEPLOYMENT.md`**
- Architecture diagram updated with VM6–VM8 ASCII blocks and service map cross-links
- VM roles table updated with all three new VMs
- New Step 5c: Smart Care Facility Platform — deploy order, verify commands, security group rules, TE test config, SPL queries
- Splunk Observability signals table updated with SCFP/VNS/CPM APM and log entries

---

## [2.2.0] — 2026-06-02

### Added

**Cross-Region Replication Traffic Simulation**

Generates sustained 20-minute traffic bursts from uw1-web02 (us-west-1) to api02 (us-east-2) across the Transit Gateway on port 873 (rsync — IANA well-known replication port), scheduled at a random time during business hours every Monday and Wednesday. Designed to produce a predictable, realistic traffic anomaly visible in Transit Gateway flow telemetry.

- **Server (api02, us-east-2):** nginx on port 873 serving a pre-generated 512 MB random payload (`/opt/replication-server/data/replication.bin`); managed as `replication-server.service` (systemd); installs nginx automatically if not present on the API node; creates `sites-available`/`sites-enabled` scaffold and patches `nginx.conf` include if missing
- **Client (uw1-web02, us-west-1):** curl loop downloads the payload repeatedly for exactly 20 minutes; managed as `replication-traffic.service` (systemd `Type=oneshot`); cron-triggered via `/etc/cron.d/replication-traffic`; service returns to `inactive (dead)` after each run so the next scheduled trigger can fire normally
- **Randomised schedule:** cron fires at 08:00 CDT (13:00 UTC) on Mon/Wed; a `shuf`-generated random delay of 0–31,200 s (0–8h 40m) spreads the actual burst start uniformly across 08:00–16:40 CDT, ensuring every run completes before 17:00 CDT
- **Single deploy command:** `bash deploy/healthcare-deploy.sh traffic-sim` — resolves api02 from `API_PUBLIC_IP_ARRAY[1]` and uw1-web02 from the second entry of `FRONTEND_PUBLIC_IPS_UW1`, rsyncs scripts to each node, runs setup via `sudo env` (config.env is never sent to remote nodes)
- **Fully config.env-driven:** all parameters controlled via `TRAFFIC_SIM_*` variables — port, payload size, burst duration, schedule days, cron hour (UTC), random window, and enable/disable toggle
- **New files:** `deploy/traffic-sim/server-setup.sh`, `deploy/traffic-sim/client-setup.sh`, `deploy/traffic-sim/run-traffic.sh`, `deploy/traffic-sim/replication-traffic.service`, `deploy/traffic-sim/README.md`
- **Logs:** nginx access log on api02 (`/var/log/nginx/replication-access.log`), systemd journal on uw1-web02 (`journalctl -u replication-traffic`), client run log (`/var/log/replication-traffic.log`)

**`healthcare-deploy.sh` — `traffic-sim` command**
- New top-level command `bash deploy/healthcare-deploy.sh traffic-sim` added alongside `init`, `update`, and `status`
- Targets api02 and uw1-web02 by position in the IP arrays — no additional config required beyond the `TRAFFIC_SIM_*` block in `config.env`

---

## [2.1.1] — 2026-05-31

### Fixed

**Nginx — `mobile.pseudo-co.com` served clinical portal at root**
- `try_files $uri $uri/ /haiku.html` in the mobile server block caused Nginx to serve `index.html` (clinical portal) when the request path was `/`, because the `$uri/` check found the `/var/www/careconnect/` directory and the default `index` directive served `index.html` from it. Changed to `try_files $uri /haiku.html` — the directory check is not needed for an SPA fallback and was the root cause. The `/haiku/` sub-path worked correctly before the fix because no `haiku/` directory exists in the Vite build output.
- Applied in `deploy/03-setup-frontend.sh` and `deploy/04-update.sh`

**`healthcare-deploy.sh status` — all web VMs reported `000ERR`**
- Status check was hitting VM1 public IPs directly on port 80 (`http://<ip>/ping`). VM1 security groups correctly restrict port 80 to the ALB SG only, so direct-IP checks always fail in production. Changed web tier checks to use HTTPS via the ALB hostnames (`https://careconnect.pseudo-co.com/ping`, `https://mychart.pseudo-co.com/ping`, `https://mobile.pseudo-co.com/ping`) — the real user path — and replaced per-VM HTTP probes with SSH → `systemctl is-active nginx/careconnect-bff`.
- Added per-VM Haiku service check: SSH → `curl localhost:3022/health`
- Fixed cosmetic `000000ERR` output: `curl -w "%{http_code}"` always writes `000` on failure; the redundant `|| echo "000ERR"` caused duplication

**Haiku login — email field was blank**
- `HaikuLogin.tsx` now pre-seeds `provider@careconnect.demo` in the email field, consistent with the admin portal pre-filling `admin@careconnect.demo`

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
- `deploy/healthcare-deploy.sh` — `MOBILE_HOST` threaded through all four SSH env blocks (`init api`, `init frontend`, `update api`, `update frontend`); status output shows Haiku portal URL
- `deploy/config.env.example` — `MOBILE_HOST=mobile.pseudo-co.com` added; Route 53 DNS note updated
- DNS: add `mobile.pseudo-co.com` A alias → `GLOBAL_ACCELERATOR_DNS` in Route 53; add `mobile.*` host-header rule to both internet-facing ALBs
- Deploy command: `bash deploy/healthcare-deploy.sh update api && bash deploy/healthcare-deploy.sh update frontend`

---

## [2.0.2] — 2026-05-31

### Added

**Frontend — data-testid coverage for ThousandEyes transaction tests**
- `PatientChart` (provider view): added `data-testid` to patient banner, all Summary tab cards (`card-problem-list`, `card-allergies`, `card-latest-vitals`), tab content containers (`card-medications-table`, `card-labs-table`, `card-appointments-table`, `card-vitals-placeholder`), individual note cards (`note-card-{id}`), and empty state
- `Dashboard` (patient view): added `data-testid` to welcome banner (`dashboard-welcome-banner`) and all five card containers (`card-upcoming-appointments`, `card-recent-labs`, `card-quick-actions`, `card-billing-summary`, `card-active-medications`)
- Enables transaction test steps to `await` specific cards before proceeding, preventing false timeouts on the Labs and Patient Chart flows

**Frontend — admin login portal**
- `/admin/login` route added alongside the existing `/login` and patient portal routes
- Login page detects the `/admin` path and renders an "Admin Portal" hero with `admin@careconnect.demo` pre-filled

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
- `deploy/pacs-deploy.sh` — manages PACS install, start/stop, latency control, OTel setup, and DICOM sample downloads on VM5
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
- `healthcare-deploy.sh` `update frontend` loop covers both regions in one command; React bundle built once and rsync'd to all VMs

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
- AWS multi-VM deployment: `healthcare-deploy.sh` orchestrating VM1 (web), VM2 (API), VM3 (DB), VM4 (Mock)
- Demo seed data: 8 providers, 10 patients, 15 appointments, 21 lab results, 22 medications, 8 bills
