# CareConnect EHR — AWS Deployment Guide
## Ubuntu 22.04 LTS · Four-VM Architecture · Dual-Portal · Multi-Region Web Tier

---

## Architecture

**Web-only multi-region:** VM1 (Nginx + BFF + React) runs in both us-east-2 and us-west-1. VM2 (API), VM3 (DB), and VM4 (Mock) stay in us-east-2. AWS Global Accelerator routes each user to the nearest healthy web region; both regions proxy API calls to the same internal ALB in us-east-2.

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

```bash
# 1. Fill in your config
cp deploy/config.env.example deploy/config.env
vi deploy/config.env

# 2. Provision all four VMs in the correct order (~10 min)
bash deploy/aws-deploy.sh init all

# 3. Verify everything is healthy
bash deploy/aws-deploy.sh status
```

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

## Step 6 — Splunk OTel Collectors (optional)

```bash
bash deploy/aws-deploy.sh init otel
```

Requires `SPLUNK_ACCESS_TOKEN`, `SPLUNK_REALM`, `SPLUNK_PLATFORM_HEC_URL`, and `SPLUNK_PLATFORM_HEC_TOKEN` set in `config.env`.

| VM | Collector role | Collects |
|----|---------------|----------|
| VM1 | `frontend` | Host metrics, Nginx logs, BFF Node.js traces |
| VM2 | `api` | Host metrics, PM2 app logs, Node.js APM traces |
| VM3 | `db` | Host metrics, PostgreSQL metrics, DB logs |

---

## Ongoing Operations

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
| RUM — clinical | Splunk RUM JS in React clinical bundle | `careconnect-clinical` | Splunk RUM → Session Explorer |
| RUM — patient | Splunk RUM JS in React patient bundle | `mychart-patient` | Splunk RUM → Session Explorer |
| Infrastructure | OTel Collector host metrics (all VMs) | — | Splunk Infrastructure Monitoring |
| Logs | Winston JSON → OTel Collector → Splunk Platform HEC | — | Splunk Log Observer |

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

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `aws-deploy.sh init` fails at SSH step | Wrong public IP or key path | Check `*_PUBLIC_IP` and `SSH_KEY` in config.env; verify `ssh ubuntu@<PUBLIC_IP>` works manually |
| `Cannot connect to database` on init api | VM3 not ready or security group blocking | Confirm VM3 init completed; check SG allows VM2 private IP on port 5432 |
| `MOCK_HOST not set` warning | `MOCK_PRIVATE_IP` blank in config.env | Set `MOCK_PRIVATE_IP` and re-run `init api` |
| React SPA loads but `/api/*` returns 502 | Nginx proxy not reaching VM2 | `ssh ubuntu@<VM1> "sudo nginx -t"` — check API_PRIVATE_IPS in nginx config |
| `Login failed` / 401 | DB not seeded or wrong `JWT_SECRET` | Re-run seed on VM2; verify `.env` on VM2 |
| Patient redirected in a loop | `VITE_PATIENT_HOST` not set at build time | Re-run `update frontend` with `PATIENT_HOST` set in config.env |
| Provider sees MyChart on clinical portal | Nginx `server_name` mismatch | Check `/etc/nginx/sites-available/careconnect` on VM1 — confirm `CLINICAL_HOST` and `PATIENT_HOST` match your DNS |
| `patient.html` 404 | React build didn't produce multi-page output | Confirm `vite.config.ts` has `rollupOptions.input` with both entries; re-run `update frontend` |
| PM2 processes keep restarting | App crash or bad `.env` | `ssh ubuntu@<API_PUBLIC_IP> "journalctl -u careconnect-api -n 100"` |
| `careconnect-bff` not starting | Missing `API_URL` in BFF `.env` | Re-run `bash deploy/aws-deploy.sh update bff` |
| ePrescription `integration.latencyMs` is 0 | VM4 not reachable from VM2 | Check `SURESCRIPTS_URL` in VM2 `.env`; verify SG allows VM2 → VM4:3002 |
| `DB_HOST` connection refused | `DB_HOST` still set to example value | Set `DB_HOST` to VM3's private IP (or RDS endpoint) in config.env, re-run `init api` |
| API 502 from uw1 web VMs only | VM2 SG blocking cross-region traffic | Add the uw1 VPC CIDR to VM2's security group inbound rule on port 3001 |
| Global Accelerator not routing to uw1 | ALB health check failing | `curl http://<UW1_VM1_IP>/ping` — if that fails, check Nginx on the uw1 VM |
| Both portals resolve to use2 only | GA endpoint group weight misconfigured | Verify uw1 endpoint group weight = 100 in Global Accelerator console |
