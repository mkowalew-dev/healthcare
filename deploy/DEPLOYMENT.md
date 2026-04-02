# CareConnect EHR — Multi-VM Deployment Guide
## AWS EC2 / Azure — Ubuntu 22.04 LTS

---

## Architecture

```
                    ┌──────────────────────────────────────────────────┐
  Internet          │              AWS VPC / Azure VNet                 │
     │              │                                                   │
     ▼              │         ┌─────────────────────────┐              │
 ┌───────┐          │         │   Application Load       │              │
 │ Users │──────────┼────────▶│   Balancer (ALB)         │              │
 └───────┘  80/443  │         │                          │              │
                    │         │  /* ──────────────────────┼──▶ ┌──────────────┐
 ┌───────────┐      │         │  /api/* ──────────────────┼──▶ │  VM2         │
 │ThousandEye│──────┼────────▶│  /health ─────────────────┼──▶ │  API         │ port 5432
 │  Agents   │      │         │                          │    │  (Node/PM2)  │────────────▶ ┌──────────────┐
 └───────────┘      │         └─────────────────────────┘    └──────────────┘              │  VM3         │
                    │                  │                                                    │  Database    │
                    │                  ▼                                                    │  (PostgreSQL)│
                    │         ┌──────────────┐                                             └──────────────┘
                    │         │  VM1         │
                    │         │  Frontend    │
                    │         │  (serve)     │
                    │         └──────────────┘
                    │
                    │  VM1 Frontend: port 80 — ALB only (no public exposure)
                    │  VM2 API:      port 3001 — ALB only (no public exposure)
                    │  VM3 Database: port 5432 — VM2 only
                    └──────────────────────────────────────────────────┘
```

**ALB path-based routing rules (in priority order):**

| Priority | Condition | Target |
|----------|-----------|--------|
| 10 | Path `/api/*` | VM2:3001 |
| 20 | Path `/health` | VM2:3001 |
| Default | All other paths | VM1:80 |

---

## Prerequisites

- [ ] 3 Ubuntu 22.04 LTS VMs launched (EC2 t3.small or Azure B2s or larger)
- [ ] Hostnames already assigned and resolving
- [ ] SSH access to all 3 VMs (key-based)
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
FRONTEND_HOST=careconnect-alb-123456.us-east-1.elb.amazonaws.com   # AWS ALB DNS
# or for Azure:
# FRONTEND_HOST=careconnect-appgw-pip.eastus.cloudapp.azure.com

# VM private IPs (used for DB access rules and OTel collector config)
FRONTEND_PRIVATE_IP=10.0.1.10
API_PRIVATE_IP=10.0.1.20
DB_PRIVATE_IP=10.0.1.30

DB_PASSWORD=$(openssl rand -base64 24)    # run this to generate
JWT_SECRET=$(openssl rand -hex 32)        # run this to generate
```

**Generate secrets on your local machine:**
```bash
echo "DB_PASSWORD: $(openssl rand -base64 24)"
echo "JWT_SECRET:  $(openssl rand -hex 32)"
```

---

## Step 1 — Set up VM3 (Database)

### 1a. Copy the deploy script to VM3

```bash
# From your local machine
scp -r healthcare/deploy ubuntu@<VM3-IP>:~/deploy
```

### 1b. Edit the script with your values

```bash
ssh ubuntu@<VM3-IP>
nano ~/deploy/01-setup-db.sh
```

Update the CONFIGURATION section at the top:
```bash
DB_NAME="careconnect"
DB_USER="careconnect"
DB_PASSWORD="your-strong-password-here"
API_PRIVATE_IP="10.0.1.20"    # VM2's private IP
```

### 1c. Run the setup script

```bash
sudo bash ~/deploy/01-setup-db.sh
```

Expected output:
```
→ Starting CareConnect database VM setup...
✓ System updated
✓ PostgreSQL 15 installed
✓ PostgreSQL service started
✓ Database 'careconnect' and user 'careconnect' created
✓ PostgreSQL network configuration complete
✓ PostgreSQL restarted
✓ Firewall configured (UFW)
✓ Database connection verified
✓ Database VM setup complete!
```

### 1d. Verify PostgreSQL is running

```bash
sudo systemctl status postgresql
sudo -u postgres psql -c "\l"    # should show careconnect database
```

---

## Step 2 — Set up VM2 (API)

### 2a. Copy the codebase and deploy scripts to VM2

```bash
# From your local machine
scp -r healthcare ubuntu@<VM2-IP>:~/careconnect
```

### 2b. Edit the script with your values

```bash
ssh ubuntu@<VM2-IP>
nano ~/careconnect/deploy/02-setup-api.sh
```

Update the CONFIGURATION section:
```bash
DB_HOST="10.0.1.30"            # VM3 private IP or hostname
DB_NAME="careconnect"
DB_USER="careconnect"
DB_PASSWORD="your-strong-password-here"    # Must match Step 1
JWT_SECRET="your-jwt-secret-here"
FRONTEND_PRIVATE_IP="10.0.1.10"           # VM1 private IP
```

### 2c. Run the setup script

```bash
cd ~/careconnect/deploy
sudo bash 02-setup-api.sh
```

Expected output:
```
✓ Node.js v20.x.x installed
✓ PM2 x.x.x installed
✓ Application files deployed to /opt/careconnect/api
✓ Environment file written
✓ Dependencies installed
✓ Database connection successful
✓ Database seeded successfully
✓ PM2 service configured and started
✓ Firewall configured
✓ API health check passed (HTTP 200)
✓ API VM setup complete!
```

### 2d. Verify the API

```bash
# Check PM2 status
sudo -u careconnect pm2 status

# Test the health endpoint
curl http://localhost:3001/health

# Check logs
sudo tail -f /var/log/careconnect/api-out.log
```

Expected health response:
```json
{
  "status": "healthy",
  "service": "careconnect-api",
  "database": "connected",
  "uptime": 12.3
}
```

---

## Step 3 — Set up VM1 (Frontend)

VM1 serves the static React build using `serve` (a lightweight static file server).
There is no Nginx and no reverse proxy on this VM — the ALB handles all routing.

### 3a. Copy the codebase and deploy scripts to VM1

```bash
# From your local machine
scp -r healthcare ubuntu@<VM1-IP>:~/careconnect
```

### 3b. Edit the script with your values

```bash
ssh ubuntu@<VM1-IP>
nano ~/careconnect/deploy/03-setup-frontend.sh
```

Update the CONFIGURATION section:
```bash
FRONTEND_HOST="careconnect-alb-123456.us-east-1.elb.amazonaws.com"  # For display only

# Bakes Splunk RUM into the React bundle at build time
SPLUNK_RUM_TOKEN="your-rum-token-here"
SPLUNK_REALM="us1"
APP_ENV="production"
```

Note: `API_HOST` is not needed here. The React app makes relative `/api/*` calls; the ALB routes them to VM2.

### 3c. Run the setup script

```bash
cd ~/careconnect/deploy
sudo bash 03-setup-frontend.sh
```

This takes ~2-3 minutes (npm install + React build). Expected output:
```
✓ System packages updated
✓ Node.js v20.x.x installed
✓ React build complete
✓ Files deployed to /var/www/careconnect
✓ careconnect-frontend service running on port 80
✓ Firewall configured (22, 80 open)
✓ Frontend serving (HTTP 200)
✓ Frontend VM setup complete!
```

### 3d. Verify the frontend VM

```bash
# On VM1 — direct to serve (bypasses ALB)
curl http://localhost/      # Should return HTML

# Check service
systemctl status careconnect-frontend
journalctl -u careconnect-frontend -n 20
```

---

## Step 4 — Configure the Application Load Balancer

See `firewall-rules.md` for the full CLI commands. Summary of what to configure:

### AWS ALB

1. **Create two target groups:**
   - `careconnect-frontend-tg` — HTTP, port 80, health check path `/`
   - `careconnect-api-tg` — HTTP, port 3001, health check path `/health`

2. **Register targets:**
   - Frontend TG ← VM1 instance
   - API TG ← VM2 instance

3. **Create ALB** in your public subnets with the ALB security group.

4. **Create listener rules** (HTTP:80):
   - Priority 10: path `/api/*` → `careconnect-api-tg`
   - Priority 20: path `/health` → `careconnect-api-tg`
   - Default: → `careconnect-frontend-tg`

### Azure Application Gateway

1. **Create two backend pools:** `frontend-pool` (VM1 IP) and `api-pool` (VM2 IP)
2. **Create HTTP settings:** port 80 for frontend, port 3001 for API
3. **Create URL path map:** `/api/*` and `/health` → api-pool; default → frontend-pool
4. **Associate path map** with the listener

See `firewall-rules.md` for complete `az` CLI commands.

---

## Step 5 — End-to-End Verification

Open a browser and navigate to **http://[ALB-DNS-OR-IP]**

You should see the CareConnect login page. Test all three roles:

| Role | Email | Password | Expected redirect |
|------|-------|----------|-------------------|
| Patient | patient@demo.com | Demo123! | `/patient/dashboard` |
| Provider | provider@demo.com | Demo123! | `/provider/dashboard` |
| Admin | admin@demo.com | Demo123! | `/admin/dashboard` |

**Quick API tests (from any machine):**
```bash
BASE=http://<ALB-DNS-OR-IP>

# Health check
curl $BASE/health

# Login
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"patient@demo.com","password":"Demo123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Get appointments (authenticated)
curl -s $BASE/api/appointments \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

## Step 6 — ThousandEyes Configuration

Configure the following tests in ThousandEyes to monitor the stack end-to-end.
Use the ALB DNS name as the target — this tests the full path through the load balancer.

### HTTP Server Test — Frontend
- **URL:** `http://[ALB-DNS]/`
- **Interval:** 1 minute
- **Checks:** HTTP 200, response contains `CareConnect`

### HTTP Server Test — API Health (via ALB)
- **URL:** `http://[ALB-DNS]/health`
- **Interval:** 1 minute
- **Expected content:** `"status":"healthy"`
- This test validates the full path: ALB → VM2:3001 → PostgreSQL

### Transaction Test — Patient Login Flow
Use the ThousandEyes Transaction Recorder or create a script:

```javascript
// ThousandEyes Transaction Script
import { driver, By, Key, until } from 'thousand-eyes-recorder';

// Step 1: Load login page
await driver.get('http://[ALB-DNS]/');
await driver.wait(until.titleContains('CareConnect'), 10000);

// Step 2: Login as patient
await driver.findElement(By.css('input[type="email"]')).sendKeys('patient@demo.com');
await driver.findElement(By.css('input[type="password"]')).sendKeys('Demo123!');
await driver.findElement(By.css('button[type="submit"]')).click();

// Step 3: Dashboard loads
await driver.wait(until.urlContains('/patient/dashboard'), 10000);

// Step 4: Navigate to Appointments
await driver.findElement(By.linkText('Appointments')).click();
await driver.wait(until.urlContains('/patient/appointments'), 5000);

// Step 5: Navigate to Lab Results
await driver.findElement(By.linkText('Test Results')).click();
await driver.wait(until.urlContains('/patient/labs'), 5000);

// Step 6: Navigate to Billing
await driver.findElement(By.linkText('Billing')).click();
await driver.wait(until.urlContains('/patient/billing'), 5000);
```

### Network Tests
- **Client → ALB:** HTTP test to `[ALB-DNS]:80` — measures internet-to-ALB latency
- **API → Database:** Network test from VM2 to `[DB_HOST]:5432` — measures DB tier latency
- Install ThousandEyes Enterprise Agent on VM2 and VM3 for internal path visibility

### Agent Install (on each VM)
```bash
# Run on each VM to install ThousandEyes Enterprise Agent
curl -Os https://downloads.thousandeyes.com/agent/install_thousandeyes.sh
sudo bash install_thousandeyes.sh -b [ACCOUNT_TOKEN]
```

---

## Step 7 — Splunk Observability Cloud

CareConnect ships full Splunk O11y Cloud instrumentation out-of-the-box:

| Signal | What | Where it appears |
|--------|------|-----------------|
| **APM traces** | Node.js request traces via `@splunk/otel` | Splunk APM → Service Map |
| **RUM** | Browser sessions, Web Vitals, JS errors | Splunk RUM → Session Explorer |
| **Infrastructure Metrics** | CPU, memory, disk, network (all 3 VMs) | Splunk Infrastructure Monitoring |
| **PostgreSQL metrics** | Connections, cache hit rate, transactions | Infrastructure → PostgreSQL |
| **Logs** | Nginx JSON logs + Node.js Winston logs | Splunk Log Observer |
| **Log-trace correlation** | `trace_id` / `span_id` in every log line | Click log → jump to trace |

### 6a. Get your Splunk O11y access tokens

In **Splunk Observability Cloud → Settings → Access Tokens**, create:
- **Ingest token** (type: `INGEST`) — used by the OTel Collector and APM
- **RUM token** (type: `RUM`) — used by the browser SDK

### 6b. Update `03-setup-frontend.sh` for RUM

Before re-running Step 3 (or deploying an update), set:
```bash
SPLUNK_RUM_TOKEN="your-rum-token-here"
SPLUNK_REALM="us1"   # match your O11y Cloud realm
APP_ENV="production"
```

The RUM SDK (`@splunk/otel-web`) is baked into the React bundle at build time with those values.

### 6c. Install the Splunk OTel Collector on each VM

Copy the `deploy/` directory to each VM (it should already be there from Steps 1–3), then run `05-setup-otel-collector.sh` with the appropriate role.

**First, edit the CONFIGURATION section** at the top of `05-setup-otel-collector.sh`:
```bash
SPLUNK_ACCESS_TOKEN="your-ingest-token-here"
SPLUNK_REALM="us1"
APP_ENV="production"
DB_PASSWORD="your-db-password-here"   # only used on VM3
```

**On VM1 (Frontend):**
```bash
sudo bash ~/careconnect/deploy/05-setup-otel-collector.sh frontend
```

**On VM2 (API):**
```bash
sudo bash ~/careconnect/deploy/05-setup-otel-collector.sh api
```
This also updates `/opt/careconnect/api/.env` with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317` and reloads PM2 so Node.js traces flow through the local collector.

**On VM3 (Database):**
```bash
sudo bash ~/careconnect/deploy/05-setup-otel-collector.sh db
```

### 6d. Verify collector health

On each VM:
```bash
systemctl status splunk-otel-collector
curl http://localhost:13133/      # health check — should return 200

# API VM only: zPages debug UI
curl http://localhost:55679/debug/tracez
```

### 6e. Verify data flowing in Splunk O11y

- **APM:** Splunk APM → Service Map — look for `careconnect-api` service
- **RUM:** Splunk RUM → select application `careconnect-ehr`
- **Infrastructure:** Splunk Infrastructure Monitoring → filter `deployment.environment:production`
- **Logs:** Log Observer → `index=careconnect`

### 6f. Useful Splunk searches (Log Observer / SPL)

```spl
# All API requests with latency > 500ms
index=careconnect sourcetype="careconnect:json" duration>500

# Failed logins
index=careconnect sourcetype="careconnect:json" path="/api/auth/login" statusCode=401

# Payment transactions
index=careconnect sourcetype="careconnect:json" path="/api/bills/*/pay"

# Error rate by path
index=careconnect sourcetype="careconnect:json" statusCode>=500
| stats count by path | sort -count

# Log-to-trace correlation — find all logs for a specific trace
index=careconnect trace_id="<paste-trace-id-from-APM>"

# PostgreSQL slow queries (from DB VM)
index=careconnect sourcetype="postgresql:log" level=ERROR OR duration_ms>1000
```

### 6g. Tail-based trace sampling (API VM)

The OTel Collector on VM2 uses tail-based sampling:
- **100%** of traces containing errors
- **100%** of traces with latency > 500ms
- **20%** probabilistic sample of all other traces

Adjust thresholds in `deploy/configs/otel-collector-api.yaml` under `tail_sampling.policies`.

---

## Ongoing Operations

### Update the application (zero-downtime)

```bash
# Push new backend code to VM2
scp -r healthcare/backend ubuntu@<VM2-IP>:~/careconnect/

# On VM2 — rolling reload via PM2
cd ~/careconnect/deploy
sudo bash 04-update.sh api

# Push new frontend code to VM1
scp -r healthcare/frontend ubuntu@<VM1-IP>:~/careconnect/

# On VM1 — rebuild and restart serve
sudo bash 04-update.sh frontend
```

### Check service health

```bash
# VM2 — API
sudo -u careconnect pm2 status
sudo -u careconnect pm2 logs --lines 50
sudo systemctl status careconnect-api

# VM1 — Frontend (serve)
sudo systemctl status careconnect-frontend
journalctl -u careconnect-frontend -n 50

# VM3 — PostgreSQL
sudo systemctl status postgresql
sudo -u postgres psql -d careconnect -c "SELECT count(*) FROM patients;"

# ALB health checks — confirm both target groups show healthy
# AWS: aws elbv2 describe-target-health --target-group-arn <ARN>
# Azure: az network application-gateway show-backend-health --resource-group careconnect-rg --name careconnect-appgw
```

### Re-seed the database

```bash
# SSH to VM2
ssh ubuntu@<VM2-IP>
cd /opt/careconnect/api
sudo -u careconnect node src/db/seed.js
```

### View real-time API logs

```bash
# PM2 live logs
sudo -u careconnect pm2 logs careconnect-api --lines 100

# Or via systemd journal
sudo journalctl -u careconnect-api -f
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| ALB shows target unhealthy (VM1) | `serve` not running or wrong port | `systemctl status careconnect-frontend`; check port is 80 |
| ALB shows target unhealthy (VM2) | API not running or `/health` returning non-200 | `sudo -u careconnect pm2 status`; check DB connection |
| `502 Bad Gateway` from ALB | Target VM not running | Check target group health in AWS console or `az network application-gateway show-backend-health` |
| React SPA loads but API calls fail (404/502) | ALB path rule missing or wrong | Confirm `/api/*` rule points to API target group at port 3001 |
| `Login failed` / 401 error | DB not seeded or wrong JWT secret | Re-run seed on VM2; verify `.env` JWT_SECRET matches |
| `Cannot connect to database` | DB firewall blocking | Verify VM2 private IP is in `pg_hba.conf` and DB NSG/SG |
| API health returns unhealthy | DB connection failed | Check `DATABASE_URL` in `/opt/careconnect/api/.env` |
| PM2 service keeps restarting | App crash | `sudo -u careconnect pm2 logs` to see error |
| Port 3001 connection refused | PM2 not running | `sudo systemctl start careconnect-api` |
| Frontend VM can't reach ALB | Not needed — traffic flows inbound only | VM1 never initiates connections to the ALB |
