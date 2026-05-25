# CareConnect EHR — Deployment Guide
## AWS Cloud (EHR) + Local Machine (PACS) · Ubuntu 22.04 LTS · Four-VM + Local Architecture

---

## Architecture

**Two deployment orchestrators — one config file:**

| Script | Where it runs | What it manages |
|--------|--------------|-----------------|
| `deploy/aws-deploy.sh` | Any machine with SSH access to EC2 | Cloud EHR (VM1–VM4) |
| `deploy/local-deploy.sh` | PACS VM (local) | Local PACS radiology system |

Both read from **`deploy/config.env`** — one source of truth for all configuration.

---

**Web-only multi-region:** VM1 (Nginx + BFF + React) runs in both us-east-2 and us-west-1. VM2 (API), VM3 (DB), and VM4 (Mock) stay in us-east-2. AWS Global Accelerator routes each user to the nearest healthy web region; both regions proxy API calls to the same internal ALB in us-east-2. The PACS system runs on a local VM (VM5) and is managed entirely by `local-deploy.sh`.

```
  Internet
     │
     │  HTTPS :443
     ▼
  AWS Global Accelerator  (static anycast IP — routes to nearest healthy region)
     │                 │
     ▼                 ▼
  ALB use2           ALB uw1          (internet-facing, one ACM cert each)
     │                 │
     ▼                 ▼
  ┌──────────┐    ┌──────────┐
  │ VM1 Web  │    │ VM1 Web  │        us-east-2 (primary)    us-west-1 (secondary)
  │ use2     │    │ uw1      │        Nginx :80 · BFF :3003
  └────┬─────┘    └────┬─────┘        Identical config on both
       │               │
       │  /api/* /fhir/* /bff/*       Both regions proxy to the SAME internal API ALB
       └───────────────┘
                   │
                   ▼
  ┌─────────────────────────────────────────────────┐
  │  us-east-2 only                                  │
  │                                                  │
  │  Internal ALB  →  VM2 API  (Node.js + PM2 :3001) │
  │                       │              │            │
  │                       ▼              ▼            │
  │                   VM3 DB         VM4 Mock         │
  │                   PG :5432       Node :3002       │
  └─────────────────────────────────────────────────┘

  VM5 (local — not in AWS)
  ┌──────────────────────────────────────────────────────────────────────┐
  │  PACS Server  (pacs/server/)  Node.js · Express · PM2 · :3021       │
  │    JWT auth — same @careconnect.demo accounts as the EHR             │
  │    /api/auth/login          issue JWT for radiologist / tech         │
  │    /api/worklist            reading queue filtered by assignedTo     │
  │    /api/studies/:uid        study metadata + series list             │
  │    /api/studies/:uid/series/:uid/instances  WADO-URI list per slice  │
  │    /wado                    serve raw DICOM binary (unauthenticated) │
  │    /health                  study count, latency sim status, uptime  │
  │    /ping                    lightweight ThousandEyes HTTP SLO probe  │
  │    /probe/small             ~200 KB incompressible payload (scout)   │
  │    /probe/medium            ~2 MB incompressible payload (CT slice)  │
  │    /probe/large             ~20 MB incompressible payload (volume)   │
  │    DICOM index built at startup — scans studies/*.dcm recursively    │
  │    Seed fallback — realistic metadata if no .dcm files present       │
  │    Latency sim — IMAGE_LATENCY_MS adds per-slice delay to all probes │
  │                                                                      │
  │  PACS Viewer  (pacs/viewer/)  React 18 · Vite · PM2 · :5174         │
  │    /worklist    study list from /api/worklist (radiologist's queue)  │
  │    /viewer/:uid full-screen DICOM viewer                             │
  │    Cornerstone.js v4 — renders DICOM pixel data into WebGL canvas    │
  │    WADO-URI loader fetches .dcm from /wado per slice on scroll       │
  │    Tools: Window/Level · Pan · Zoom · Slice scroll · Ruler · Angle  │
  │    Overlay: W/L values · slice index · per-image fetch latency       │
  │    WAN banner: polls /api/demo/latency — warns when latency sim on   │
  │    Requires COOP + COEP headers (set by Vite) for JPEG2000 workers   │
  └──────────────────────────────────────────────────────────────────────┘
```

**Portal split:**

| URL | Portal | Users | React entry |
|-----|--------|-------|-------------|
| `careconnect.pseudo-co.com` | CareConnect Clinical | Providers, Admins | `index.html` |
| `mychart.pseudo-co.com` | MyChart Patient Portal | Patients | `patient.html` |

Both subdomains route to the **same VM1** (or ALB target group). Nginx serves a different React bundle depending on the `Host` header. The React builds are produced in one `npm run build` command using Vite's multi-page build.

**Cross-portal redirect** — baked in at build time via `VITE_CLINICAL_HOST` / `VITE_PATIENT_HOST`:
- A patient who logs into `careconnect.pseudo-co.com` is redirected to `mychart.pseudo-co.com`
- A provider/admin who lands on `mychart.pseudo-co.com` is redirected to `careconnect.pseudo-co.com`

**Three-tier APM trace path (Splunk service map):**
```
browser (RUM)  ──▶  careconnect-bff (VM1:3003)  ──▶  careconnect-api (VM2:3001)  ──▶  postgresql (VM3:5432)
```
Clinical reads (patients, appointments, labs) flow through the BFF. Auth, messages, billing, and FHIR go direct to the API.

**Two Splunk RUM applications:**
- `careconnect-clinical` — clinical portal sessions
- `mychart-patient` — patient portal sessions

### VM roles

| VM | Role | Services | Public-facing port |
|----|------|----------|--------------------|
| VM1 | Frontend + BFF | Nginx (dual-portal static + proxy), BFF Node.js proxy | :80 |
| VM2 | API | Node.js gateway + 11 domain services (PM2) | none — proxied via VM1 |
| VM3 | Database | PostgreSQL 17 | none — private only |
| VM4 | Mock External Services | Node.js mock server | none — private only |
| **Local** | **PACS Radiology** | **PACS Server (PM2 :3021), PACS Viewer (PM2 :5174)** | **:3021, :5174** |

### Nginx routing on VM1

| Host | Path | Destination |
|------|------|-------------|
| `mychart.pseudo-co.com` | `/api/*`, `/fhir/*`, `/bff/*` | API / BFF (shared) |
| `mychart.pseudo-co.com` | `/*` | `/patient.html` (MyChart React SPA) |
| `careconnect.pseudo-co.com` | `/api/*`, `/fhir/*`, `/bff/*` | API / BFF (shared) |
| `careconnect.pseudo-co.com` | `/*` | `/index.html` (CareConnect React SPA) |
| Any | `/ping` | 200 OK (ALB health probe) |
| Any | `/health` | API health check |

---

## Prerequisites

**Cloud EHR (aws-deploy.sh):**
- [ ] EC2 instances provisioned — Ubuntu 22.04 LTS, t3.medium or larger:
  - **us-east-2**: 1+ VM1 (web), 1+ VM2 (API), 1 VM3 (DB), 1 VM4 (Mock)
  - **us-west-1**: 1+ VM1 (web) only
- [ ] SSH key pair created and `.pem` file downloaded (works across regions)
- [ ] Security group rules configured (see below)
- [ ] Public and private IPs noted for all instances in both regions
- [ ] `rsync` installed on your deployment machine
- [ ] Route 53 DNS records — **point at Global Accelerator, not the ALBs directly**:
  - `careconnect.pseudo-co.com` A alias → `GLOBAL_ACCELERATOR_DNS`
  - `mychart.pseudo-co.com` A alias → `GLOBAL_ACCELERATOR_DNS`

**Local PACS (local-deploy.sh):**
- [ ] VM5 running Ubuntu 22.04 LTS (or any Linux) — reachable via SSH from your deployment machine
- [ ] `PACS_PUBLIC_IP` set in `config.env` to VM5's public IP — same role as `*_PUBLIC_IP` vars for cloud VMs
- [ ] `PACS_SSH_USER` and `PACS_SSH_KEY` set in `config.env` — separate from the EC2 `SSH_USER`/`SSH_KEY`; falls back to those if not set
- [ ] Node.js 20 and PM2 installed automatically on VM5 by `local-deploy.sh init all` (apt/yum)

### Security group rules

| VM | Region | Inbound allowed from | Ports |
|----|--------|---------------------|-------|
| VM1 | use2 + uw1 | ALB security group | 22 (SSH), 80 (HTTP) |
| VM2 | use2 | VM1 private IPs (both regions) + deployment machine | 22 (SSH), 3001 (API) |
| VM3 | use2 | VM2 private IP | 22 (SSH), 5432 (PostgreSQL) |
| VM4 | use2 | VM2 private IP | 22 (SSH), 3002 (Mock) |

VM2's security group must allow port 3001 from **both** VPC CIDRs (use2 and uw1) because Nginx in uw1 proxies API calls cross-region to the API ALB in use2.

### AWS ALB setup

**Two internet-facing ALBs — one per region:**

1. Create an ALB in us-east-2, another in us-west-1
2. For each regional ALB:
   - Target group: VM1 private IP(s) in that region, port 80
   - HTTPS listener :443 with ACM wildcard cert for `*.pseudo-co.com` (request in each region separately)
   - Two host-header rules → same target group: `mychart.*` and `careconnect.*`
   - HTTP :80 → HTTPS redirect
   - Health check: `GET /ping`
3. Note both ALB DNS names → set `FRONTEND_ALB_DNS_USE2` and `FRONTEND_ALB_DNS_UW1` in `config.env`

**One internal ALB — us-east-2 only (API tier):**

4. Create an internal ALB in us-east-2
   - Target group: VM2 private IP(s), port 3001, health check `GET /health`
   - HTTP listener :3001
   - **Enable stickiness on the target group** (duration-based, 1 day) — required for JWT session continuity when BFF and direct API calls hit the same backend across multiple requests
5. Note the DNS name → set `API_ALB_DNS` in `config.env`

**Internet-facing ALBs — enable stickiness on target groups:**

- Each regional ALB target group (VM1) should also have stickiness enabled (duration-based, 1 day) to ensure a user's Nginx session routes consistently within a region

**Global Accelerator:**

6. Create a Global Accelerator with two endpoint groups:
   - `us-east-2`: `FRONTEND_ALB_DNS_USE2`, weight 100, health `/ping`
   - `us-west-1`: `FRONTEND_ALB_DNS_UW1`, weight 100, health `/ping`
7. Note the static anycast DNS name → set `GLOBAL_ACCELERATOR_DNS` in `config.env`
8. Create Route 53 A-alias records for both subdomains → `GLOBAL_ACCELERATOR_DNS`

---

## Quick Start

**Cloud EHR (AWS):**

```bash
# 1. Fill in your config
cp deploy/config.env.example deploy/config.env
vi deploy/config.env

# 2. Provision all four VMs in the correct order (~10 min)
bash deploy/aws-deploy.sh init all

# 3. Verify everything is healthy
bash deploy/aws-deploy.sh status
```

**Local PACS (VM5):**

```bash
# Uses the same config.env — make sure PACS_* vars are set first

# 4. Install the SSH key on VM5 (one-time, prompts for VM5 password)
bash deploy/local-deploy.sh copy-id

# 5. Provision VM5: install Node.js, deploy PACS, download DICOM samples (~5–8 min)
bash deploy/local-deploy.sh init all

# 6. Verify
bash deploy/local-deploy.sh status
```

The PACS viewer opens at `http://<PACS_PUBLIC_IP>:5174`. Log in with `dr.chen@careconnect.demo` / `Demo123!`.

That's it for a working deployment. The sections below explain each step in detail.

---

## Step 0 — Prepare config.env

```bash
cp deploy/config.env.example deploy/config.env
vi deploy/config.env
```

The config uses per-region IP vars for the web tier and flat lists for API/DB/Mock:

```bash
# ── Web tier — us-east-2 (primary region) ─────────────────────
FRONTEND_PUBLIC_IPS_USE2="1.2.3.10"        # EC2 public IP(s) in use2
FRONTEND_PRIVATE_IPS_USE2="10.0.1.10"      # VPC-internal IP(s) in use2
FRONTEND_ALB_DNS_USE2=careconnect-frontend-use2-xxxx.us-east-2.elb.amazonaws.com

# ── Web tier — us-west-1 (secondary region) ───────────────────
FRONTEND_PUBLIC_IPS_UW1="2.3.4.10"         # EC2 public IP(s) in uw1
FRONTEND_PRIVATE_IPS_UW1="10.1.1.10"       # VPC-internal IP(s) in uw1
FRONTEND_ALB_DNS_UW1=careconnect-frontend-uw1-xxxx.us-west-1.elb.amazonaws.com

# ── Global Accelerator ─────────────────────────────────────────
GLOBAL_ACCELERATOR_DNS=xxxxxxxxxxxxxxxx.awsglobalaccelerator.com

# ── API / DB / Mock — us-east-2 only ──────────────────────────
API_PUBLIC_IPS="1.2.3.20"
API_PRIVATE_IPS="10.0.1.20"
DB_PUBLIC_IP=1.2.3.30
DB_HOST=10.0.1.30         # self-managed VM private IP; or RDS endpoint FQDN
MOCK_PUBLIC_IP=1.2.3.40
MOCK_PRIVATE_IP=10.0.1.40

# ── Internal API ALB (us-east-2) ──────────────────────────────
API_ALB_DNS=careconnect-api-alb-internal-xxxx.us-east-2.elb.amazonaws.com
```

`aws-deploy.sh` automatically combines `FRONTEND_PUBLIC_IPS_USE2` and `FRONTEND_PUBLIC_IPS_UW1` into a single deploy loop — all web VMs receive identical configuration.

Set the portal hostnames:

```bash
CLINICAL_HOST=careconnect.pseudo-co.com   # CareConnect clinical portal
PATIENT_HOST=mychart.pseudo-co.com        # MyChart patient portal
```

Generate strong secrets before your first deploy:

```bash
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
echo "DB_PASSWORD=$DB_PASSWORD"
echo "JWT_SECRET=$JWT_SECRET"
```

Set `DB_HOST` to the database VM's **private IP** (or a private DNS FQDN if you have one):

```bash
DB_HOST=10.0.1.30   # or: careconnect-db.internal.example.com
```

---

## Step 1 — Init DB (VM3)

```bash
bash deploy/aws-deploy.sh init db
```

What this does:
- Installs PostgreSQL 17 from the official apt repository
- Creates the `careconnect` database and user
- Configures `pg_hba.conf` to accept connections from VM2's private IP only
- Enables query logging (slow queries > 1s logged to `pg_log/`)

---

## Step 2 — Init Mock Services (VM4)

```bash
bash deploy/aws-deploy.sh init mock
```

**Run before API init** — the API's `.env` gets the mock URLs written during its setup.

---

## Step 3 — Init API (VM2)

```bash
bash deploy/aws-deploy.sh init api
```

What this does:
- Installs Node.js 20 and PM2
- Deploys backend source to `/opt/careconnect/api/`
- Writes `/opt/careconnect/api/.env` with CORS origins for **both** portals:
  ```
  CORS_ORIGIN=https://careconnect.pseudo-co.com,https://mychart.pseudo-co.com
  ```
- Verifies DB connectivity (fails fast if VM3 is unreachable)
- Seeds the database (patients, providers, appointments, labs, demo accounts)
- Starts 11 PM2 processes (gateway + 10 domain services) as a systemd service

The seeded demo accounts:

| Role | Email | Password | Portal |
|------|-------|----------|--------|
| Patient | `patient@demo.com` | `Demo123!` | mychart.pseudo-co.com |
| Provider | `provider@demo.com` | `Demo123!` | careconnect.pseudo-co.com |
| Admin | `admin@demo.com` | `Demo123!` | careconnect.pseudo-co.com |

---

## Step 4 — Init Frontend + BFF (VM1)

```bash
bash deploy/aws-deploy.sh init frontend
```

What this does:
- Installs Node.js 20 and Nginx
- Runs `npm run build` — produces **two React bundles** in one pass:
  - `dist/index.html` → CareConnect clinical portal (providers, admins)
  - `dist/patient.html` → MyChart patient portal (patients)
  - Both bundles share the same `dist/assets/` chunk directory
- Deploys static files to `/var/www/careconnect/`
- Writes the Nginx config with **two server blocks** — one per subdomain
- Deploys BFF to `/opt/careconnect/bff/` and starts `careconnect-bff` systemd service

This step takes ~3 minutes (React build runs on the VM).

---

## Step 5 — Verify

```bash
bash deploy/aws-deploy.sh status
```

### End-to-end smoke tests

```bash
# Test MyChart patient portal
curl http://<FRONTEND_PUBLIC_IP>/ping                      # ALB health probe
curl -H "Host: mychart.pseudo-co.com" http://<VM1_IP>/     # patient.html served

# Test CareConnect clinical portal
curl -H "Host: careconnect.pseudo-co.com" http://<VM1_IP>/ # index.html served

# Login as provider (clinical portal)
TOKEN=$(curl -s -X POST http://<VM1_IP>/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Host: careconnect.pseudo-co.com" \
  -d '{"email":"provider@demo.com","password":"Demo123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# FHIR CapabilityStatement (no auth)
curl http://<VM1_IP>/fhir/metadata | python3 -m json.tool

# Submit an ePrescription → hits VM4 via Surescripts mock
curl -s -X POST http://<VM1_IP>/api/eprescribe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"<any-patient-uuid>","medicationName":"Metformin HCl","sig":"Take 1 tablet twice daily","quantity":60}' \
  | python3 -m json.tool
```

---

## Step 5b — PACS Radiology System (local)

The PACS runs on VM5 (a local machine, not in AWS). It is managed entirely by `deploy/local-deploy.sh`, which reads the same `deploy/config.env` as `aws-deploy.sh`.

### Configure PACS vars in config.env

```bash
# ── PACS — Radiology Imaging System (local) ──────────────────
PACS_PUBLIC_IP=127.0.0.1        # use 127.0.0.1 for same-machine; set LAN IP if
                                 # ThousandEyes Enterprise Agent is on another machine
PACS_SERVER_PORT=3021            # DICOMweb API
PACS_VIEWER_PORT=5174            # Cornerstone.js viewer
PACS_JWT_SECRET=$(openssl rand -hex 32)
PACS_IMAGE_LATENCY_MS=0          # raise for ThousandEyes WAN degradation demos
PACS_IMAGE_LATENCY_JITTER_MS=0
```

### Install and start

```bash
bash deploy/local-deploy.sh init all
```

This installs PM2 if missing, runs `npm install` in `pacs/server/` and `pacs/viewer/`, writes `.env` files from `config.env`, and starts both services under PM2.

### DICOM sample images

Sample images are downloaded automatically during `init all`. The download fetches pydicom test files (CT, MRI, X-ray) into `pacs/server/studies/` and the server re-indexes them on startup. To re-download manually:

```bash
bash deploy/local-deploy.sh init samples
```

### Demo users

| Email | Password | Role |
|-------|----------|------|
| `dr.chen@careconnect.demo` | `Demo123!` | Attending Radiologist — Diagnostic Radiology |
| `dr.patel@careconnect.demo` | `Demo123!` | Attending Radiologist — Neuroradiology |
| `tech.jones@careconnect.demo` | `Demo123!` | Lead CT/MRI Technologist |

### Access

| Service | URL |
|---------|-----|
| PACS Viewer | `http://<PACS_PUBLIC_IP>:5174` |
| PACS API health | `http://<PACS_PUBLIC_IP>:3021/health` |
| PACS ping | `http://<PACS_PUBLIC_IP>:3021/ping` |
| Bandwidth probe — small | `http://<PACS_PUBLIC_IP>:3021/probe/small` |
| Bandwidth probe — medium | `http://<PACS_PUBLIC_IP>:3021/probe/medium` |
| Bandwidth probe — large | `http://<PACS_PUBLIC_IP>:3021/probe/large` |

### Scheduled demo anomaly (Mon–Fri)

The PACS server includes a cron-driven latency anomaly designed for SE demo teams. Every weekday at **10:00 AM** (VM5 system timezone), the server injects 1 500 ms + 300 ms jitter into every image retrieval and bandwidth probe response. At **10:15 AM** it clears automatically. The window is predictable so no manual setup is required before a demo.

**Set up the cron (run once after `init all`):**

```bash
bash deploy/local-deploy.sh init cron
```

**Configure the schedule and intensity in `deploy/config.env`:**

```bash
PACS_ANOMALY_LATENCY_MS=1500          # ms of latency injected
PACS_ANOMALY_JITTER_MS=300            # ms of added jitter (realism)
PACS_ANOMALY_ENABLE_CRON=0 10 * * 1-5   # cron — enable at 10:00 AM Mon–Fri
PACS_ANOMALY_DISABLE_CRON=15 10 * * 1-5 # cron — disable at 10:15 AM
```

Then re-run `init cron` to push the new schedule. The cron expressions run in the **VM5 system timezone** — check `timedatectl` on VM5 if the window doesn't fire at the expected wall-clock time.

**Trigger on-demand (no need to wait for the schedule):**

```bash
bash deploy/local-deploy.sh anomaly enable   # start anomaly immediately
bash deploy/local-deploy.sh anomaly disable  # restore normal immediately
```

**How it works:**

The `pacs-anomaly.sh` script (deployed to `~/careconnect/pacs/server/scripts/`) calls `POST /api/demo/latency` with an internal shared-secret header (`X-Demo-Secret`). The latency is applied in-memory with no PM2 restart — effect is instant. The state resets to the `.env` baseline value on the next server restart. Cron output is appended to `~/logs/careconnect/anomaly.log` on VM5.

**What ThousandEyes will see:**

During the 10:00–10:15 window, all three bandwidth probe tests, the WADO image retrieval path, and any active transaction tests will show elevated response times and degraded throughput. The three probe tiers (`/probe/small`, `/probe/medium`, `/probe/large`) show how the anomaly scales across object sizes — a 1 500 ms base delay has a bigger relative impact on a 200 KB fetch than on a 20 MB transfer, which maps directly to a radiologist's experience loading individual DICOM slices.

### ThousandEyes bandwidth probes

Three unauthenticated endpoints expose fixed-size incompressible payloads sized to match real DICOM object classes. Configure each as a separate **HTTP Server** test in ThousandEyes to build a responsiveness curve across object sizes — this shows how WAN degradation scales with transfer size, not just connection latency.

| Endpoint | Payload | DICOM analogue |
|----------|---------|----------------|
| `/probe/small` | ~200 KB | Scout / localizer image |
| `/probe/medium` | ~2 MB | Axial CT slice (512×512 16-bit uncompressed) |
| `/probe/large` | ~20 MB | Multi-frame CT or thick MR slab |

**Design notes:**
- Payloads are generated with `crypto.randomBytes()` at server startup — incompressible so HTTP gzip/deflate cannot skew transfer measurements.
- `Cache-Control: no-store` is set on every response, preventing proxies or the ThousandEyes agent from serving cached bytes.
- `IMAGE_LATENCY_MS` applies to all three probes (same as `/wado`), so a simulated WAN degradation shows the full impact across object sizes simultaneously.
- Each response includes `X-Probe-Bytes` and `X-Probe-Label` headers for easy verification.

**Test from curl:**

```bash
# Individual tests — one per size tier
curl -o /dev/null -w "size=%{size_download}B  time=%{time_total}s  speed=%{speed_download}B/s\n" \
     http://pacs.pseudo-co.com:3021/probe/small

curl -o /dev/null -w "size=%{size_download}B  time=%{time_total}s  speed=%{speed_download}B/s\n" \
     http://pacs.pseudo-co.com:3021/probe/medium

curl -o /dev/null -w "size=%{size_download}B  time=%{time_total}s  speed=%{speed_download}B/s\n" \
     http://pacs.pseudo-co.com:3021/probe/large
```

**Suggested ThousandEyes HTTP test config for each probe:**
- Test type: HTTP Server
- URL: `http://<PACS_HOST>:3021/probe/<size>`
- Method: GET
- Alert on: response time > threshold, throughput < threshold
- Run from: the ThousandEyes Enterprise Agent co-located with (or near) the radiologist workstation

---

## Step 6 — Splunk OTel Collectors (optional)

Requires `SPLUNK_ACCESS_TOKEN`, `SPLUNK_REALM`, `SPLUNK_PLATFORM_HEC_URL`, and `SPLUNK_PLATFORM_HEC_TOKEN` set in `config.env`.

**Cloud EHR (VM1–VM3):**

```bash
bash deploy/aws-deploy.sh init otel
```

| VM | Collector role | Collects |
|----|---------------|----------|
| VM1 | `frontend` | Host metrics, Nginx logs, BFF Node.js traces |
| VM2 | `api` | Host metrics, PM2 app logs, Node.js APM traces |
| VM3 | `db` | Host metrics, PostgreSQL metrics, DB logs |

**PACS (VM5 / local):**

```bash
bash deploy/local-deploy.sh init otel
```

This SSHes to VM5, runs `05-setup-otel-collector.sh pacs`, writes the PACS-specific OTel config (`deploy/configs/otel-collector-pacs.yaml`), and restarts the PACS server with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317` so APM traces route through the collector rather than directly to Splunk.

| Signal | Source | Splunk destination |
|--------|--------|--------------------|
| APM traces | PACS Node.js → OTLP gRPC :4317 → collector | Splunk O11y Cloud APM — `careconnect-pacs` service |
| Host metrics | OTel `hostmetrics` receiver on VM5 | Splunk Infrastructure Monitoring |
| PACS server logs | Winston JSON → `~/logs/careconnect/pacs-out.log` → `file_log` receiver | Splunk Platform via HEC — `sourcetype: careconnect:json` |
| RUM | `@splunk/otel-web` in Vite bundle | Splunk RUM — `careconnect-pacs-viewer` application |

The PACS `careconnect-pacs` APM service will appear in the Splunk service map as a separate node. WADO image-delivery spans are tagged with `pacs.endpoint=wado` and worklist calls with `pacs.endpoint=worklist`, enabling per-endpoint latency breakdowns — useful when demonstrating ThousandEyes WAN degradation alongside Splunk APM.

**RUM** is baked into the viewer at build time via `VITE_SPLUNK_RUM_TOKEN`. Set this in `config.env` before running `init viewer` or `update viewer`:

```bash
SPLUNK_RUM_TOKEN=<your-rum-ingest-token>    # type: RUM (separate from APM ingest token)
```

---

## Ongoing Operations

### Apply DB schema changes to a live database

New indexes and schema changes in `backend/src/db/schema.sql` are applied automatically on fresh installs (`init db`). For a **running database**, apply them directly:

```bash
# Connect to the DB VM
ssh -i ~/.ssh/aws-key ubuntu@<DB_PUBLIC_IP>

# Apply each new index individually — CONCURRENTLY avoids table locks
psql postgresql://<DB_USER>:<DB_PASSWORD>@localhost:5432/<DB_NAME> \
  -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clinical_notes_patient ON clinical_notes(patient_id);' \
  -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_user ON patients(user_id);' \
  -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_providers_user ON providers(user_id);'
```

> **Why separate `-c` flags?** `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. Each `-c` argument runs as its own independent statement; passing multiple statements in one `-c` string wraps them in a transaction.

### Deploy code changes

```bash
# Push a backend change (zero-downtime PM2 reload)
bash deploy/aws-deploy.sh update api

# Push a UI change to both portals (React rebuild + Nginx reload, ~2 min)
bash deploy/aws-deploy.sh update frontend

# Push a BFF change only (no React rebuild, ~20 sec)
bash deploy/aws-deploy.sh update bff

# Push a mock-services.js change
bash deploy/aws-deploy.sh update mock

# Push everything
bash deploy/aws-deploy.sh update all
```

### Check service health on each VM

```bash
# VM1 — Nginx + BFF
ssh ubuntu@<FRONTEND_PUBLIC_IP> "systemctl status nginx careconnect-bff"
ssh ubuntu@<FRONTEND_PUBLIC_IP> "journalctl -u careconnect-bff -n 50"

# VM2 — API (PM2)
ssh ubuntu@<API_PUBLIC_IP> "systemctl status careconnect-api"
ssh ubuntu@<API_PUBLIC_IP> "journalctl -u careconnect-api -n 50"

# VM3 — PostgreSQL
ssh ubuntu@<DB_PUBLIC_IP> "sudo systemctl status postgresql"
ssh ubuntu@<DB_PUBLIC_IP> "sudo -u postgres psql -d careconnect -c 'SELECT count(*) FROM patients;'"

# VM4 — Mock services
ssh ubuntu@<MOCK_PUBLIC_IP> "systemctl status careconnect-mock"
ssh ubuntu@<MOCK_PUBLIC_IP> "curl -s http://localhost:3002/health | python3 -m json.tool"
```

### Re-seed the database

```bash
ssh ubuntu@<API_PUBLIC_IP>
cd /opt/careconnect/api
sudo -u careconnect node src/db/seed.js
```

### PACS operations

```bash
# Check PACS status and ThousandEyes test URLs
bash deploy/local-deploy.sh status

# Stop / start / restart individual services
bash deploy/local-deploy.sh stop all
bash deploy/local-deploy.sh start all
bash deploy/local-deploy.sh restart server
bash deploy/local-deploy.sh restart viewer

# Tail logs
bash deploy/local-deploy.sh logs server
bash deploy/local-deploy.sh logs viewer

# Update PACS code (npm install + PM2 reload, no restart needed)
bash deploy/local-deploy.sh update all
```

### MyChart scheduled failure injection (ThousandEyes + Splunk APM demo)

Injects daily patient-portal failures across labs, medications, appointments, messages, and billing — without touching the clinical portal. Designed to produce ThousandEyes synthetic alerts alongside correlated Splunk APM error traces so you can walk through the full observability story in a single demo window.

**Configure in `deploy/config.env`:**

```bash
# ── MyChart Scheduled Failure Injection ──────────────────────
MYCHART_FAILURE_ENABLED=true
MYCHART_FAILURE_TYPE=api        # api | db — see failure modes below
MYCHART_FAILURE_HOUR=14         # 24h server-local time (14 = 2:00 PM)
MYCHART_FAILURE_MINUTE=0
MYCHART_FAILURE_DURATION=15     # minutes — auto-resolves after this
```

**Deploy the configuration change:**

```bash
bash deploy/aws-deploy.sh update api
```

The injector reads env vars at process startup, so a code update is not required if only the schedule or type is changing — `update api` rewrites the `.env` on VM2 and does a PM2 reload.

**To disable — empty the flag and re-deploy:**

```bash
# In config.env:
MYCHART_FAILURE_ENABLED=

bash deploy/aws-deploy.sh update api
```

**Failure modes:**

| Type | What happens | ThousandEyes | Splunk APM |
|------|-------------|--------------|------------|
| `api` | Returns HTTP 503 immediately. Simulates upstream EHR integration outage. | HTTP synthetic test fails (503). TE alert fires within one test cycle. | `mychart.failure.api` child span on each affected service; gateway CLIENT span shows 503 in < 5 ms. Clean error — no latency. |
| `db` | Holds the request for 8–12 s, then returns HTTP 503. Simulates PostgreSQL connection pool exhaustion. | Response-time alert fires first; 503 follows. Two-phase signal that mirrors real DB saturation. | `mychart.failure.db` child span with 8–12 s duration; service map shows red edges from each patient service to the database node. |

**Health endpoints are always exempt** — `/health` on each service is never intercepted, so PM2 process monitoring, the API gateway health check, and ThousandEyes HTTP Server tests targeting `/health` stay green. Only patient data routes (labs, medications, appointments, messages, bills) return 503.

**What Splunk APM shows:**

Every failed request produces an OTel child span with these attributes, queryable in Trace Analyzer and filterable in the service map:

| Attribute | Values |
|-----------|--------|
| `error` | `true` |
| `mychart.failure.type` | `api` or `db` |
| `mychart.failure.reason` | Human-readable description |
| `mychart.failure.window_start` | ISO 8601 timestamp |
| `mychart.failure.window_end` | ISO 8601 timestamp |
| `mychart.patient_impact` | `true` |
| `http.status_code` | `503` |

The span name is `mychart.failure.api` or `mychart.failure.db` — use this as a filter in Splunk APM Trace Search to isolate injection events from organic errors.

**Affected services (VM2 PM2 processes):**

- `careconnect-labs` — lab results, medications
- `careconnect-appointments` — appointment booking and history
- `careconnect-billing` — bill pay
- `careconnect-notifications` — secure messages

**Suggested ThousandEyes transaction test for this failure:**

Extend the existing Patient login transaction test (see below) to navigate to a data-heavy page (e.g. labs or appointments) after login. During the failure window the API call will fail, the React component will display an error state, and the transaction step will time out — giving you a clean TE → Splunk APM drill-down story.

---

### Simulate PACS WAN degradation (ThousandEyes demo)

Raise image latency to simulate a slow WAN path between the radiologist workstation and the PACS server. ThousandEyes waterfall charts will show the degradation; radiologists notice slow image loads.

```bash
# Inject 1500 ms latency + 300 ms jitter on DICOM image delivery
bash deploy/local-deploy.sh latency set 1500 300

# Check current latency setting
bash deploy/local-deploy.sh latency status

# Remove latency (restore normal performance)
bash deploy/local-deploy.sh latency clear
```

Latency is applied **per image slice** on the `/wado` endpoint — a CT series of 30 slices becomes very apparent at 1500 ms/slice. The `/health` and `/ping` endpoints are unaffected, so ThousandEyes HTTP Server tests stay green while Page Load and Transaction tests degrade, accurately reflecting a WAN-only problem.

### Adjust mock latency during a demo

**Via the Admin UI (easiest):** Navigate to **Admin → Integrations → Mock Simulation Controls**.

**Via SSH + curl:**
```bash
# Slow Surescripts (simulates congested network)
ssh ubuntu@<MOCK_PUBLIC_IP> "curl -s -X PATCH http://localhost:3002/config \
  -H 'Content-Type: application/json' \
  -d '{\"surescripts\": {\"latencyMs\": 2000, \"failureRate\": 0.3}}'"

# Reset all to defaults
ssh ubuntu@<MOCK_PUBLIC_IP> "curl -s -X PATCH http://localhost:3002/config \
  -d '{\"surescripts\":{\"latencyMs\":180,\"jitterMs\":60,\"failureRate\":0,\"timeoutRate\":0},\"quest\":{\"latencyMs\":240,\"jitterMs\":80,\"failureRate\":0,\"timeoutRate\":0},\"labcorp\":{\"latencyMs\":310,\"jitterMs\":100,\"failureRate\":0,\"timeoutRate\":0},\"twilio\":{\"latencyMs\":120,\"jitterMs\":40,\"failureRate\":0,\"timeoutRate\":0},\"sendgrid\":{\"latencyMs\":95,\"jitterMs\":30,\"failureRate\":0,\"timeoutRate\":0}}'"
```

---

## Multi-Region Operations

### Deploy a web update to both regions

`update frontend` loops over all VMs in `FRONTEND_PUBLIC_IPS_USE2` + `FRONTEND_PUBLIC_IPS_UW1` — no extra steps needed:

```bash
bash deploy/aws-deploy.sh update frontend
```

The React bundle is built once on the first VM then re-used via rsync for subsequent VMs, so build time doesn't multiply with region count.

### Deploy to one region only (partial rollout)

Set only that region's IPs before running update:

```bash
# Deploy to us-west-1 only
FRONTEND_PUBLIC_IPS_USE2="" bash deploy/aws-deploy.sh update frontend

# Deploy to us-east-2 only
FRONTEND_PUBLIC_IPS_UW1="" bash deploy/aws-deploy.sh update frontend
```

### Disable a region (maintenance / incident)

Set the endpoint weight to 0 in the Global Accelerator console — traffic shifts entirely to the healthy region within ~30 seconds. Re-enable by restoring the weight to 100.

### Cross-region API latency

Web VMs in us-west-1 proxy `/api/*` to the API ALB in us-east-2. At AWS backbone speeds this adds ~60–80 ms RTT. This is acceptable for the clinical/patient workflows here. If sub-30 ms API latency from the west coast becomes a requirement, promote the API tier to active-active (requires Aurora Global Database — see architecture notes in `config.env.example`).

### Health check scope

`bash deploy/aws-deploy.sh status` checks all web VMs individually via their public IPs. To confirm Global Accelerator is routing correctly, test via the public hostname:

```bash
curl -v https://careconnect.pseudo-co.com/ping    # should return "pong" from nearest region
curl -v https://mychart.pseudo-co.com/ping
```

---

## ThousandEyes Configuration

### Cloud agent tests

| Test type | URL | Alert threshold |
|-----------|-----|----------------|
| HTTP Server — CareConnect | `https://careconnect.pseudo-co.com/` | HTTP ≠ 200 |
| HTTP Server — MyChart | `https://mychart.pseudo-co.com/` | HTTP ≠ 200 |
| HTTP Server — API Health | `https://careconnect.pseudo-co.com/health` | `"status":"healthy"` missing |
| HTTP Server — BFF | `https://careconnect.pseudo-co.com/bff/health` | HTTP ≠ 200 |
| Transaction — Patient login (MyChart) | see script below | Step failure |
| Transaction — Provider ePrescribe (CareConnect) | see script below | Step failure |

### Endpoint Agent synthetic tests (on-premises Windows machine)

The Playwright test suite in `playwright-tests/` runs on the Windows test machine and generates Endpoint Agent sessions. No additional ThousandEyes test configuration is required — sessions appear automatically under **Endpoint Agents → Views → Browser Sessions** after each scheduled run.

To alert on synthetic test failures, configure an **Endpoint Agent Scheduled Test** in ThousandEyes targeting the Windows machine, or monitor the scheduled task's exit code via the log files in `playwright-tests\logs\`.

| Portal tested | Endpoint Agent view |
|---------------|-------------------|
| CareConnect provider login | Browser session — `careconnect.pseudo-co.com` |
| MyChart patient login | Browser session — `mychart.pseudo-co.com` |
| PACS radiologist login | Browser session — `<PACS_PUBLIC_IP>:5174` |

### PACS tests (Enterprise Agent targeting VM5)

Set `PACS_PUBLIC_IP` in `config.env` to VM5's IP address. Use `127.0.0.1` only when the ThousandEyes Enterprise Agent runs on the same machine as the PACS server.

Run `bash deploy/local-deploy.sh status` to see the exact URLs ThousandEyes should target.

| Test type | URL | Alert threshold |
|-----------|-----|----------------|
| HTTP Server — PACS API | `http://<PACS_PUBLIC_IP>:3021/health` | HTTP ≠ 200 |
| HTTP Server — PACS Ping | `http://<PACS_PUBLIC_IP>:3021/ping` | HTTP ≠ 200 or latency > 200 ms |
| Page Load — PACS Viewer | `http://<PACS_PUBLIC_IP>:5174` | Page load > 3 s |
| Transaction — Radiologist workflow | see script below | Step failure or image load > 5 s |

**HTTP Server — PACS health** response body assertion: verify `"status":"ok"` is present. The `/health` endpoint also returns `studyCount`, `instanceCount`, and `latencySimulation` — useful for content-match verification in TE alerts.

### Transaction test — Radiologist workflow (PACS)

Use this script with ThousandEyes Transaction tests (replace `PACS_IP` and `PACS_VIEWER_PORT` with your values from `config.env`):

```javascript
import { driver, By, until } from 'thousand-eyes-recorder';

const BASE = 'http://PACS_IP:5174';

// Step 1 — Load login page
await driver.get(`${BASE}/`);
await driver.wait(until.titleContains('PACS'), 10000);

// Step 2 — Log in as radiologist
await driver.findElement(By.css('input[type="email"]')).sendKeys('dr.chen@careconnect.demo');
await driver.findElement(By.css('input[type="password"]')).sendKeys('Demo123!');
await driver.findElement(By.css('button[type="submit"]')).click();

// Step 3 — Worklist loads
await driver.wait(until.urlContains('/worklist'), 10000);
await driver.wait(until.elementLocated(By.css('[data-testid="study-row"]')), 8000);

// Step 4 — Open first study (CT CHEST)
await driver.findElement(By.css('[data-testid="study-row"]')).click();

// Step 5 — Image viewer loads (Cornerstone renders first image)
await driver.wait(until.urlContains('/study/'), 10000);
await driver.wait(until.elementLocated(By.css('canvas')), 15000);
```

This transaction measures the full radiology workflow: login → worklist load → image render. When `PACS_IMAGE_LATENCY_MS` is raised, Step 5 degrades first — ThousandEyes isolates the image-delivery hop in the waterfall.

### Transaction test — Patient login (MyChart)

```javascript
import { driver, By, until } from 'thousand-eyes-recorder';

await driver.get('https://mychart.pseudo-co.com/');
await driver.wait(until.titleContains('MyChart'), 10000);
await driver.findElement(By.css('input[type="email"]')).sendKeys('patient@demo.com');
await driver.findElement(By.css('input[type="password"]')).sendKeys('Demo123!');
await driver.findElement(By.css('button[type="submit"]')).click();
await driver.wait(until.urlContains('/patient/dashboard'), 10000);
await driver.findElement(By.css('[data-testid="nav-link-appointments"]')).click();
await driver.wait(until.urlContains('/patient/appointments'), 5000);
await driver.findElement(By.css('[data-testid="nav-link-test-results"]')).click();
await driver.wait(until.urlContains('/patient/labs'), 5000);
```

### Transaction test — MyChart scheduled failure (extended patient flow)

Use this extended version during the `MYCHART_FAILURE_*` window. Steps 1–3 succeed (login is never blocked); steps 4–6 fail when the injector is active, producing a clean TE alert → Splunk APM drill-down story.

```javascript
import { driver, By, until } from 'thousand-eyes-recorder';

// Step 1 — Load patient portal
await driver.get('https://mychart.pseudo-co.com/');
await driver.wait(until.titleContains('MyChart'), 10000);

// Step 2 — Log in (auth route is never affected by failure injection)
await driver.findElement(By.css('input[type="email"]')).sendKeys('patient@demo.com');
await driver.findElement(By.css('input[type="password"]')).sendKeys('Demo123!');
await driver.findElement(By.css('button[type="submit"]')).click();
await driver.wait(until.urlContains('/patient/dashboard'), 10000);

// Step 3 — Navigate to appointments (triggers /api/appointments call)
await driver.findElement(By.css('[data-testid="nav-link-appointments"]')).click();
await driver.wait(until.urlContains('/patient/appointments'), 5000);
// During api failure: page loads but shows error state — step times out
// During db failure: step hangs 8–12 s before the error state appears
await driver.wait(until.elementLocated(By.css('[data-testid="appointment-card"], [data-testid="error-state"]')), 15000);

// Step 4 — Navigate to lab results (triggers /api/labs call)
await driver.findElement(By.css('[data-testid="nav-link-test-results"]')).click();
await driver.wait(until.urlContains('/patient/labs'), 5000);
await driver.wait(until.elementLocated(By.css('[data-testid="lab-result-row"], [data-testid="error-state"]')), 15000);
```

**ThousandEyes alert recommended:** configure the transaction to alert on any step taking > 12 s or resulting in an error element (`[data-testid="error-state"]`). During the `api` failure window the step fails fast; during `db` failure the step degrades first (response time alert fires), then fails — matching the two-phase signal described in the failure modes table above.

### Transaction test — Provider ePrescribing (CareConnect)

```javascript
import { driver, By, until } from 'thousand-eyes-recorder';

await driver.get('https://careconnect.pseudo-co.com/');
await driver.wait(until.titleContains('CareConnect'), 10000);
await driver.findElement(By.css('input[type="email"]')).sendKeys('provider@demo.com');
await driver.findElement(By.css('input[type="password"]')).sendKeys('Demo123!');
await driver.findElement(By.css('button[type="submit"]')).click();
await driver.wait(until.urlContains('/provider/dashboard'), 10000);
await driver.findElement(By.linkText('ePrescribing')).click();
await driver.wait(until.urlContains('/provider/prescribe'), 5000);
await driver.findElement(By.css('[data-testid="new-rx-button"]')).click();
await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 3000);
```

---

## Splunk Observability Cloud

| Signal | Source | Application | Where to view |
|--------|--------|-------------|---------------|
| APM traces | Node.js + OTel SDK on VM2 | `careconnect-api-gwy` + domain services | Splunk APM → Service Map |
| APM traces | PACS Node.js + OTel SDK on VM5 | `careconnect-pacs` | Splunk APM → Service Map |
| RUM — clinical | Splunk RUM JS in React clinical bundle | `careconnect-clinical` | Splunk RUM → Session Explorer |
| RUM — patient | Splunk RUM JS in React patient bundle | `mychart-patient` | Splunk RUM → Session Explorer |
| RUM — PACS viewer | Splunk RUM JS in Vite PACS viewer bundle | `careconnect-pacs-viewer` | Splunk RUM → Session Explorer |
| Infrastructure | OTel Collector host metrics (VM1–VM3 + VM5) | — | Splunk Infrastructure Monitoring |
| Logs — EHR | Winston JSON → OTel Collector → Splunk Platform HEC | — | Splunk Log Observer |
| Logs — PACS | Winston JSON → `~/logs/careconnect/pacs-*.log` → OTel Collector → HEC | — | Splunk Log Observer |

Filter RUM sessions by portal:
- `app.name = "CareConnect Clinical"` — clinical portal traffic
- `app.name = "MyChart Patient Portal"` — patient portal traffic

### Useful SPL queries

```spl
# ePrescription submissions with Surescripts latency
index=careconnect path="/api/eprescribe" method=POST
| stats avg(duration) as avg_ms, max(duration) as max_ms by statusCode

# Lab orders sent to Quest / LabCorp
index=careconnect message="Sending order to LIS"
| eval latency=latencyMs | stats avg(latency) by vendor

# Notification delivery failures
index=careconnect message="Notification sent" status=failed
| stats count by channel, error_message

# FHIR API usage by resource type
index=careconnect path="/fhir/*"
| rex field=path "/fhir/(?<resource>[^/?]+)"
| stats count by resource, statusCode
```

#### MyChart failure injection — log queries

```spl
# All MyChart failure events across all patient services
index=careconnect (message="MyChart API failure injection" OR message="MyChart DB failure injection")
| table _time, service, failure_type, delay_ms, path
| sort -_time

# Failure event rate by service during the active window
index=careconnect message="MyChart*failure injection"
| timechart span=1m count by service

# DB failure injection — identify slow requests (delay_ms field present for db type only)
index=careconnect message="MyChart DB failure injection"
| stats avg(delay_ms) as avg_delay_ms, max(delay_ms) as max_delay_ms, count by service
```

Use **Splunk APM Trace Analyzer** to correlate: filter on `mychart.failure.type = db` or `mychart.failure.type = api` to isolate injection spans from organic errors, then click any trace to see the full gateway → service span chain.

---

## Endpoint Synthetic Tests (Playwright + ThousandEyes Endpoint Agent)

The `playwright-tests/` directory contains a Playwright test suite that runs on an on-premises Windows machine alongside the ThousandEyes Endpoint Agent Chrome extension. Each scheduled run performs a full browser login flow against CareConnect, MyChart, and PACS, generating real Endpoint Agent telemetry — network path data, waterfall timings, and BGP visibility from the site network to each application.

### Why external Chrome + CDP

The ThousandEyes Endpoint Agent extension suppresses metric reporting when Chrome is launched by an automation tool (it detects Playwright's `--enable-automation` flag and the `navigator.webdriver` property). To avoid this, the script launches Chrome externally as a normal user process, then Playwright attaches to it via the Chrome DevTools Protocol (CDP). Because Playwright never launched Chrome, none of its automation flags are injected.

### Prerequisites

- Windows 10/11 test machine at the target site
- Google Chrome 130+ installed
- ThousandEyes Endpoint Agent installed and authenticated in a Chrome profile
- Node.js 20+ and Git installed
- The machine must have network access to the CareConnect, MyChart, and PACS URLs

### One-time setup

**1. Clone the repository:**

```powershell
git clone <repo-url> C:\Users\<user>\healthcare
cd C:\Users\<user>\healthcare\playwright-tests
npm install
```

**2. Configure `.env`:**

```powershell
copy .env.example .env
notepad .env
```

Edit `.env` with values for this machine:

```ini
# Application URLs
CARECONNECT_URL=https://careconnect.pseudo-co.com
MYCHART_URL=https://mychart.pseudo-co.com
PACS_URL=http://pacs.pseudo-co.com:5174

# Shared demo password
DEMO_PASSWORD=Demo123!

# Chrome profile that has the ThousandEyes extension installed and authenticated.
# Set CHROME_USER_DATA_DIR to the User Data parent directory (NOT the profile folder).
CHROME_USER_DATA_DIR=C:\Users\<user>\AppData\Local\Google\Chrome\User Data
CHROME_PROFILE_DIR=Profile 1
CHROME_DEBUG_PORT=9222
```

To find which profile has the TE extension: open `chrome://version` in Chrome — the **Profile Path** field shows the full path. The folder name (e.g. `Profile 1`, `Default`) is your `CHROME_PROFILE_DIR`; everything up to but not including that folder name is `CHROME_USER_DATA_DIR`.

**3. NTFS junction (created automatically on first run):**

Chrome 130+ blocks the remote debugging port when `--user-data-dir` equals Chrome's own default path (`%LOCALAPPDATA%\Google\Chrome\User Data`). The script detects this and automatically creates an NTFS junction at `C:\TE-Chrome-Profile` pointing to the real profile directory. Chrome receives the non-default junction path and binds the debug port normally. The junction requires no admin rights (`mklink /J`) and is reused on every subsequent run.

### Running tests

```powershell
cd C:\Users\<user>\healthcare\playwright-tests

# Run all three tests
.\scripts\run-tests.ps1

# Run a single suite
.\scripts\run-tests.ps1 -TestFilter "CareConnect"
.\scripts\run-tests.ps1 -TestFilter "MyChart"
.\scripts\run-tests.ps1 -TestFilter "PACS"
```

Each run:
1. Creates the `C:\TE-Chrome-Profile` junction if it doesn't exist
2. Kills any existing Chrome to release the profile singleton lock
3. Patches the profile `Preferences` file to clear any crash-recovery state (prevents the "Restore pages?" dialog from blocking startup)
4. Deletes session files (`Current Session`, `Current Tabs`, etc.) so Chrome opens to `about:blank`
5. Launches Chrome with `--remote-debugging-port=9222` against the junction path
6. Waits for the CDP endpoint to become available (up to 60s)
7. Runs all three Playwright login tests (serial, one worker)
8. Waits 5s for the TE extension to flush pending metrics
9. Closes Chrome gracefully (`CloseMainWindow`) so the profile is saved cleanly — preventing crash-recovery delays on the next run
10. Writes a timestamped log to `playwright-tests/logs/test-run_<timestamp>.log`

Logs older than 30 days are pruned automatically.

### Scheduling with Windows Task Scheduler

To run tests on a schedule (e.g. every 15 minutes):

1. Open **Task Scheduler** → **Create Task**
2. **General** tab:
   - Name: `CareConnect Synthetic Tests`
   - Run whether user is logged on or not: ✓
   - Run with highest privileges: leave unchecked (no admin needed)
3. **Triggers** tab → New → **On a schedule** → Repeat every `15 minutes` indefinitely
4. **Actions** tab → New:
   - Program: `powershell.exe`
   - Arguments: `-NonInteractive -ExecutionPolicy Bypass -File "C:\Users\<user>\healthcare\playwright-tests\scripts\run-tests.ps1"`
   - Start in: `C:\Users\<user>\healthcare\playwright-tests`
5. **Settings** tab:
   - If the task is already running: **Do not start a new instance**
   - Stop the task if it runs longer than: `10 minutes`

Verify the task runs correctly by right-clicking → **Run** and checking the log file in `playwright-tests\logs\`.

### What gets reported to ThousandEyes

When the TE Endpoint Agent extension service worker is active during a test run, ThousandEyes receives:

- **Network path** (traceroute hops) from the site to each application server
- **Page load waterfall** for each navigation (`page.goto(...)`)
- **HTTP timing** — DNS, TCP connect, TLS, TTFB, content transfer per request
- **BGP visibility** — route changes or prefix withdrawals upstream of the site

Sessions appear in the ThousandEyes portal under **Endpoint Agents → Views → Browser Sessions**, filtered by the agent name for this Windows machine.

### Confirming TE is active

The test output includes a diagnostic line before each test:

```
[TE] Extension service worker detected: chrome-extension://ddnennmeinlkhkmajmmfaojcnpddnpgb/...
```

If this shows `WARNING: Extension service worker not detected`, check:
- The TE extension is installed in the Chrome profile named in `CHROME_PROFILE_DIR`
- The extension is authenticated (sign in to `app.thousandeyes.com` in that profile)
- No enterprise Chrome policy is disabling extensions (`chrome://policy` should show no `ExtensionSettings` or `ExtensionInstallBlocklist` entries blocking the TE extension ID `ddnennmeinlkhkmajmmfaojcnpddnpgb`)

### Troubleshooting synthetic tests

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Chrome CDP not ready after 60 seconds` | Debug port not binding | Check `chrome://policy` — if `RemoteDebuggingAllowed` is `0`, IT must set it to `1` via GPO or push `HKLM\SOFTWARE\Policies\Google\Chrome\RemoteDebuggingAllowed=1` |
| `DevTools remote debugging requires a non-default data directory` | `CHROME_USER_DATA_DIR` is Chrome's default path but junction wasn't created | Verify the script ran past the junction step; check `C:\TE-Chrome-Profile` exists and is a junction (`dir C:\` should show `<JUNCTION>` next to it) |
| `[TE] WARNING: Extension service worker not detected` | Extension not in the configured profile | Open `chrome://extensions` in the TE-authenticated profile — confirm extension ID `ddnennmeinlkhkmajmmfaojcnpddnpgb` is present and enabled |
| Test times out at `page.goto` | Application URL unreachable from this machine | Check firewall rules; verify the URL opens manually in Chrome |
| `Worker teardown timeout exceeded` | `context.close()` hanging | Usually resolves after a clean Chrome shutdown; delete `C:\TE-Chrome-Profile\SingletonLock` and re-run |
| `Requested registry access is not allowed` on HKLM | No admin rights | Use HKCU instead: `New-Item -Path "HKCU:\SOFTWARE\Policies\Google\Chrome" -Force; New-ItemProperty -Path "HKCU:\SOFTWARE\Policies\Google\Chrome" -Name "RemoteDebuggingAllowed" -Value 1 -PropertyType DWORD -Force` |
| Chrome shows "Restore pages?" dialog every run | Profile in crash state | Script patches `Preferences` automatically; if it persists, manually open Chrome, dismiss the dialog, and close Chrome gracefully before the next run |
| No sessions appearing in TE portal | TE extension not authenticated | Sign in to `app.thousandeyes.com` in the Chrome profile used by the tests |
| Tests pass but TE shows no metrics | `--enable-automation` flag injected | Should not occur with the external-Chrome approach; verify the script is running (not `npx playwright test` directly) |

---

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| MyChart patient routes return 503 outside the failure window | `MYCHART_FAILURE_ENABLED=true` left set after a demo | Set `MYCHART_FAILURE_ENABLED=` (empty) in `config.env` and run `bash deploy/aws-deploy.sh update api` |
| Failure window fires at the wrong clock time | VM2 system timezone differs from expected | SSH to VM2 and run `timedatectl` — set `MYCHART_FAILURE_HOUR` relative to the VM's local timezone, or `sudo timedatectl set-timezone America/New_York` to align with your demo timezone |
| `/health` endpoint returns 503 during failure window | Custom health-check path being intercepted | Health endpoints are always exempt by design; if a non-`/health` path is in the health check URL, update it to `/health` |
| Failure injection active but no `mychart.failure.*` spans in Splunk APM | Splunk APM not configured (no `SPLUNK_ACCESS_TOKEN`) | Set `SPLUNK_ACCESS_TOKEN` and `SPLUNK_REALM` in `config.env` and re-run `init api`; spans still appear in logs even without APM |
| `bash deploy/aws-deploy.sh init` fails at SSH step | Wrong public IP or key path | Check `*_PUBLIC_IP` and `SSH_KEY` in config.env; verify `ssh ubuntu@<PUBLIC_IP>` works manually |
| `Cannot connect to database` on init api | VM3 not ready or security group blocking | Confirm VM3 init completed; check SG allows VM2 private IP on port 5432 |
| `MOCK_HOST not set` warning | `MOCK_PRIVATE_IP` blank in config.env | Set `MOCK_PRIVATE_IP` and re-run `init api` |
| React SPA loads but `/api/*` returns 502 | Nginx proxy not reaching VM2 | `ssh ubuntu@<VM1> "sudo nginx -t"` — check API_PRIVATE_IPS in nginx config |
| `Login failed` / 401 | DB not seeded or wrong `JWT_SECRET` | Re-run seed on VM2; verify `.env` on VM2 |
| Patient redirected in a loop | `VITE_PATIENT_HOST` not set at build time | Re-run `update frontend` with `PATIENT_HOST` set in config.env |
| Provider sees MyChart on clinical portal | Nginx `server_name` mismatch | Check `/etc/nginx/sites-available/careconnect` on VM1 — confirm `CLINICAL_HOST` and `PATIENT_HOST` match your DNS |
| `patient.html` 404 | React build didn't produce multi-page output | Confirm `vite.config.ts` has `rollupOptions.input` with both entries; re-run `update frontend` |
| `gzip` directive is duplicate in nginx config | Main `nginx.conf` already has `gzip on` in its `http {}` block | Gzip settings must go in `/etc/nginx/conf.d/gzip.conf`, not in the `sites-available` file; `04-update.sh` writes this automatically |
| PM2 processes keep restarting | App crash or bad `.env` | `ssh ubuntu@<API_PUBLIC_IP> "journalctl -u careconnect-api -n 100"` |
| `careconnect-bff` not starting | Missing `API_URL` in BFF `.env` | Re-run `bash deploy/aws-deploy.sh update bff` |
| ePrescription `integration.latencyMs` is 0 | VM4 not reachable from VM2 | Check `SURESCRIPTS_URL` in VM2 `.env`; verify SG allows VM2 → VM4:3002 |
| `DB_HOST` connection refused | `DB_HOST` still set to example value | Set `DB_HOST` to VM3's private IP (or RDS endpoint) in config.env, re-run `init api` |
| API 502 from uw1 web VMs only | VM2 SG blocking cross-region traffic | Add the uw1 VPC CIDR to VM2's security group inbound rule on port 3001 |
| Global Accelerator not routing to uw1 | ALB health check failing | `curl http://<UW1_VM1_IP>/ping` — if that fails, check Nginx on the uw1 VM |
| Both portals resolve to use2 only | GA endpoint group weight misconfigured | Verify uw1 endpoint group weight = 100 in Global Accelerator console |
| `local-deploy.sh` SSH connection refused | `PACS_PUBLIC_IP` wrong or VM5 not running | Verify `PACS_PUBLIC_IP` in config.env; confirm `ssh <PACS_SSH_USER>@<PACS_PUBLIC_IP>` works manually |
| `local-deploy.sh` Permission denied (publickey) | Wrong `PACS_SSH_KEY` for VM5 | Set `PACS_SSH_KEY` in config.env to the correct private key for VM5 |
| PM2 not found on VM5 | Node.js install failed during init | Re-run `bash deploy/local-deploy.sh init server` — `ensure_node` is idempotent |
| PACS server won't start: `Cannot find module` | `npm install` not run | Run `bash deploy/local-deploy.sh init server` or `cd pacs/server && npm install` |
| PACS viewer won't start: `Cannot find module` | `npm install` not run in viewer | Run `bash deploy/local-deploy.sh init viewer` or `cd pacs/viewer && npm install` |
| PACS viewer blank / Cornerstone errors | Missing COOP/COEP headers | Viewer must run through Vite (port 5174) — do not open `index.html` directly; `SharedArrayBuffer` requires cross-origin isolation headers set by Vite config |
| PACS viewer shows "No images available" | DICOM files not downloaded | Run `cd pacs/server && npm run download` then `bash deploy/local-deploy.sh restart server` |
| PACS `/health` returns `studyCount: 0` | Studies directory empty | Download sample files (see Step 5b above) or check `pacs/server/studies/` exists |
| ThousandEyes can't reach PACS | `PACS_PUBLIC_IP` is `127.0.0.1` | Set `PACS_PUBLIC_IP` to VM5's IP address in `config.env`, re-run `bash deploy/local-deploy.sh restart server` |
| PACS latency not clearing after demo | `config.env` not saved | Run `bash deploy/local-deploy.sh latency clear` — this rewrites the `PACS_IMAGE_LATENCY_MS` line in config.env and restarts the server |
| Viewer login returns 401 | Wrong password or PACS server not running | Confirm server is running: `pm2 status careconnect-pacs`; demo password is `Demo123!` for all three accounts (`@careconnect.demo`) |
| `dcmjs` parse errors in server logs | Corrupted or unsupported DICOM file | Delete the problem file from `pacs/server/studies/` and restart — server falls back to seed data gracefully |
