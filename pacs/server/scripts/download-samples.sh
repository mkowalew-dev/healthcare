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

# Download a study ZIP from a direct URL, extract it, and ensure every
# extracted file has a .dcm extension.
# Usage: download_zip_series <label> <download-url> <dest-dir>
download_zip_series() {
  local label="$1"
  local download_url="$2"
  local dest_dir="$3"

  mkdir -p "$dest_dir"

  echo ""
  echo "Downloading ${label}..."

  # Skip entirely if the directory already has files from a previous run.
  local existing
  existing=$(find "$dest_dir" -name "*.dcm" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$existing" -gt 0 ]]; then
    ok "${label}: ${existing} file(s) already present — skipping download"
    return 0
  fi

  local tmp_zip
  tmp_zip=$(mktemp /tmp/dicomlibrary_XXXXXX.zip)

  if ! curl -fsSL --retry 3 --connect-timeout 15 --max-time 300 \
       -o "$tmp_zip" "$download_url" 2>/dev/null; then
    rm -f "$tmp_zip"
    fail "${label}: download failed — check your internet connection"
    warn "  Tried: ${download_url}"
    warn "  To add manually: download the ZIP and run:  unzip <file>.zip -d ${dest_dir}"
    return 0
  fi

  # Verify the downloaded file is actually a ZIP archive.
  if ! file "$tmp_zip" 2>/dev/null | grep -qi "zip"; then
    rm -f "$tmp_zip"
    fail "${label}: downloaded file is not a ZIP archive — the URL or token may have expired"
    warn "  Tried: ${download_url}"
    warn "  To add manually: download the ZIP and run:  unzip <file>.zip -d ${dest_dir}"
    return 0
  fi

  local tmp_extract
  tmp_extract=$(mktemp -d /tmp/dicomlibrary_extract_XXXXXX)

  if ! unzip -q "$tmp_zip" -d "$tmp_extract" 2>/dev/null; then
    rm -rf "$tmp_zip" "$tmp_extract"
    fail "${label}: failed to unzip archive"
    return 0
  fi

  rm -f "$tmp_zip"

  # Move all DICOM files into dest_dir, adding .dcm extension when missing.
  local count=0
  while IFS= read -r -d '' src_file; do
    local basename
    basename=$(basename "$src_file")
    local dest_file="${dest_dir}/${basename}"
    # Add .dcm extension if not already present (some archives omit it).
    [[ "$dest_file" != *.dcm && "$dest_file" != *.DCM ]] && dest_file="${dest_file}.dcm"
    cp "$src_file" "$dest_file"
    (( count++ )) || true
  done < <(find "$tmp_extract" -type f \
    \( -iname "*.dcm" -o -iname "*.ima" -o -iname "*.dicom" \) -print0)

  # Fallback: treat every regular file as a DICOM if no recognised extension found.
  if [[ "$count" -eq 0 ]]; then
    while IFS= read -r -d '' src_file; do
      local basename
      basename=$(basename "$src_file")
      cp "$src_file" "${dest_dir}/${basename}.dcm"
      (( count++ )) || true
    done < <(find "$tmp_extract" -type f -print0)
  fi

  rm -rf "$tmp_extract"

  if [[ "$count" -gt 0 ]]; then
    ok "${label}: ${count} file(s) ready"
  else
    warn "${label}: ZIP was empty or contained no DICOM files"
  fi
}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  CareConnect PACS — Sample Image Downloader"
echo "  Source: OHIF viewer-testdata (MIT licence) + DICOM Library"
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

# DICOM Library study — 2025-07-04 upload (UID: 1.3.6.1.4.1.44316.6.102.1…)
download_zip_series \
  "DICOM Library study (20250704)" \
  "https://www.dicomlibrary.com?requestType=WADO&studyUID=1.3.6.1.4.1.44316.6.102.1.20250704114423696.61158672119535771932&manage=daae3df7f522b56724aed7e3e544c0fe&token=5107761f537267518d056cad3f37e5197494329fe32c323879" \
  "${OUTPUT_DIR}/dicomlibrary_20250704"

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
