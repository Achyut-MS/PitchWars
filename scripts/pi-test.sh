#!/usr/bin/env bash
# One command to test a real Raspberry Pi install: health check, then the load test against it.
#
#   On the Pi itself (health check only, no load generator):
#       bash scripts/pi-test.sh --on-pi
#   From a laptop joined to the Pi's Wi-Fi (health check over HTTP + load test over Wi-Fi):
#       ORGANIZER_PASSWORD='<the password>' bash scripts/pi-test.sh [--host 10.42.0.1] [--profile devices|full|both] [--smoke]
#
# The load test imports LT00..LT79 into the target database and starts a game: use a REHEARSAL
# database, never the event database (see docs/pi-test.md). Results are saved in pi-test-results/.
set -uo pipefail

HOST="10.42.0.1"
PROFILE="both"
SMOKE=0
ON_PI=0
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="${2:?--host needs a value}"; shift 2 ;;
    --profile) PROFILE="${2:?--profile needs a value}"; shift 2 ;;
    --smoke) SMOKE=1; shift ;;
    --on-pi) ON_PI=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

case "$PROFILE" in devices|full|both) ;; *) echo "--profile must be devices, full or both" >&2; exit 2 ;; esac
if ! printf '%s' "$HOST" | grep -Eq '^[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then echo "--host looks wrong: $HOST" >&2; exit 2; fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/pi-test-results"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$OUT/pi-test-$STAMP.txt"

if [ "$DRY_RUN" = "1" ]; then
  echo "Would write results to $LOG"
  if [ "$ON_PI" = "1" ]; then echo "Would run: bash deploy/check.sh"; exit 0; fi
  echo "Would run: BASE_URL=http://$HOST SKIP_SYSTEMD=1 SKIP_NMCLI=1 bash deploy/check.sh"
  echo "Would run the load test (profile $PROFILE, smoke=$SMOKE) against ws://$HOST (needs ORGANIZER_PASSWORD)"
  exit 0
fi

mkdir -p "$OUT"
{
  echo "Pi test $(date '+%Y-%m-%d %H:%M:%S %Z')  host=$HOST  profile=$PROFILE  smoke=$SMOKE  on-pi=$ON_PI"
  echo "git: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)  node: $(node -v 2>/dev/null || echo missing)"
} | tee "$LOG"

FAILED=0
if [ "$ON_PI" = "1" ]; then
  echo "== Health check (on the Pi) ==" | tee -a "$LOG"
  bash "$ROOT/deploy/check.sh" 2>&1 | tee -a "$LOG" || FAILED=1
  echo "Next: from a laptop on the Pi's Wi-Fi run:  ORGANIZER_PASSWORD=... bash scripts/pi-test.sh" | tee -a "$LOG"
  echo "Results: $LOG"
  exit "$FAILED"
fi

echo "== Health check (over the network) ==" | tee -a "$LOG"
BASE_URL="http://$HOST" SKIP_SYSTEMD=1 SKIP_NMCLI=1 bash "$ROOT/deploy/check.sh" 2>&1 | tee -a "$LOG" || FAILED=1

if [ -z "${ORGANIZER_PASSWORD:-}" ]; then
  echo "ORGANIZER_PASSWORD is not set: skipping the load test." | tee -a "$LOG"
  echo "Results: $LOG"; exit 1
fi
if [ "$FAILED" -ne 0 ]; then
  echo "The health check failed: not running the load test. Fix that first." | tee -a "$LOG"
  echo "Results: $LOG"; exit 1
fi

run_profile() {
  local p="$1"
  echo "== Load test: profile $p ==" | tee -a "$LOG"
  (cd "$ROOT" && LOAD_URL="ws://$HOST" LOAD_PROFILE="$p" LOAD_SMOKE="$SMOKE" npm run --silent load-test) 2>&1 | tee -a "$LOG" || FAILED=1
}
if [ "$PROFILE" = "both" ]; then
  run_profile devices
  echo "The second profile needs the first game to be over; if it fails to start, restart the service on the Pi (sudo systemctl restart showdown) and run:  --profile full" | tee -a "$LOG"
  run_profile full
else
  run_profile "$PROFILE"
fi

echo "Also run 'top' on the Pi during the test and note the node CPU and RES columns (not visible over the network)." | tee -a "$LOG"
if [ "$FAILED" -eq 0 ]; then echo "RESULT: PASS" | tee -a "$LOG"; else echo "RESULT: FAIL (see above)" | tee -a "$LOG"; fi
echo "Results: $LOG"
exit "$FAILED"
