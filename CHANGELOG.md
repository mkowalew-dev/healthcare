# Changelog

All notable changes to CareConnect EHR are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.6.0] — 2026-07-21

### Added

**`@careconnect/ui` — shared component library (`packages/ui/`)**

Introduces a monorepo-level shared component library that consolidates the Cisco design system into a single source of truth for all three frontend applications (Clinical EHR, Internal Portal, PACS Viewer).

**Package structure**

- `packages/ui/` — `@careconnect/ui` package (v0.1.0). Exports TypeScript source directly; consumed at build time via a Vite `resolve.alias` in each app — no pre-compilation step required.
- Root `package.json` bootstraps npm workspaces (`packages/*`, `frontend`).
- Shared `tailwind.config.js` declares the canonical Cisco design token set (`cisco-blue`, `cisco-dark-blue`, `cisco-cyan`, `cisco-green`, `cisco-orange`, `cisco-red`, `cisco-gray`, `cisco-light-gray`), IBM Plex Sans font stack, and card/header shadow scales.

**Components**

| Component | Status | Description |
|-----------|--------|-------------|
| `Badge` | migrated | Status badges — 9 semantic variants + domain-specific composites (`LabStatusBadge`, `AppointmentStatusBadge`, `BillStatusBadge`, `MedStatusBadge`, `AllergySeverityBadge`) |
| `Modal` | migrated | Accessible dialog with sm/md/lg/xl sizes, scrollable body, optional footer slot |
| `LoadingSpinner` | migrated | Spinning indicator (sm/md/lg) + `PageLoader` full-height wrapper |
| `Button` | **new** | `primary` / `secondary` / `danger` / `ghost` variants; sm/md/lg sizes; `loading` state with spinner; left/right icon slots |
| `Card` | **new** | Container with optional header + action slot; `StatCard` variant with label, value, delta, and icon |
| `Input` | **new** | Label, hint, error, disabled, left/right adornment; ARIA `aria-invalid` + `aria-describedby` wired |

All components re-exported from `packages/ui/src/index.ts`. Existing imports through `frontend/src/components/ui/*` unchanged (those files now re-export from `@careconnect/ui` for backward compatibility).

**Storybook 8**

- `packages/ui/.storybook/main.ts` — `@storybook/react-vite` framework, `@storybook/addon-essentials`, `@storybook/addon-a11y`
- `packages/ui/.storybook/preview.ts` — IBM Plex Sans fonts, Tailwind globals, three background presets (white / surface / dark)
- Stories for all 6 components using CSF 3 (`satisfies Meta<typeof Component>`), `autodocs`, and realistic healthcare data (patient names, lab statuses, clinical workflows)

```bash
npm run storybook          # from repo root → http://localhost:6006
cd packages/ui && npm run storybook
```

**App wiring**

All three apps (`frontend`, `portal`, `pacs/viewer`) updated with:
- `resolve.alias` in `vite.config.ts` pointing `@careconnect/ui` → `../packages/ui/src/index.ts`
- `paths` entry in `tsconfig.json` for editor/type-checker resolution
- `@careconnect/ui: "*"` in `package.json` for workspace linking

**Deploy script updates**

`healthcare-deploy.sh`, `03-setup-frontend.sh`, and `04-update.sh` updated to handle the monorepo layout:
- `init_frontend` / `update_frontend` now rsync `packages/` and the root `package.json` to the EC2 VM alongside `frontend/`
- Both `03-setup-frontend.sh` and `04-update.sh` restructure the temp build directory to mirror the monorepo (`/tmp/careconnect-build/frontend/` + `/tmp/careconnect-build/packages/`) so the Vite alias resolves correctly and `npm install` links `@careconnect/ui` locally via workspace rather than hitting the npm registry

**CI update**

`portal-release.yml` install step changed from `npm ci` (portal working directory) to `npm ci --workspace=portal` from the workspace root, ensuring the workspace `package-lock.json` is used and only portal dependencies are installed.

---

## [2.5.2] — 2026-07-20

### Added

**In-app analytics dashboard (`/admin/analytics`)**

A self-hosted, Google Analytics-style web analytics system for the full CareConnect ecosystem — no external tracking service, all data stored in PostgreSQL and accessible only to admin users.

**Data collection**

- New `analytics_pageviews` table (`session_id`, `user_id`, `app`, `path`, `route`, `referrer`, `ip_address INET`, `user_agent`, `created_at`) with five covering indexes for the query patterns used by the dashboard.
- `POST /api/analytics/pageview` — unauthenticated ingest endpoint; captures the real client IP from `X-Forwarded-For` server-side so it cannot be spoofed in the request body. App name is validated against an allowlist (`clinical`, `mychart`, `haiku`, `pacs`, `portal`).
- `trackPageView()` added to `frontend/src/analytics.ts` — generates a per-browser-session UUID (stored in `sessionStorage`), decodes the JWT for user identity, detects the app from the URL path, and POSTs asynchronously with `keepalive: true`. Failure is silent so analytics never blocks navigation.
- `usePageTracking` hook updated to call `trackPageView` alongside the existing Splunk RUM span on every route change. All three SPAs (Clinical, MyChart, Haiku) already mount `<PageTracker />`, so coverage is automatic with no per-app changes.

**Backend API** (served through the existing `careconnect-admin` service on port 3016, proxied at `/api/analytics`):

| Endpoint | Description |
|----------|-------------|
| `GET /api/analytics/overview` | KPI summary (pageviews, sessions, unique visitors, authenticated users) with period-over-period % change for the trend chips |
| `GET /api/analytics/timeseries` | Daily pageviews / sessions for the area chart |
| `GET /api/analytics/top-pages` | Most visited normalized routes (UUIDs/IDs collapsed to `/:id`) |
| `GET /api/analytics/top-ips` | Most active IP addresses with per-app usage and last-seen time |
| `GET /api/analytics/apps` | Traffic breakdown by app for the donut chart |
| `GET /api/analytics/realtime` | Last 30 minutes of page view events + active session count (last 5 min) |

All read endpoints require `role=admin` JWT. All accept `?days=7|30|90` and `?app=clinical|mychart|haiku|pacs|portal` query params.

**Frontend dashboard** (`frontend/src/pages/admin/Analytics.tsx`):

- **Header controls** — App filter (All / Clinical / MyChart / Haiku / PACS / Portal) and date range selector (7d / 30d / 90d).
- **KPI cards** — Sessions, Pageviews, Unique Visitors, Authenticated Users; each shows a period-over-period % change chip (green ↑ / red ↓).
- **Pageviews over time** — Recharts `AreaChart` with gradient fill (GA4 style); dual series: Pageviews (solid) + Sessions (dashed).
- **Top Pages table** — Rank, normalized route, app badge, inline progress bar, sortable by views / sessions / visitors; expand to all rows.
- **App breakdown** — Recharts donut chart + percentage breakdown list; each app has a consistent color (`clinical`=#049FD9, `mychart`=#6EBE4A, `haiku`=#FBAB18, `pacs`=#8B5CF6, `portal`=#1D4289).
- **Top IPs table** — Per-IP inline progress bars, app badges, `auth` badge for IPs with authenticated sessions, last-seen relative time.
- **Real-time feed** — Last 50 events from the past 30 minutes with device icon (desktop/mobile), browser detection, IP, app badge, and relative timestamp. Pulsing green dot shows active session count (last 5 min). Auto-refreshes every 30 seconds; manual refresh button.
- "Analytics" nav item added to the admin sidebar.

**Deploy:** `bash deploy/healthcare-deploy.sh update api && bash deploy/healthcare-deploy.sh update frontend`  
**Access:** Log in as `admin@careconnect.demo` → Admin sidebar → **Analytics**

---

## [2.5.1] — 2026-07-20

### Fixed

**Splunk APM phantom node suppression across all services**

`net` and `dns` instrumentations were creating low-level `tcp.connect` and `dns.lookup` spans that carried `net.peer.name` without a `peer.service` label, causing Splunk APM to render anonymous inferred nodes (ALB hostname and `127.0.0.1`) alongside the named service map. The fix is applied consistently across every service that runs `@splunk/otel`:

- `backend/src/tracing.js` — existing fix carried forward; `net`/`dns` disabled via both `OTEL_NODE_DISABLED_INSTRUMENTATIONS` env var and `getNodeAutoInstrumentations` options
- `bff/src/tracing.js` — same suppression added; additionally fixed a type mismatch in the `requestHook` port comparison (strict `===` against a number failed when OTel stored `net.peer.port` as a string, so `peer.service` was never stamped on BFF→API spans)
- `cpm/server/src/tracing.js`, `pacs/server/src/tracing.js`, `scfp/server/src/tracing.js`, `vns/server/src/tracing.js` — same `net`/`dns` suppression added

**Lab simulator N+1 query pattern causing broad API slowness**

The lab simulator fired one `UPDATE lab_results` and one `UPDATE lis_orders` per pending row inside a sequential `for` loop — O(2N) round trips to Postgres on every tick. With a large seed dataset this created sustained write pressure that degraded response times across all services sharing the same PostgreSQL instance. Replaced with two bulk queries using `unnest($1::uuid[])` for lab results and `ANY($1::uuid[])` for LIS orders, reducing every simulation run to 3 round trips regardless of batch size.

Added a partial index `idx_lab_results_pending ON lab_results(ordered_at DESC) WHERE status = 'pending'` — the simulator's `SELECT` filtered on both `status` and `ordered_at` but only an `ordered_at` index existed, causing a full scan on a growing table.

**Auth login latency (`POST /api/auth/login`)**

Three stacked bottlenecks on the login critical path:

1. No index on `users(email)` — every login did a full table scan; added `UNIQUE INDEX idx_users_email ON users(email)`.
2. Sequential post-bcrypt DB writes — `UPDATE last_login` and the profile `SELECT` ran in series; replaced with `Promise.all([updateLastLogin, profileQuery])` so they execute concurrently.
3. Demo password hashes at bcrypt cost 10 (~300 ms on small cloud VMs) — reduced to cost 8 (~30 ms) via `BCRYPT_ROUNDS` env var (default 8); applied at re-seed time so existing hash cost factors are updated on next deploy.

**Haiku UUID guard on lab acknowledgement**

`PATCH /api/haiku/labs/:id/acknowledge` with an empty or malformed `criticalLabId` passed the invalid value directly to the DB query, producing an unhandled Postgres error and a 500 response. Added a UUID format guard that returns 404 before the query runs.

**`deploy/04-update.sh` — `systemctl daemon-reload` before API restart**

The API systemd unit was not being reloaded after ecosystem config regeneration, causing PM2 to start with a stale service definition. Added `daemon-reload` between config write and `systemctl restart careconnect-api`.

### Changed

**Frontend — axios request timeout**

Both the direct API client and BFF client in `frontend/src/services/api.ts` had no timeout configured. A stalled backend call (DB busy at startup, BFF restarting) left `Promise.allSettled` pending indefinitely, keeping the patient dashboard on `<PageLoader />` with no path to recovery. Set `timeout: 15000` on both clients so any hung call fails within 15 s and the dashboard renders.

**Patient dashboard — error state on total API failure**

Added an explicit error panel (with reload button) when all five dashboard data calls reject. Previously a full API outage produced an infinite loading spinner with no user-visible feedback.

---

## [2.5.0] — 2026-07-11

### Added

**CareConnect Internal Employee Portal (`portal/`)**

A standalone SharePoint-style intranet for CareConnect employees — fully independent of the EHR frontend, with its own Vite build pipeline, release artifact, and Ubuntu installer. Styled with the same Cisco design system (IBM Plex Sans, `#049FD9` cisco-blue / `#1D4289` cisco-dark-blue palette, identical white sidebar with dark-blue header, `.card`, `.btn-primary` patterns) as the EHR app — zero visual drift between products.

Seven pages: Dashboard (KPI tiles, 30-day CCHX stock area chart, announcements, company stories, events, employee spotlight), News & Announcements (category filter + search + pinned), Company Stories (featured banner + article detail view), Performance (revenue bar chart, patient satisfaction trend, workforce donut), Resources (HR/IT/Clinical/Legal document library), Employee Directory (searchable + department filter), Events Calendar (RSVP toggle).

- `portal/` — self-contained React 18 + TypeScript + Vite + Tailwind + Recharts application
- `portal/Makefile` — `make dev`, `make build`, `make release VERSION=x.y.z` targets
- `portal/nginx.conf` — production nginx config: gzip compression, security headers, cache-control, port 8090
- `portal/scripts/install.sh` — self-contained Ubuntu installer (`--port`, `--uninstall` flags); auto-installs nginx, writes site config, reloads service
- **Release artifact:** `make release` → `careconnect-portal-{version}.tar.gz` containing `dist/`, `nginx.conf`, `install.sh`

**GitHub Actions portal release workflow (`.github/workflows/portal-release.yml`)**

Triggers on any push to `main` touching `portal/**`, and on `portal-vX.Y.Z` tag pushes.
- Every qualifying main push: `npm ci` → TypeScript check + Vite build → `make release` → 30-day downloadable workflow artifact
- Tag push (`portal-v1.0.0`): all of the above, plus creates a versioned GitHub Release with the tarball and install instructions attached

**Payment gateway latency simulation with OTel distributed tracing (`backend/src/routes/bills.js`)**

Adds an instrumented simulated payment-gateway pre-auth span to the billing route. Fires automatically Mon–Fri 13:00–13:25 CDT with a 4-second delay; tunable via `BILLING_DELAY_MS` env var (set to `0` to disable entirely). Produces a `payment-gateway.pre-auth` span with gateway attributes visible in Splunk APM — demonstrates payment-path latency observability for demo scenarios.

---

## [2.4.2] — 2026-07-04

### Added

**Automatic version sync between CHANGELOG and package.json**

`CHANGELOG.md` is now the single source of truth for the project version. A pre-commit hook reads the latest `## [X.Y.Z]` heading and writes it into `frontend/package.json` and `backend/package.json`, staging the change so it lands in the same commit — the two can no longer drift (they were stuck at a stale `2.1.0` before `2.4.1`).

- `scripts/sync-version.sh` — reads the top CHANGELOG version and rewrites each package.json `version` field; supports `--check` (verify-only, non-zero exit on mismatch) for CI.
- `.githooks/pre-commit` — runs the sync on every commit and re-stages touched package.json files. Enable per clone with `git config core.hooksPath .githooks`.
- README "Changelog" section documents the workflow.

---

## [2.4.1] — 2026-07-04

### Added

**Patient portal test IDs for ThousandEyes transaction coverage**

Added stable `data-testid` attributes to patient-portal pages that previously had none or only dynamic (per-record) ids, giving ThousandEyes Transaction tests reliable wait targets that confirm backend data actually rendered — not just the page shell.

- **Notifications** (`Notifications.tsx`): `notifications-summary`, `notifications-summary-${type}`, `notifications-list`, `notification-item-${n.id}`, `notifications-empty-state` (page previously had zero test ids)
- **Health Summary** (`HealthSummary.tsx`): `card-patient-info`, `card-latest-vitals`, `card-bp-trend`, `card-allergies`, `card-problem-list`, `card-emergency-contact` (page previously had zero test ids)
- **Messages** (`Messages.tsx`): `message-list-loading`, `messages-empty-state` — the page is not loader-gated, so these give a clean signal for the inbox-fetch outcome (data / empty / loading)

### Documentation

- `deploy/TE-API-TESTS.md`: added the **CareConnect — Patient Portal (Transaction)** test, a per-page wait-target reference table (load gate + strict data-rendered target for all eight patient pages), loader-gating notes (Messages renders its shell early; Health Summary and Billing use `Promise.all`), and the empty-seed caveat. Registered the test in the platform inventory and added the `cc_patient_password` credential.

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
