#!/usr/bin/env bash
# Installs the Startup Showdown server on a Raspberry Pi (Raspberry Pi OS Bookworm, 64-bit)
# and makes it start by itself at power-up.
#
#   sudo bash deploy/install.sh              install (asks for the organizer password)
#   bash deploy/install.sh --dry-run         only print what would be done (no root needed)
#
# Optional settings (environment variables):
#   ORGANIZER_PASSWORD  8+ characters; if unset you are asked, and an empty answer generates one
#   WIFI_SSID, WIFI_PASSWORD  the Wi-Fi name/password shown on the join sign (password 8 to 63 chars)
#   INSTALL_DIR  where the code is (default: the folder above this script)
#   SERVICE_USER user that runs the game (default: the user who ran sudo, else pi)
#   BACKUP_DIR   where backups go (default: /media/<user>/SHOWDOWN if it exists, else INSTALL_DIR/backups)
#   ENV_FILE     default /etc/showdown/showdown.env      UNIT_FILE  default /etc/systemd/system/showdown.service
#   NODE_BIN     default: node found on PATH
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-$(dirname "$SCRIPT_DIR")}"
SERVICE_USER="${SERVICE_USER:-${SUDO_USER:-pi}}"
ENV_FILE="${ENV_FILE:-/etc/showdown/showdown.env}"
UNIT_FILE="${UNIT_FILE:-/etc/systemd/system/showdown.service}"
UNIT_TEMPLATE="${UNIT_TEMPLATE:-$SCRIPT_DIR/showdown.service}"
OS_RELEASE_FILE="${OS_RELEASE_FILE:-/etc/os-release}"
ARCH="${ARCH:-$(uname -m)}"
PLACEHOLDER='change-me-before-the-event'
WIFI_SSID="${WIFI_SSID:-Showdown}"
WIFI_PASSWORD="${WIFI_PASSWORD:-}"
GENERATED=0

die() { echo "ERROR: $*" >&2; exit 1; }
say() { echo "== $*"; }
dry() { [ "$DRY_RUN" = "1" ]; }
run() { if dry; then printf '+'; printf ' %q' "$@"; echo; else "$@"; fi; }

# --- who is running this -------------------------------------------------------------
if ! dry && [ "$(id -u)" -ne 0 ]; then
  die "This must run as root. Use: sudo bash deploy/install.sh (or add --dry-run to just look)."
fi

# --- the machine -----------------------------------------------------------------------
os_ok=1
if [ -r "$OS_RELEASE_FILE" ]; then
  # shellcheck disable=SC1090
  OS_ID="$(. "$OS_RELEASE_FILE"; echo "${ID:-unknown}")"; OS_CODENAME="$(. "$OS_RELEASE_FILE"; echo "${VERSION_CODENAME:-unknown}")"
else
  OS_ID=unknown; OS_CODENAME=unknown
fi
case "$OS_ID" in debian|raspbian) ;; *) os_ok=0 ;; esac
case "$ARCH" in aarch64|arm64) ;; *) os_ok=0 ;; esac
if [ "$os_ok" -eq 0 ]; then
  msg="This is built for Raspberry Pi OS (64-bit, Bookworm); found OS '$OS_ID' on '$ARCH'."
  if dry || [ "${FORCE:-0}" = "1" ]; then echo "WARNING: $msg"; else die "$msg Set FORCE=1 to try anyway."; fi
elif [ "$OS_CODENAME" != "bookworm" ]; then
  echo "WARNING: expected Debian Bookworm, found '$OS_CODENAME'. NetworkManager hotspot steps may differ."
fi

# --- Node 22 or newer ----------------------------------------------------------------
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
node_instructions() {
  cat >&2 <<'TXT'
Node.js 22 or newer is required (the database module needs it). Install it with:
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  node --version        # must print v22 or higher
Then run this installer again.
TXT
}
node_ok=0
if [ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ]; then
  node_major="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$node_major" -ge 22 ] 2>/dev/null && node_ok=1
fi
if [ "$node_ok" -eq 0 ]; then
  if dry; then echo "WARNING: Node 22+ not found; a real install would stop here."; node_instructions
  else node_instructions; exit 1; fi
fi
[ -n "$NODE_BIN" ] || NODE_BIN=/usr/bin/node

# --- paths must be safe to put in sed and in the unit ------------------------------------------
for v in INSTALL_DIR SERVICE_USER ENV_FILE NODE_BIN; do
  case "${!v}" in *[\|\&\\\ \"\']*|*$'\n'*) die "$v contains a space or a special character: ${!v}" ;; esac
done
[ -f "$UNIT_TEMPLATE" ] || die "Missing $UNIT_TEMPLATE"
[ -f "$INSTALL_DIR/src/index.js" ] || die "$INSTALL_DIR does not look like the game folder (no src/index.js)."

# --- backup folder -------------------------------------------------------------------------
if [ -z "${BACKUP_DIR:-}" ]; then
  if [ -d "/media/$SERVICE_USER/SHOWDOWN" ]; then BACKUP_DIR="/media/$SERVICE_USER/SHOWDOWN"
  else BACKUP_DIR="$INSTALL_DIR/backups"; fi
fi

# --- passwords -----------------------------------------------------------------------------
check_password() {
  local p="$1"
  [ "$p" != "$PLACEHOLDER" ] || die "That is the example password. Choose your own."
  [ "${#p}" -ge 8 ] || die "The organizer password must be at least 8 characters."
  case "$p" in *$'\n'*|*$'\r'*) die "The organizer password cannot contain a line break." ;; esac
}
generate_password() { LC_ALL=C tr -dc 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' </dev/urandom | head -c 14; }

ORGANIZER_PASSWORD="${ORGANIZER_PASSWORD:-}"
KEEP_ENV=0
if [ -z "$ORGANIZER_PASSWORD" ] && [ -f "$ENV_FILE" ] && ! dry; then
  KEEP_ENV=1; say "Keeping the existing $ENV_FILE (set ORGANIZER_PASSWORD to replace it)."
elif [ -z "$ORGANIZER_PASSWORD" ]; then
  if ! dry && [ -t 0 ]; then
    read -r -s -p "Organizer password (8+ characters, empty = make one for me): " ORGANIZER_PASSWORD; echo
  fi
  if [ -z "$ORGANIZER_PASSWORD" ]; then
    GENERATED=1
    if dry; then ORGANIZER_PASSWORD="dry-run-placeholder-not-written"; else ORGANIZER_PASSWORD="$(generate_password)"; fi
  fi
fi
if [ "$KEEP_ENV" -eq 0 ] && [ "$GENERATED" -eq 0 ]; then check_password "$ORGANIZER_PASSWORD"; fi
if [ -n "$WIFI_PASSWORD" ]; then
  [ "${#WIFI_PASSWORD}" -ge 8 ] && [ "${#WIFI_PASSWORD}" -le 63 ] || die "WIFI_PASSWORD must be 8 to 63 characters."
  case "$WIFI_PASSWORD$WIFI_SSID" in *$'\n'*) die "Wi-Fi name/password cannot contain a line break." ;; esac
fi
[ "${#WIFI_SSID}" -ge 1 ] && [ "${#WIFI_SSID}" -le 32 ] || die "WIFI_SSID must be 1 to 32 characters."

# --- service user and folders --------------------------------------------------------------------
say "Service user and folders"
if id "$SERVICE_USER" >/dev/null 2>&1; then echo "User $SERVICE_USER exists."
else run useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"; fi
run mkdir -p "$INSTALL_DIR/data" "$BACKUP_DIR" "$(dirname "$ENV_FILE")"
run chown "$SERVICE_USER" "$INSTALL_DIR/data" "$BACKUP_DIR"

# --- settings file (mode 600) -----------------------------------------------------------------------
quote() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; printf '"%s"' "$s"; }
say "Settings file $ENV_FILE (mode 600, only root can read it)"
if [ "$KEEP_ENV" -eq 1 ]; then
  echo "Left unchanged."
elif dry; then
  echo "+ write $ENV_FILE with ORGANIZER_PASSWORD (hidden), PORT=80, DB_FILE=$INSTALL_DIR/data/showdown.db, BACKUP_DIR=$BACKUP_DIR, WIFI_SSID=$WIFI_SSID, WIFI_PASSWORD (hidden), mode 600"
else
  (
    umask 077
    {
      echo "ORGANIZER_PASSWORD=$(quote "$ORGANIZER_PASSWORD")"
      echo "PORT=80"
      echo "DB_FILE=$INSTALL_DIR/data/showdown.db"
      echo "BACKUP_DIR=$BACKUP_DIR"
      echo "WIFI_SSID=$(quote "$WIFI_SSID")"
      echo "WIFI_PASSWORD=$(quote "$WIFI_PASSWORD")"
    } > "$ENV_FILE.tmp"
  )
  chmod 600 "$ENV_FILE.tmp"; mv "$ENV_FILE.tmp" "$ENV_FILE"
fi
if [ "$GENERATED" -eq 1 ] && ! dry; then
  echo "GENERATED ORGANIZER PASSWORD (shown once, write it down now): $ORGANIZER_PASSWORD"
elif [ "$GENERATED" -eq 1 ]; then
  echo "(a real install would generate an organizer password here and show it once)"
fi

# --- dependencies (needs internet; native module is built on this machine) ------------------------
say "Installing dependencies as $SERVICE_USER (needs internet)"
if dry; then echo "+ (cd $INSTALL_DIR && runuser -u $SERVICE_USER -- npm ci --omit=dev)"
else (cd "$INSTALL_DIR" && runuser -u "$SERVICE_USER" -- npm ci --omit=dev); fi

# --- systemd unit ------------------------------------------------------------------------------------------
render_unit() {
  sed -e "s|@INSTALL_DIR@|$INSTALL_DIR|g" -e "s|@SERVICE_USER@|$SERVICE_USER|g" \
      -e "s|@ENV_FILE@|$ENV_FILE|g" -e "s|@NODE_BIN@|$NODE_BIN|g" "$UNIT_TEMPLATE"
}
UNIT_TEXT="$(render_unit)"
if printf '%s' "$UNIT_TEXT" | grep -q '@[A-Z_]*@'; then die "Unfilled @...@ value left in the unit."; fi
say "systemd unit $UNIT_FILE"
if dry; then
  echo "+ install unit:"; echo "----- showdown.service -----"; echo "$UNIT_TEXT"; echo "----------------------------"
else
  printf '%s\n' "$UNIT_TEXT" > "$UNIT_FILE"; chmod 644 "$UNIT_FILE"
fi
run systemctl daemon-reload
run systemctl enable showdown
run systemctl restart showdown

say "Done."
cat <<TXT

Checklist:
  1. bash deploy/check.sh                   (service, port 80, /join, hotspot, disk, date)
  2. Set up the Wi-Fi hotspot (do this LAST; it takes the Wi-Fi away from the internet):
       sudo WIFI_PASSWORD='your-wifi-password' COUNTRY=IN bash deploy/setup-hotspot.sh
  3. Set the date and time (the Pi has no clock battery): sudo date -s 'YYYY-MM-DD HH:MM'
  4. Plug in the USB stick named SHOWDOWN, check BACKUP_DIR=$BACKUP_DIR
  5. From a phone on the Showdown Wi-Fi open http://10.42.0.1/ and http://10.42.0.1/join
  6. Reboot once and check the game comes back by itself.
TXT
