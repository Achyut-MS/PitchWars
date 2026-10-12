#!/usr/bin/env bash
# Removes the Showdown service. Your database and backups are NEVER deleted.
#
#   sudo bash deploy/uninstall.sh [--remove-settings] [--remove-hotspot] [--dry-run]
#     --remove-settings  also delete the settings file (it holds the organizer password)
#     --remove-hotspot   also delete the Wi-Fi hotspot connection
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
ENV_FILE="${ENV_FILE:-/etc/showdown/showdown.env}"
UNIT_FILE="${UNIT_FILE:-/etc/systemd/system/showdown.service}"
CON="${HOTSPOT_NAME:-showdown-hotspot}"
RM_ENV=0; RM_HOTSPOT=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --remove-settings) RM_ENV=1 ;;
    --remove-hotspot) RM_HOTSPOT=1 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done
dry() { [ "$DRY_RUN" = "1" ]; }
run() { if dry; then printf '+'; printf ' %q' "$@"; echo; else "$@"; fi; }

if ! dry && [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: This must run as root. Use: sudo bash deploy/uninstall.sh (or add --dry-run)." >&2; exit 1
fi

run systemctl disable --now showdown || true
run rm -f "$UNIT_FILE"
run systemctl daemon-reload
if [ "$RM_ENV" -eq 1 ]; then run rm -f "$ENV_FILE"; fi
if [ "$RM_HOTSPOT" -eq 1 ]; then run nmcli connection delete "$CON" || true; fi
echo "Service removed. The database (data/) and the backups were left alone."
