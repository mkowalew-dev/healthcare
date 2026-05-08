#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CareConnect PACS — Sample DICOM Image Downloader
#
# Downloads real multi-slice DICOM series from the OHIF viewer-testdata
# repository (MIT licence).  These are the same files OHIF uses to test
# Cornerstone, so they are guaranteed to render correctly in the viewer.
#
#   MisterMr  — 61-slice MR brain series
#   Juno      — 30-slice CT series (subset of 176)
#
# Both series share proper Study/Series UIDs across their slices, so the DICOM
# index will build a real stack and the viewer will show genuine slice
# navigation instead of cycling through unrelated images.
#
# After download, restart the PACS server so it re-indexes the new files.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/../studies"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()    { echo -e "  ${GREEN}✓${NC} $*"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $*"; }
fail()  { echo -e "  ${RED}✗${NC} $*"; }

# Fetch the list of files in a GitHub directory and print one download URL per line.
# Requires python3 (standard on macOS / Ubuntu 20+).
list_github_dir() {
  local api_url="$1"
  local limit="${2:-9999}"
  curl -fsSL --retry 3 --connect-timeout 10 "$api_url" 2>/dev/null \
    | python3 -c "
import json, sys
items = json.load(sys.stdin)
limit = int(sys.argv[1]) if len(sys.argv) > 1 else len(items)
files = [f for f in items if f['type'] == 'file'][:limit]
for f in files:
    print(f['download_url'])
" "$limit"
}

# Download one file; returns non-zero on failure (caller decides whether to abort).
download_file() {
  local url="$1"
  local dest="$2"
  if curl -fsSL --retry 3 --connect-timeout 10 --max-time 120 -o "$dest" "$url" 2>/dev/null; then
    return 0
  else
    rm -f "$dest"
    return 1
  fi
}

# Download all files listed by list_github_dir into a target directory.
download_series() {
  local label="$1"
  local api_url="$2"
  local dest_dir="$3"
  local limit="${4:-9999}"

  mkdir -p "$dest_dir"

  echo ""
  echo "Downloading ${label}..."

  local urls
  urls=$(list_github_dir "$api_url" "$limit")

  if [[ -z "$urls" ]]; then
    warn "Could not fetch file list for ${label} — check network / GitHub API rate limit"
    return 0
  fi

  local ok_count=0 fail_count=0
  while IFS= read -r url; do
    # Files in OHIF testdata have no extension; save them as .dcm
    local basename
    basename=$(basename "$url")
    local dest="${dest_dir}/${basename}.dcm"

    if [[ -f "$dest" ]]; then
      (( ok_count++ )) || true
      continue   # already downloaded — skip
    fi

    if download_file "$url" "$dest"; then
      (( ok_count++ )) || true
    else
      (( fail_count++ )) || true
      warn "Failed: ${basename}"
    fi
  done <<< "$urls"

  if [[ $ok_count -gt 0 ]]; then
    ok "${label}: ${ok_count} file(s) ready"
  fi
  if [[ $fail_count -gt 0 ]]; then
    warn "${label}: ${fail_count} file(s) failed"
  fi
}

OHIF_API="https://api.github.com/repos/OHIF/viewer-testdata/contents/dcm"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  CareConnect PACS — Sample Image Downloader"
echo "  Source: OHIF viewer-testdata (MIT licence)"
echo "  Output: ${OUTPUT_DIR}"
echo "═══════════════════════════════════════════════════════════════"

# MisterMr — full 61-slice MR brain series
download_series \
  "MisterMr (61-slice MR brain)" \
  "${OHIF_API}/MisterMr" \
  "${OUTPUT_DIR}/mr_brain"

# Juno — CT series (176 slices total; raise the limit to reduce cycling in
# seed studies that have 160 instances — more unique files = fewer repeated frames)
download_series \
  "Juno (60-slice CT)" \
  "${OHIF_API}/Juno" \
  "${OUTPUT_DIR}/ct_chest" \
  60

# ── Summary ──────────────────────────────────────────────────────────────────
TOTAL=$(find "${OUTPUT_DIR}" -name "*.dcm" 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "═══════════════════════════════════════════════════════════════"
if [[ "$TOTAL" -eq 0 ]]; then
  echo -e "  ${RED}No files downloaded.${NC}"
  echo "  Check your internet connection and try again."
  echo "  If the GitHub API rate limit is the issue, try again in an hour."
else
  echo -e "  ${GREEN}${TOTAL} DICOM file(s) ready${NC} in ${OUTPUT_DIR}"
  echo ""
  echo "  Next steps:"
  echo "    1. Restart the PACS server:  cd pacs/server && npm start"
  echo "    2. Open the viewer:          http://localhost:5174"
  echo "    3. Select a study — use the scroll wheel over the image"
  echo "       to navigate through slices."
fi
echo "═══════════════════════════════════════════════════════════════"
