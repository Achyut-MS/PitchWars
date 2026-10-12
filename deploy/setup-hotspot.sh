#!/usr/bin/env bash
# Makes the Raspberry Pi create its own Wi-Fi network (NetworkManager hotspot, Bookworm).
#
#   sudo WIFI_PASSWORD='8-to-63-characters' [WIFI_SSID=Showdown] [COUNTRY=IN] bash deploy/setup-hotspot.sh
#   WIFI_PASSWORD=... bash deploy/setup-hotspot.sh --dry-run     only print the commands
#
# Settings (environment, or --ssid X --password Y --country CC --address A/24 --name N):
#   WIFI_SSID (Showdown)  WIFI_PASSWORD (required, 8-63)  COUNTRY (2 letters, optional)
#   ADDRESS (10.42.0.1/24)  CHANNEL (6)  HOTSPOT_NAME (showdown-hotspot)  IFNAME (wlan0)  PRIORITY (100)
# The old PASSWORD / SSID / CON names still work. Running it again updates the same connection.
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
SSID="${WIFI_SSID:-${SSID:-Showdown}}"
WIFI_PASSWORD="${WIFI_PASSWORD:-${PASSWORD:-}}"
COUNTRY="${COUNTRY:-}"
ADDRESS="${ADDRESS:-10.42.0.1/24}"
CHANNEL="${CHANNEL:-6}"
CON="${HOTSPOT_NAME:-${CON:-showdown-hotspot}}"
IFNAME="${IFNAME:-wlan0}"
PRIORITY="${PRIORITY:-100}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --ssid) SSID="${2:?--ssid needs a value}"; shift ;;
    --password) WIFI_PASSWORD="${2:?--password needs a value}"; shift ;;
    --country) COUNTRY="${2:?--country needs a value}"; shift ;;
    --address) ADDRESS="${2:?--address needs a value}"; shift ;;
    --name) CON="${2:?--name needs a value}"; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "ERROR: $*" >&2; exit 1; }
dry() { [ "$DRY_RUN" = "1" ]; }

[ "${#WIFI_PASSWORD}" -ge 8 ] && [ "${#WIFI_PASSWORD}" -le 63 ] || die "WIFI_PASSWORD must be 8 to 63 characters."
[ "${#SSID}" -ge 1 ] && [ "${#SSID}" -le 32 ] || die "WIFI_SSID must be 1 to 32 characters."
case "$ADDRESS" in */*) ;; *) die "ADDRESS must look like 10.42.0.1/24." ;; esac
[[ "$CHANNEL" =~ ^[0-9]+$ ]] && [ "$CHANNEL" -ge 1 ] && [ "$CHANNEL" -le 11 ] || die "CHANNEL must be 1 to 11 (2.4 GHz)."
[[ "$PRIORITY" =~ ^[0-9]+$ ]] || die "PRIORITY must be a number."
if [ -n "$COUNTRY" ]; then [[ "$COUNTRY" =~ ^[A-Z]{2}$ ]] || die "COUNTRY must be two capital letters, such as IN."; fi

if ! dry && [ "$(id -u)" -ne 0 ]; then
  die "This must run as root. Use: sudo -E bash deploy/setup-hotspot.sh (or add --dry-run to just look)."
fi
if ! dry && ! command -v nmcli >/dev/null 2>&1; then
  die "nmcli (NetworkManager) is not installed. Raspberry Pi OS Bookworm has it; older releases do not."
fi

# run: print in a dry run, otherwise execute. The Wi-Fi password is hidden in what is printed.
run() {
  if dry; then
    local out=() skip=0 a
    for a in "$@"; do
      if [ "$skip" -eq 1 ]; then out+=("HIDDEN"); skip=0; continue; fi
      out+=("$a"); [ "$a" = "wifi-sec.psk" ] && skip=1
    done
    printf '+'; printf ' %q' "${out[@]}"; echo
  else "$@"; fi
}

EXISTS=0
if dry; then [ "${HOTSPOT_EXISTS:-0}" = "1" ] && EXISTS=1
elif nmcli -t -f NAME connection show | grep -qxF "$CON"; then EXISTS=1; fi

if [ -n "$COUNTRY" ]; then run raspi-config nonint do_wifi_country "$COUNTRY"; fi
run rfkill unblock wifi

SETTINGS=(
  connection.autoconnect yes
  connection.autoconnect-priority "$PRIORITY"
  802-11-wireless.ssid "$SSID"
  802-11-wireless.mode ap
  802-11-wireless.band bg
  802-11-wireless.channel "$CHANNEL"
  802-11-wireless.powersave 2
  wifi-sec.key-mgmt wpa-psk
  wifi-sec.proto rsn
  wifi-sec.pairwise ccmp
  wifi-sec.group ccmp
  wifi-sec.psk "$WIFI_PASSWORD"
  ipv4.method shared
  ipv4.addresses "$ADDRESS"
  ipv6.method disabled
)
if [ "$EXISTS" -eq 1 ]; then
  echo "Connection '$CON' exists: updating it."
  run nmcli connection modify "$CON" "${SETTINGS[@]}"
else
  echo "Connection '$CON' not found: creating it."
  run nmcli connection add type wifi ifname "$IFNAME" con-name "$CON" "${SETTINGS[@]}"
fi
run nmcli connection up "$CON"

echo "Hotspot '$SSID' is configured (channel $CHANNEL, WPA2). The game address is ${ADDRESS%/*}."
echo "Players join '$SSID' and open http://${ADDRESS%/*}/ . If you were connected to Wi-Fi for internet, that link is now replaced by the hotspot."
