#!/usr/bin/env bash
# Quick health check after installing (or before an event). Safe to run any time; changes nothing.
#   bash deploy/check.sh [--dry-run]
# Overrides (for testing): BASE_URL (default http://127.0.0.1), HOTSPOT_NAME, DATA_DIR,
#   SKIP_SYSTEMD=1, SKIP_NMCLI=1
set -uo pipefail

DRY_RUN="${DRY_RUN:-0}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
CON="${HOTSPOT_NAME:-showdown-hotspot}"
DATA_DIR="${DATA_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
FAILS=0
ok() { echo "[ OK ] $*"; }
bad() { echo "[FAIL] $*"; FAILS=$((FAILS + 1)); }
warn() { echo "[WARN] $*"; }

if [ "$DRY_RUN" = "1" ]; then
  echo "Would check: systemctl is-active showdown; GET $BASE_URL/ and $BASE_URL/join return 200;"
  echo "nmcli connection $CON is active; free disk space under $DATA_DIR; print the date."
  exit 0
fi

if [ "${SKIP_SYSTEMD:-0}" = "1" ]; then warn "service check skipped"
elif systemctl is-active --quiet showdown; then ok "service showdown is running"
else bad "service showdown is not running (sudo journalctl -u showdown -n 30)"; fi

for path in / /join; do
  code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$BASE_URL$path" || true)"
  if [ "$code" = "200" ]; then ok "$BASE_URL$path answers 200"; else bad "$BASE_URL$path answered '${code:-nothing}' (expected 200)"; fi
done

if [ "${SKIP_NMCLI:-0}" = "1" ]; then warn "hotspot check skipped"
elif command -v nmcli >/dev/null 2>&1 && nmcli -t -f NAME,STATE connection show --active | grep -qxF "$CON:activated"; then ok "hotspot '$CON' is active"
else bad "hotspot '$CON' is not active (sudo bash deploy/setup-hotspot.sh)"; fi

free_mb="$(df -Pm "$DATA_DIR" | awk 'NR==2 {print $4}')"
if [ -n "$free_mb" ] && [ "$free_mb" -ge 500 ]; then ok "disk space: ${free_mb} MB free"; else bad "disk space low: ${free_mb:-unknown} MB free"; fi

warn "The Pi has no clock battery. Date and time now: $(date '+%Y-%m-%d %H:%M:%S %Z')"
warn "If that is wrong, set it before the event: sudo date -s 'YYYY-MM-DD HH:MM:SS'"

if [ "$FAILS" -eq 0 ]; then echo "All checks passed."; else echo "$FAILS check(s) failed."; fi
[ "$FAILS" -eq 0 ]
