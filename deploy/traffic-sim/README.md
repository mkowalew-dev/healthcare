# Cross-Region Replication Traffic Simulation

Generates sustained 20-minute traffic bursts from **uw1-web02** (us-west-1) to **api02** (us-east-2) across the Transit Gateway on port 873 (rsync — IANA well-known replication port). Scheduled at a random time during business hours (08:00–17:00 CDT) every Monday and Wednesday.

**Deploy:** `bash deploy/healthcare-deploy.sh traffic-sim`

## Architecture

```
uw1-web02 (172.31.0.10, us-west-1)    api02 (10.0.1.231, us-east-2)
┌──────────────────────┐              ┌──────────────────────┐
│  cron (Mon/Wed 8am)  │              │  nginx :873          │
│    → random sleep    │──curl loop──▶│  /replication.bin    │
│    → 20-min burst    │  20 minutes  │  (128 MB payload)    │
│  replication-traffic │              │  replication-server  │
│  .service            │              │  .service            │
└──────────────────────┘              └──────────────────────┘
           │                                    │
           └──────── Transit Gateway ───────────┘
                    (cross-region uw1 → use2)
```

**Port:** 873 (rsync / replication — IANA well-known service port)

**Server node:** api02 — `10.0.1.231` (second entry in `API_PRIVATE_IPS`), SSH via `3.16.152.147`
**Client node:** uw1-web02 — `172.31.0.10` (second entry in `FRONTEND_PRIVATE_IPS_UW1`), SSH via `13.57.253.142`

## Configuration

All settings live in `deploy/config.env` under the `TRAFFIC_SIM_*` block:

| Variable | Default | Description |
|----------|---------|-------------|
| `TRAFFIC_SIM_ENABLED` | `true` | Set to `false` to install service without activating cron |
| `TRAFFIC_SIM_SERVER_HOST` | `10.0.1.231` | api02 private IP (second entry in `API_PRIVATE_IPS`) |
| `TRAFFIC_SIM_PORT` | `873` | Port to serve/fetch on (873 = rsync/replication) |
| `TRAFFIC_SIM_PAYLOAD_SIZE_MB` | `512` | Size of generated payload file |
| `TRAFFIC_SIM_DURATION_SECONDS` | `1200` | Length of each traffic burst (20 min) |
| `TRAFFIC_SIM_SCHEDULE_DAYS` | `1,3` | cron day field — 1=Mon, 3=Wed |
| `TRAFFIC_SIM_START_HOUR_UTC` | `13` | cron hour (UTC) — 13:00 UTC = 08:00 CDT |
| `TRAFFIC_SIM_RANDOM_WINDOW_S` | `31200` | Max random delay before burst (8h 40m → latest end 17:00 CDT) |

## Setup

### 1. Server — api02 (us-east-2, `3.16.152.147`)

```bash
ssh -i ~/.ssh/aws-key ubuntu@3.16.152.147
sudo bash deploy/traffic-sim/server-setup.sh
```

Installs:
- `/opt/replication-server/data/replication.bin` — pre-generated random payload
- `/etc/nginx/sites-available/replication-server.conf` — nginx block on `TRAFFIC_SIM_PORT`
- `replication-server.service` — systemd unit that reloads nginx

Verify: `curl -o /dev/null -w "%{size_download} bytes\n" http://10.0.1.231:873/replication.bin`

### 2. Client — uw1-web02 (`13.57.253.142`)

```bash
ssh -i ~/.ssh/aws-key ubuntu@13.57.253.142
sudo bash deploy/traffic-sim/client-setup.sh
```

Installs:
- `/opt/replication-client/run-traffic.sh` — curl loop script
- `/etc/replication-client.conf` — env vars written from config.env (port, host, duration)
- `replication-traffic.service` — systemd oneshot unit
- `/etc/cron.d/replication-traffic` — Mon/Wed trigger (omitted if `TRAFFIC_SIM_ENABLED=false`)

### Manual test run (no delay)

```bash
sudo systemctl start replication-traffic.service
journalctl -u replication-traffic -f
```

## Timing Details

| Parameter | Value |
|-----------|-------|
| Schedule | Monday & Wednesday |
| Cron fires | 08:00 CDT (13:00 UTC) |
| Random delay | 0 – 31,200 s (0 – 8h 40m) |
| Effective start window | 08:00 – 16:40 CDT |
| Burst duration | 20 minutes (1,200 s) |
| Latest completion | 17:00 CDT |

The random offset is drawn with `shuf` on each node independently, so multiple use2 nodes will start at different times, producing a more realistic traffic shape.

## Logs

```bash
# Server
tail -f /var/log/nginx/replication-access.log

# Client
journalctl -u replication-traffic --since today
```

## Teardown

```bash
# Client node
sudo rm /etc/cron.d/replication-traffic
sudo systemctl disable --now replication-traffic.service
sudo rm /etc/systemd/system/replication-traffic.service
sudo rm -rf /opt/replication-client /etc/replication-client.conf

# Server node
sudo rm /etc/nginx/sites-enabled/replication-server.conf \
        /etc/nginx/sites-available/replication-server.conf
sudo nginx -s reload
sudo systemctl disable --now replication-server.service
sudo rm /etc/systemd/system/replication-server.service
sudo rm -rf /opt/replication-server
```
