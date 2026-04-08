# CareConnect EHR — Multi-VM Deployment Guide
## AWS EC2 / Azure — Ubuntu 22.04 LTS

---

## Architecture

```
                    ┌──────────────────────────────────────────────────────────────┐
  Internet          │                  AWS VPC / Azure VNet                        │
     │              │                                                              │
     ▼              │         ┌──────────────────────────┐                        │
 ┌───────┐          │         │   Application Load        │                        │
 │ Users │──────────┼────────▶│   Balancer (ALB)          │                        │
 └───────┘  80/443  │         │                           │                        │
                    │         │  /bff/* ──────────────────┼──▶ ┌──────────────┐   │
 ┌───────────┐      │         │  /* ──────────────────────┼──▶ │  VM1         │   │
 │ThousandEye│──────┼────────▶│                           │    │  Frontend    │   │
 │  Agents   │      │         │  /api/* ──────────────────┼──▶ │  (serve :80) │   │
 └───────────┘      │         │  /fhir/* ─────────────────┼──▶ │  BFF  (:3003)│──▶ ┌──────────────┐
                    │         │  /health ─────────────────┼──▶ │              │   │  VM2         │
                    │         └──────────────────────────┘    └──────────────┘   │  API         │──▶ ┌──────────────┐
                    │                                                              │  (Node/PM2)  │   │  VM3         │
                    │                                                              │  port 3001   │   │  Database    │
                    │                                                              └──────┬───────┘   │  (PostgreSQL)│
                    │                                                                     │           └──────────────┘
                    │                                                                     │ port 3002
                    │                                                                     ▼
                    │                                                            ┌──────────────────┐
                    │                                                            │  VM4             │
                    │                                                            │  Mock Services   │
                    │                                                            │  (Node/systemd)  │
                    │                                                            │  port 3002       │
                    └─────────────────────────────────────────────────────────────────────────────────┘
```

**Three-tier APM visibility** — Splunk APM service map shows:
```
browser (RUM) ──▶ careconnect-bff (VM1:3003) ──▶ careconnect-api (VM2:3001) ──▶ postgresql (VM3:5432)
```
Clinical reads (patients, appointments, labs) flow through the BFF. Auth, messages, billing, and FHIR go direct to the API.

**VM roles:**

| VM | Role | Ports | Reachable from |
|----|------|-------|----------------|
| VM1 | Frontend (React, `serve`) + BFF (Node.js proxy) | 80, 3003 | ALB only |
| VM2 | API (Node.js, PM2) | 3001 | ALB + VM1 + VM4 |
| VM3 | Database (PostgreSQL) | 5432 | VM2 only |
| VM4 | Mock External Services | 3002 | VM2 only (+ ThousandEyes agents) |

**ALB path-based routing rules (in priority order):**

| Priority | Condition | Target | Purpose |
|----------|-----------|--------|---------|
| 5 | Path `/bff/*` | VM1:3003 | BFF — three-tier APM hop |
| 10 | Path `/api/*` | VM2:3001 | API (direct) |
| 15 | Path `/fhir/*` | VM2:3001 | FHIR R4 |
| 20 | Path `/health` | VM2:3001 | Health check |
| Default | All other paths | VM1:80 | Frontend SPA |

**Mock Services — what VM4 simulates:**

| Sub-path | Mimics | Default Latency |
|----------|--------|----------------|
| `/surescripts/*` | Surescripts SCRIPT 10.6 ePrescribing | 180ms ±60ms |
| `/quest/*` | Quest Diagnostics LIS (HL7 ORM) | 240ms ±80ms |
| `/labcorp/*` | LabCorp LIS (HL7 ORM) | 310ms ±100ms |
| `/twilio/*` | Twilio SMS REST API | 120ms ±40ms |
| `/sendgrid/*` | SendGrid v3 Email API | 95ms ±30ms |

---

## Prerequisites

- [ ] 4 Ubuntu 22.04 LTS VMs launched (EC2 t3.small or Azure B2s or larger)
- [ ] Hostnames already assigned and resolving
- [ ] SSH access to all 4 VMs (key-based)
- [ ] Application Load Balancer (AWS ALB or Azure Application Gateway) provisioned in the same VPC/VNet
- [ ] Security Groups / NSGs configured (see `firewall-rules.md`)
- [ ] Your local machine has the `healthcare/` codebase

---

## Step 0 — Prepare your configuration

On your **local machine**, copy the example config and fill in your values:

```bash
cd healthcare/deploy
cp config.env.example config.env
nano config.env
```

Fill in your actual hostnames and a strong password:

```bash
# ALB DNS name — this is your public URL
FRONTEND_HOST=careconnect.retaildemo.web

# VM private IPs (used for DB access rules and OTel collector config)
FRONTEND_PRIVATE_IP=10.0.1.10
API_PRIVATE_IP=10.0.1.20
DB_PRIVATE_IP=10.0.1.30
MOCK_PRIVATE_IP=10.0.1.40       # NEW — VM4 private IP

DB_PASSWORD=$(openssl rand -base64 24)
JWT_SECRET=$(openssl rand -hex 32)
```

---

## Step 1 — Set up VM3 (Database)

```bash
source deploy/config.env
ssh cisco@192.168.11.12 "sudo env \
  DB_NAME='$DB_NAME' DB_USER='$DB_USER' \
  DB_PASSWORD='$DB_PASSWORD' API_PRIVATE_IP='$API_PRIVATE_IP' \
  bash -s" < deploy/01-setup-db.sh
```

Expected output:
```
✓ PostgreSQL 17 installed
✓ Database 'careconnect' and user 'careconnect' created
✓ Database VM setup complete!
```

---

## Step 2 — Set up VM2 (API)

```bash
source deploy/config.env

rsync -avz --delete --exclude 'node_modules' --exclude '.env' \
  backend/. cisco@192.168.11.11:~/careconnect-backend/

ssh cisco@192.168.11.11 "sudo env \
  DB_HOST='$DB_PRIVATE_IP' DB_NAME='$DB_NAME' DB_USER='$DB_USER' \
  DB_PASSWORD='$DB_PASSWORD' JWT_SECRET='$JWT_SECRET' \
  FRONTEND_PRIVATE_IP='$FRONTEND_PRIVATE_IP' FRONTEND_HOST='$FRONTEND_HOST' \
  MOCK_HOST='$MOCK_PRIVATE_IP' MOCK_PORT='$MOCK_PORT' \
  SPLUNK_ACCESS_TOKEN='$SPLUNK_ACCESS_TOKEN' SPLUNK_REALM='$SPLUNK_REALM' \
  ANTHROPIC_API_KEY='$ANTHROPIC_API_KEY' \
  BACKEND_SRC='/home/cisco/careconnect-backend' \
  bash -s" < deploy/02-setup-api.sh
```

The setup script now writes these to `/opt/careconnect/api/.env`:
```
SURESCRIPTS_URL=http://<MOCK_HOST>:3002/surescripts
QUEST_LIS_URL=http://<MOCK_HOST>:3002/quest
LABCORP_LIS_URL=http://<MOCK_HOST>:3002/labcorp
TWILIO_API_URL=http://<MOCK_HOST>:3002/twilio
SENDGRID_API_URL=http://<MOCK_HOST>:3002/sendgrid
```

---

## Step 3 — Set up VM1 (Frontend + BFF)

```bash
source deploy/config.env

rsync -avz --delete --exclude 'node_modules' --exclude 'dist' \
  frontend/. cisco@192.168.11.10:~/careconnect-frontend/

rsync -avz --delete --exclude 'node_modules' \
  bff/. cisco@192.168.11.10:~/careconnect-bff/

ssh cisco@192.168.11.10 "sudo env \
  FRONTEND_HOST='$FRONTEND_HOST' \
  SPLUNK_RUM_TOKEN='$SPLUNK_RUM_TOKEN' SPLUNK_REALM='$SPLUNK_REALM' \
  SPLUNK_ACCESS_TOKEN='$SPLUNK_ACCESS_TOKEN' \
  APP_ENV='$APP_ENV' \
  API_PRIVATE_URL='http://$API_PRIVATE_IP:3001' \
  FRONTEND_SRC='/home/cisco/careconnect-frontend' \
  BFF_SRC='/home/cisco/careconnect-bff' \
  bash -s" < deploy/03-setup-frontend.sh
```

---

## Step 4 — Set up VM4 (Mock External Services)  ← NEW

VM4 runs a lightweight Node.js server that simulates the five external SaaS integrations. Each service has its own independently tunable latency and failure rate — no real API accounts needed.

```bash
source deploy/config.env

rsync -avz --delete --exclude 'node_modules' \
  backend/src/mock-services.js cisco@<MOCK_VM_IP>:~/careconnect-backend/src/
rsync -avz backend/package.json cisco@<MOCK_VM_IP>:~/careconnect-backend/

ssh cisco@<MOCK_VM_IP> "sudo env \
  API_PRIVATE_IP='$API_PRIVATE_IP' \
  MOCK_PORT='${MOCK_PORT:-3002}' \
  SURESCRIPTS_LATENCY_MS='${SURESCRIPTS_LATENCY_MS:-180}' \
  SURESCRIPTS_LATENCY_JITTER='${SURESCRIPTS_LATENCY_JITTER:-60}' \
  QUEST_LATENCY_MS='${QUEST_LATENCY_MS:-240}' \
  QUEST_LATENCY_JITTER='${QUEST_LATENCY_JITTER:-80}' \
  LABCORP_LATENCY_MS='${LABCORP_LATENCY_MS:-310}' \
  LABCORP_LATENCY_JITTER='${LABCORP_LATENCY_JITTER:-100}' \
  TWILIO_LATENCY_MS='${TWILIO_LATENCY_MS:-120}' \
  TWILIO_LATENCY_JITTER='${TWILIO_LATENCY_JITTER:-40}' \
  SENDGRID_LATENCY_MS='${SENDGRID_LATENCY_MS:-95}' \
  SENDGRID_LATENCY_JITTER='${SENDGRID_LATENCY_JITTER:-30}' \
  BACKEND_SRC='/home/cisco/careconnect-backend' \
  bash -s" < deploy/06-setup-mock.sh
```

Expected output:
```
✓ Node.js v20.x.x installed
✓ Mock service files deployed to /opt/careconnect/mock
✓ Environment file written
✓ Dependencies installed
✓ careconnect-mock systemd unit configured and started
✓ Firewall configured (port 3002 open to API VM)
✓ Mock service health check passed (HTTP 200)
✓ Mock Services VM setup complete!
```

### Verify VM4

```bash
# Health check — shows all services and their current latency config
curl http://<MOCK_VM_IP>:3002/health

# View current simulation config
curl http://<MOCK_VM_IP>:3002/config

# View last 100 request events across all services
curl http://<MOCK_VM_IP>:3002/log
```

### Adjusting latency live (no restart)

```bash
# Simulate a slow Surescripts network
curl -X PATCH http://<MOCK_VM_IP>:3002/config \
  -H 'Content-Type: application/json' \
  -d '{"surescripts": {"latencyMs": 1800, "jitterMs": 400}}'

# Simulate 50% Twilio failure rate (e.g. carrier outage)
curl -X PATCH http://<MOCK_VM_IP>:3002/config \
  -d '{"twilio": {"failureRate": 0.5}}'

# Simulate Quest LIS timeout (requests hang — client aborts)
curl -X PATCH http://<MOCK_VM_IP>:3002/config \
  -d '{"quest": {"timeoutRate": 0.3}}'

# Reset everything to defaults
curl -X PATCH http://<MOCK_VM_IP>:3002/config \
  -d '{"surescripts":{"latencyMs":180,"jitterMs":60,"failureRate":0,"timeoutRate":0},"quest":{"latencyMs":240,"jitterMs":80,"failureRate":0,"timeoutRate":0},"labcorp":{"latencyMs":310,"jitterMs":100,"failureRate":0,"timeoutRate":0},"twilio":{"latencyMs":120,"jitterMs":40,"failureRate":0,"timeoutRate":0},"sendgrid":{"latencyMs":95,"jitterMs":30,"failureRate":0,"timeoutRate":0}}'
```

You can also use the **Admin → Integrations** page in the CareConnect UI to adjust latency and failure rates with sliders.

---

## Step 5 — Configure the Application Load Balancer

### AWS ALB

1. **Create target groups:**
   - `careconnect-frontend-tg` — HTTP, port 80, health check path `/`
   - `careconnect-bff-tg` — HTTP, port 3003, health check path `/bff/health`
   - `careconnect-api-tg` — HTTP, port 3001, health check path `/health`

   Note: `careconnect-bff-tg` and `careconnect-frontend-tg` both point to VM1 — just different ports.

2. **Create ALB** in your public subnets.

3. **Create listener rules** (HTTP:80):
   - Priority 5:  path `/bff/*`  → `careconnect-bff-tg`  ← three-tier BFF hop
   - Priority 10: path `/api/*`  → `careconnect-api-tg`
   - Priority 15: path `/fhir/*` → `careconnect-api-tg`
   - Priority 20: path `/health` → `careconnect-api-tg`
   - Default: → `careconnect-frontend-tg`

### Azure Application Gateway

1. **URL path map:**
   - `/bff/*` → bff-pool (VM1:3003)
   - `/api/*`, `/fhir/*`, `/health` → api-pool (VM2:3001)
   - default → frontend-pool (VM1:80)

---

## Step 6 — End-to-End Verification

```bash
BASE=http://<ALB-DNS-OR-IP>

# Health check
curl $BASE/health

# Login and get a JWT
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"provider@demo.com","password":"Demo123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# FHIR CapabilityStatement (no auth required)
curl $BASE/fhir/metadata | python3 -m json.tool

# Submit an ePrescription (hits Mock VM4 via Surescripts path)
curl -s -X POST $BASE/api/eprescribe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"<any-patient-uuid>","medicationName":"Metformin HCl","sig":"Take 1 tablet twice daily","quantity":60}' \
  | python3 -m json.tool

# Send a notification (hits Mock VM4 via Twilio + SendGrid paths)
curl -s -X POST $BASE/api/notifications/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"<any-patient-uuid>","type":"general","channel":"both","body":"Your test results are ready."}' \
  | python3 -m json.tool

# Check mock request log on VM4
curl http://<MOCK_VM_IP>:3002/log | python3 -m json.tool
```

---

## Step 7 — ThousandEyes Configuration

### Existing tests (no change needed)

- **HTTP Server — Frontend:** `http://[ALB-DNS]/` → HTTP 200
- **HTTP Server — API Health:** `http://[ALB-DNS]/health` → `"status":"healthy"`
- **Transaction — Patient Login Flow:** see script below

### New tests for integration monitoring  ← NEW

#### HTTP Server — Mock Services Health
Monitors VM4 end-to-end — confirms the mock server is reachable from the API VM.

- **URL:** `http://<MOCK_PRIVATE_IP>:3002/health`
- **Agent:** Enterprise Agent on VM2 (API VM)
- **Interval:** 1 minute
- **Expected content:** `"status":"ok"`

#### HTTP Server — Surescripts ePrescribing
- **URL:** `http://<MOCK_PRIVATE_IP>:3002/surescripts/get`
- **Agent:** Enterprise Agent on VM2
- **Interval:** 1 minute
- **Alert threshold:** Response time > 500ms

#### HTTP Server — Quest LIS
- **URL:** `http://<MOCK_PRIVATE_IP>:3002/quest/get`
- **Agent:** Enterprise Agent on VM2
- **Interval:** 1 minute
- **Alert threshold:** Response time > 600ms

#### HTTP Server — Twilio SMS
- **URL:** `http://<MOCK_PRIVATE_IP>:3002/twilio/get`
- **Agent:** Enterprise Agent on VM2
- **Interval:** 1 minute

#### HTTP Server — SendGrid Email
- **URL:** `http://<MOCK_PRIVATE_IP>:3002/sendgrid/get`
- **Agent:** Enterprise Agent on VM2
- **Interval:** 1 minute

#### API Integration Status
Checks all integrations in one call (uses built-in integration health routes):

- **URL:** `http://[ALB-DNS]/api/eprescribe/integration/status`
  - Requires Bearer token — use a ThousandEyes HTTP test with auth header
- **URL:** `http://[ALB-DNS]/api/notifications/integration/status`
- **URL:** `http://[ALB-DNS]/api/labs/integration/status`

### Transaction Test — Provider ePrescribing Flow

```javascript
// ThousandEyes Transaction Script — ePrescribing
import { driver, By, until } from 'thousand-eyes-recorder';

// Step 1: Login as provider
await driver.get('http://[ALB-DNS]/login');
await driver.findElement(By.css('input[type="email"]')).sendKeys('provider@demo.com');
await driver.findElement(By.css('input[type="password"]')).sendKeys('Demo123!');
await driver.findElement(By.css('button[type="submit"]')).click();
await driver.wait(until.urlContains('/provider/dashboard'), 10000);

// Step 2: Navigate to ePrescribing
await driver.findElement(By.linkText('ePrescribing')).click();
await driver.wait(until.urlContains('/provider/prescribe'), 5000);

// Step 3: Open new prescription modal
await driver.findElement(By.css('[data-testid="new-rx-button"]')).click();
await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 3000);
```

### Transaction Test — Patient Login Flow

```javascript
// ThousandEyes Transaction Script
import { driver, By, until } from 'thousand-eyes-recorder';

await driver.get('http://[ALB-DNS]/');
await driver.wait(until.titleContains('CareConnect'), 10000);

await driver.findElement(By.css('input[type="email"]')).sendKeys('patient@demo.com');
await driver.findElement(By.css('input[type="password"]')).sendKeys('Demo123!');
await driver.findElement(By.css('button[type="submit"]')).click();
await driver.wait(until.urlContains('/patient/dashboard'), 10000);

await driver.findElement(By.css('[data-testid="nav-link-appointments"]')).click();
await driver.wait(until.urlContains('/patient/appointments'), 5000);

await driver.findElement(By.css('[data-testid="nav-link-test-results"]')).click();
await driver.wait(until.urlContains('/patient/labs'), 5000);

await driver.findElement(By.css('[data-testid="nav-link-notifications"]')).click();
await driver.wait(until.urlContains('/patient/notifications'), 5000);
```

### BFF health test (three-tier visibility)

Monitors the BFF tier independently — confirms VM1 BFF is healthy and can reach VM2 API.

- **URL:** `http://[ALB-DNS]/bff/health`
- **Agent:** Cloud agent (simulates external user hitting BFF tier)
- **Interval:** 1 minute
- **Expected content:** `"status":"healthy"`

To monitor the internal VM1 → VM2 hop:
- **URL:** `http://<FRONTEND_PRIVATE_IP>:3003/bff/health`
- **Agent:** Enterprise Agent on VM2 (tests reachability from API tier back to BFF tier)
- **Interval:** 2 minutes

### Network Tests

- **Client → ALB:** HTTP test to `[ALB-DNS]:80`
- **VM1 → VM2 (BFF → API):** Network test from VM1 Enterprise Agent to `[API_PRIVATE_IP]:3001`
- **VM2 → VM3 (DB):** Network test from VM2 Enterprise Agent to `[DB_HOST]:5432`
- **VM2 → VM4 (Mock):** Network test from VM2 Enterprise Agent to `[MOCK_HOST]:3002`

### Agent Install

```bash
# Run on VM2 and VM4 for internal path visibility
curl -Os https://downloads.thousandeyes.com/agent/install_thousandeyes.sh
sudo bash install_thousandeyes.sh -b [ACCOUNT_TOKEN]
```

---

## Step 8 — Splunk Observability Cloud

CareConnect ships full Splunk O11y Cloud instrumentation out-of-the-box:

| Signal | What | Where |
|--------|------|-------|
| **APM traces** | Node.js request traces incl. integration calls | Splunk APM → Service Map |
| **RUM** | Browser sessions, Web Vitals, JS errors | Splunk RUM → Session Explorer |
| **Infrastructure** | CPU, memory, disk, network (all 4 VMs) | Splunk Infrastructure Monitoring |
| **Logs** | Structured JSON logs with `x-request-id` correlation | Splunk Log Observer |

### New Splunk searches for integration monitoring

```spl
# All ePrescription submissions with Surescripts latency
index=careconnect path="/api/eprescribe" method=POST
| stats avg(duration) as avg_ms, max(duration) as max_ms by statusCode

# Lab orders sent to Quest/LabCorp
index=careconnect message="Sending order to LIS"
| eval latency=latencyMs | stats avg(latency) by vendor

# Notification delivery failures (Twilio or SendGrid)
index=careconnect message="Notification sent" status=failed
| stats count by channel, error_message

# Integration latency over time (all services)
index=careconnect (message="Surescripts" OR message="LIS" OR message="Twilio" OR message="SendGrid")
| timechart avg(latencyMs) by service

# FHIR API usage by resource type
index=careconnect path="/fhir/*"
| rex field=path "/fhir/(?<resource>[^/?]+)"
| stats count by resource, statusCode
```

### OTel Collector setup

Run `05-setup-otel-collector.sh` on each VM (see Step 6 of original guide).
VM4 (mock) can share the same OTel config as VM2 — run with role `api` on VM4.

---

## Ongoing Operations

### Update the application

```bash
# Deploy everything at once
bash deploy/deploy.sh all

# Or individually
bash deploy/deploy.sh api        # Backend changes → VM2
bash deploy/deploy.sh frontend   # Frontend changes → VM1
bash deploy/deploy.sh mock       # mock-services.js changes → VM4
```

### Adjust mock service latency during a demo

**Via curl (from any machine with VM4 access):**
```bash
# Slow down Surescripts to simulate network congestion
curl -X PATCH http://<MOCK_VM_IP>:3002/config \
  -H 'Content-Type: application/json' \
  -d '{"surescripts": {"latencyMs": 2000, "failureRate": 0.3}}'

# Restore defaults
curl -X PATCH http://<MOCK_VM_IP>:3002/config \
  -d '{"surescripts": {"latencyMs": 180, "failureRate": 0}}'
```

**Via Admin UI (no terminal needed):**
Navigate to **Admin → Integrations** → **Mock Simulation Controls** table.
Use sliders to adjust latency, jitter, failure rate, and timeout rate per service.
Preset buttons: "Simulate Surescripts Outage", "Slow Quest Network", "Twilio SMS Degraded", "Reset All".

### Check service health

```bash
# VM2 — API
sudo -u careconnect pm2 status
sudo -u careconnect pm2 logs --lines 50
sudo systemctl status careconnect-api

# VM1 — Frontend
systemctl status careconnect-frontend

# VM3 — PostgreSQL
sudo systemctl status postgresql
sudo -u postgres psql -d careconnect -c "SELECT count(*) FROM patients;"

# VM4 — Mock Services
systemctl status careconnect-mock
curl http://localhost:3002/health
curl http://localhost:3002/log | python3 -m json.tool
```

### Re-seed the database

```bash
ssh cisco@<VM2-IP>
cd /opt/careconnect/api
sudo -u careconnect node src/db/seed.js
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| ALB shows target unhealthy (VM1) | `serve` not running or wrong port | `systemctl status careconnect-frontend` |
| ALB shows target unhealthy (VM2) | API not running or `/health` non-200 | `sudo -u careconnect pm2 status`; check DB connection |
| `502 Bad Gateway` from ALB | Target VM not running | Check target group health in AWS/Azure console |
| React SPA loads but API calls fail | ALB path rule missing | Confirm `/api/*` and `/fhir/*` rules point to API TG |
| `Login failed` / 401 | DB not seeded or wrong JWT secret | Re-run seed on VM2; verify `.env` |
| `Cannot connect to database` | DB firewall blocking | Verify VM2 IP in `pg_hba.conf` and DB NSG/SG |
| ePrescription `integration.latencyMs` is 0 | Mock VM not reachable from VM2 | Check `SURESCRIPTS_URL` in VM2 `.env`; check VM4 firewall |
| Mock service returns 503 | `failureRate` is set > 0 | `curl -X PATCH http://<MOCK_VM_IP>:3002/config -d '{"surescripts":{"failureRate":0}}'` |
| Mock service hangs indefinitely | `timeoutRate` is set > 0 | Patch config to reset `timeoutRate` to 0 |
| PM2 service keeps restarting | App crash | `sudo -u careconnect pm2 logs` |
| `careconnect-mock` not starting | Node version < 20 or missing deps | `node --version`; `cd /opt/careconnect/mock && npm install` |
| FHIR `/fhir/metadata` returns 404 | `/fhir/*` ALB rule missing | Add priority 15 rule for `/fhir/*` → API target group |
