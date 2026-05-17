# ThousandEyes DICOM Bandwidth Testing — Network Team Guide

This guide shows how to reproduce the same DICOM image-transfer tests used by the SE demo team,
without needing the CareConnect PACS application.  You download a real DICOM study, serve it
from any machine, and point ThousandEyes HTTP Server tests at it — the same methodology used to
detect the radiology-WAN anomaly in the SE demo.

---

## Overview

| What | Detail |
|------|--------|
| DICOM study | `1.3.6.1.4.1.44316.6.102.1.20250704114423696.61158672119535771932` |
| Source | DICOM Library (public, no login required) |
| Files | ZIP of `.dcm` slices — real CT/MR DICOM objects |
| Serve with | Python 3 built-in HTTP server (or nginx — see below) |
| TE test type | HTTP Server test (one per file size tier) |
| Goal | Measure raw transfer throughput across small / medium / large DICOM objects |

---

## Step 1 — Download the DICOM study

Run on the machine that will act as the file server (or any machine, then copy the files over):

```bash
mkdir -p ~/dicom-te-demo && cd ~/dicom-te-demo

curl -L -o dicom-study.zip \
  "https://www.dicomlibrary.com?requestType=WADO&studyUID=1.3.6.1.4.1.44316.6.102.1.20250704114423696.61158672119535771932&manage=daae3df7f522b56724aed7e3e544c0fe&token=710126b795f506f854917d88637cb6601431dd9f31a0edd358"
```

Verify it is a ZIP (not an error page):

```bash
file dicom-study.zip
# expected: dicom-study.zip: Zip archive data ...
```

Extract:

```bash
unzip -q dicom-study.zip -d dcm-raw
```

Rename any files that are missing the `.dcm` extension:

```bash
find dcm-raw -type f ! -name "*.dcm" | while read f; do mv "$f" "${f}.dcm"; done
```

List what you have:

```bash
find dcm-raw -name "*.dcm" | wc -l      # number of slices
du -sh dcm-raw/                          # total size
ls -lhS dcm-raw/**/*.dcm 2>/dev/null | head -20   # largest files first
```

---

## Step 2 — Select representative probe files

ThousandEyes tests one URL per size tier.  Pick three `.dcm` files that approximate the sizes
below, then create a `probes/` directory with stable filenames:

```bash
mkdir -p ~/dicom-te-demo/probes

# Sort all .dcm files by size
find ~/dicom-te-demo/dcm-raw -name "*.dcm" -printf "%s %p\n" | sort -n > /tmp/dcm-sizes.txt

# Inspect the distribution
awk '{printf "%d KB  %s\n", $1/1024, $2}' /tmp/dcm-sizes.txt | head -40
```

Copy the closest match for each tier:

```bash
# Small  ~200 KB  — scout / localizer slice
cp <path-to-~200KB-file>  ~/dicom-te-demo/probes/probe-small.dcm

# Medium ~2 MB   — typical axial CT slice (512×512 16-bit)
cp <path-to-~2MB-file>    ~/dicom-te-demo/probes/probe-medium.dcm

# Large  ~20 MB  — multi-frame slab or thick MR series
cp <path-to-~20MB-file>   ~/dicom-te-demo/probes/probe-large.dcm
```

Confirm sizes:

```bash
ls -lh ~/dicom-te-demo/probes/
```

> **Tip:** if the study has no single file ≥ 10 MB, concatenate several slices into one binary blob —
> ThousandEyes measures transfer throughput, not DICOM validity:
> ```bash
> cat dcm-raw/**/*.dcm > probes/probe-large.dcm   # bash globstar
> ```

---

## Step 3 — Serve the probe files

### Option A — Python 3 (quickest, no install required)

```bash
cd ~/dicom-te-demo/probes
python3 -m http.server 8080
```

Test locally:

```bash
curl -o /dev/null -w "size=%{size_download}B  time=%{time_total}s  speed=%{speed_download}B/s\n" \
  http://localhost:8080/probe-small.dcm
```

> Python's built-in server is single-threaded.  For multi-agent load testing use nginx (Option B).

### Option B — nginx (recommended for sustained TE polling)

Install:

```bash
# Ubuntu/Debian
sudo apt-get install -y nginx

# macOS (Homebrew)
brew install nginx
```

Create a minimal config at `/etc/nginx/sites-available/dicom-probes` (Linux) or adapt for macOS:

```nginx
server {
    listen 8080;
    server_name _;

    root /home/<YOUR-USER>/dicom-te-demo/probes;
    autoindex off;

    # Disable gzip so transfer size is not artificially compressed
    gzip off;

    location / {
        add_header Cache-Control "no-store";
        add_header Timing-Allow-Origin "*";
        add_header X-Content-Type-Options "nosniff";
        types { application/dicom dcm; }
        default_type application/octet-stream;
    }
}
```

Enable and start:

```bash
sudo ln -sf /etc/nginx/sites-available/dicom-probes /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 4 — Validate with curl

Run these from the machine running ThousandEyes Enterprise Agent (or any machine on the same path)
to confirm the server is reachable and measure baseline throughput:

```bash
SERVER=http://<your-server-ip>:8080

# Small probe (~200 KB)
curl -o /dev/null -w "size=%{size_download}B  time=%{time_total}s  speed=%{speed_download}B/s\n" \
  "${SERVER}/probe-small.dcm"

# Medium probe (~2 MB)
curl -o /dev/null -w "size=%{size_download}B  time=%{time_total}s  speed=%{speed_download}B/s\n" \
  "${SERVER}/probe-medium.dcm"

# Large probe (~20 MB)
curl -o /dev/null -w "size=%{size_download}B  time=%{time_total}s  speed=%{speed_download}B/s\n" \
  "${SERVER}/probe-large.dcm"
```

Expected baseline (LAN / low-latency path):

| Probe | Size | Expected throughput |
|-------|------|---------------------|
| small | ~200 KB | > 5 MB/s |
| medium | ~2 MB | > 10 MB/s |
| large | ~20 MB | > 20 MB/s |

---

## Step 5 — Configure ThousandEyes HTTP Server tests

Create **one HTTP Server test per probe** (three tests total).

### Test settings (apply to all three)

| Setting | Value |
|---------|-------|
| Test type | HTTP Server |
| Interval | 1 minute |
| Protocol | HTTP (or HTTPS if nginx is TLS-terminated) |
| Request method | GET |
| Follow redirects | Yes |
| Verify SSL | Yes / No (match your server config) |
| Agents | Your Enterprise Agents on each site under test |

### Per-test URLs

| Test name | URL |
|-----------|-----|
| DICOM Probe — Small (200 KB) | `http://<server-ip>:8080/probe-small.dcm` |
| DICOM Probe — Medium (2 MB) | `http://<server-ip>:8080/probe-medium.dcm` |
| DICOM Probe — Large (20 MB) | `http://<server-ip>:8080/probe-large.dcm` |

### Alert rules (suggested)

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| Response time | > 500 ms | Elevated WAN latency |
| Throughput | < 1 MB/s | Degraded path — radiologists feel this |
| HTTP availability | < 100 % | Server unreachable |

> **Metric note:** ThousandEyes reports **throughput** (bits/sec) and **response time** (ms to first
> byte + transfer).  Use the waterfall view to separate connection time from transfer time.

---

## Step 6 — Simulate a degraded path (optional)

To replicate what the SE team demonstrates, introduce artificial latency on the server side using
`tc` (Linux Traffic Control):

```bash
# Add 1500 ms delay on the loopback / server NIC (adjust interface as needed)
sudo tc qdisc add dev eth0 root netem delay 1500ms 300ms

# Verify — curl should now show ~1.5 s response time
curl -o /dev/null -w "time=%{time_total}s\n" http://localhost:8080/probe-small.dcm

# Remove when done
sudo tc qdisc del dev eth0 root
```

ThousandEyes will catch the degradation immediately across all three size tiers, demonstrating
how WAN latency disproportionately impacts large DICOM transfers (large file takes longer, so
latency is amortized less).

---

## Cleanup

```bash
# Stop Python server
# Ctrl-C in the terminal running python3 -m http.server

# Stop nginx
sudo systemctl stop nginx

# Remove files
rm -rf ~/dicom-te-demo
```

---

## Quick-reference card

```
# 1. Download
curl -L -o dicom-study.zip "https://www.dicomlibrary.com?requestType=WADO&studyUID=1.3.6.1.4.1.44316.6.102.1.20250704114423696.61158672119535771932&manage=daae3df7f522b56724aed7e3e544c0fe&token=710126b795f506f854917d88637cb6601431dd9f31a0edd358"

# 2. Extract
unzip -q dicom-study.zip -d dcm-raw
find dcm-raw -type f ! -name "*.dcm" | while read f; do mv "$f" "${f}.dcm"; done

# 3. Pick probes & serve
mkdir probes
cp <small>.dcm  probes/probe-small.dcm
cp <medium>.dcm probes/probe-medium.dcm
cp <large>.dcm  probes/probe-large.dcm
cd probes && python3 -m http.server 8080

# 4. Validate
SERVER=http://localhost:8080
for p in probe-small.dcm probe-medium.dcm probe-large.dcm; do
  curl -o /dev/null -w "$p  size=%{size_download}B  time=%{time_total}s  speed=%{speed_download}B/s\n" \
    "${SERVER}/${p}"
done

# 5. Add TE HTTP Server tests pointing at each URL
```
