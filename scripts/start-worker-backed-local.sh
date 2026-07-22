#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

ROOT="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." &&
  pwd
)"

KEY_FILE="$HOME/.config/beatvision/worker.env"

fail() {
  echo
  echo "STOP: $*"
  exit 1
}

[ -f "$KEY_FILE" ] ||
  fail "Worker settings were not found at $KEY_FILE"

# shellcheck disable=SC1090
source "$KEY_FILE"

[ -n "${BEATVISION_WORKER_URL:-}" ] ||
  fail "BEATVISION_WORKER_URL is missing."

[ -n "${BEATVISION_WORKER_KEY:-}" ] ||
  fail "BEATVISION_WORKER_KEY is missing."

[ -f "$ROOT/backend/local_server.py" ] ||
  fail "Local text backend is missing."

[ -f "$ROOT/backend/worker_proxy_server.py" ] ||
  fail "Worker proxy is missing."

for CMD in python npm curl; do
  command -v "$CMD" >/dev/null 2>&1 ||
    fail "Missing command: $CMD"
done

mkdir -p "$ROOT/logs"

cat > "$ROOT/frontend/.env" <<'ENV'
REACT_APP_BACKEND_URL=http://127.0.0.1:8000
REACT_APP_IMAGE_TEST_URL=http://127.0.0.1:8001
HOST=0.0.0.0
PORT=3000
BROWSER=none
WDS_SOCKET_HOST=127.0.0.1
WDS_SOCKET_PORT=3000
GENERATE_SOURCEMAP=false
ENV

cd "$ROOT/frontend"

if [ ! -x node_modules/.bin/craco ]; then
  npm ci --legacy-peer-deps
fi

cd "$ROOT"

pkill -f "local_server.py" 2>/dev/null || true
pkill -f "pollinations_test_server.py" 2>/dev/null || true
pkill -f "cloudflare_test_server.py" 2>/dev/null || true
pkill -f "worker_proxy_server.py" 2>/dev/null || true
pkill -f "craco start" 2>/dev/null || true
pkill -f "react-scripts start" 2>/dev/null || true

(
  cd "$ROOT/backend"

  nohup python local_server.py \
    > "$ROOT/logs/backend.log" \
    2>&1 &
)

(
  cd "$ROOT/backend"

  nohup env \
    BEATVISION_WORKER_URL="$BEATVISION_WORKER_URL" \
    BEATVISION_WORKER_KEY="$BEATVISION_WORKER_KEY" \
    python worker_proxy_server.py \
    > "$ROOT/logs/worker-proxy.log" \
    2>&1 &
)

unset BEATVISION_WORKER_KEY

(
  cd "$ROOT/frontend"

  nohup npm start \
    > "$ROOT/logs/frontend.log" \
    2>&1 &
)

echo "Waiting for BeatVision..."

FRONT_CODE="000"
PROXY_STATUS=""

for ATTEMPT in $(seq 1 60); do
  FRONT_CODE="$(
    curl \
      -L \
      -s \
      -o /dev/null \
      -w '%{http_code}' \
      http://127.0.0.1:3000 ||
    true
  )"

  PROXY_STATUS="$(
    curl \
      -s \
      http://127.0.0.1:8001/api/health ||
    true
  )"

  if [ "$FRONT_CODE" = "200" ] &&
     printf '%s' "$PROXY_STATUS" |
       grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'
  then
    break
  fi

  sleep 1
done

[ "$FRONT_CODE" = "200" ] || {
  tail -120 "$ROOT/logs/frontend.log" || true
  fail "Frontend failed to start."
}

printf '%s' "$PROXY_STATUS" |
  grep -q '"status"[[:space:]]*:[[:space:]]*"ok"' || {
    tail -120 "$ROOT/logs/worker-proxy.log" || true
    fail "Worker proxy failed to start."
  }

echo
echo "=================================================="
echo " WORKER-BACKED BEATVISION READY"
echo "=================================================="
echo
echo "Frontend:"
echo "  http://127.0.0.1:3000"
echo
echo "Image Worker:"
echo "  $PROXY_STATUS"
