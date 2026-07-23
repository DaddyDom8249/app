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

worker_health_ready() {
  local payload="${1:-}"

  printf '%s' "$payload" |
    grep -q '"status"[[:space:]]*:[[:space:]]*"ok"' &&
  printf '%s' "$payload" |
    grep -q '"aiBindingConfigured"[[:space:]]*:[[:space:]]*true' &&
  printf '%s' "$payload" |
    grep -q '"accessKeyConfigured"[[:space:]]*:[[:space:]]*true'
}

[ -f "$KEY_FILE" ] ||
  fail "Worker settings were not found at $KEY_FILE"

# shellcheck disable=SC1090
source "$KEY_FILE"

[ -n "${BEATVISION_WORKER_URL:-}" ] ||
  fail "BEATVISION_WORKER_URL is missing."

[ -n "${BEATVISION_WORKER_KEY:-}" ] ||
  fail "BEATVISION_WORKER_KEY is missing."

[ -f "$ROOT/backend/worker_proxy_server.py" ] ||
  fail "Worker proxy is missing."

for CMD in python npm curl; do
  command -v "$CMD" >/dev/null 2>&1 ||
    fail "Missing command: $CMD"
done

TEXT_BACKEND_LABEL=""
TEXT_BACKEND_COMMAND=()

if [ -f "$ROOT/backend/local_server.py" ]; then
  TEXT_BACKEND_LABEL="local_server.py"
  TEXT_BACKEND_COMMAND=(
    python
    local_server.py
  )
elif [ -f "$ROOT/backend/server.py" ]; then
  python -c 'import uvicorn' >/dev/null 2>&1 ||
    fail "uvicorn is required. Install backend/requirements.txt first."

  TEXT_BACKEND_LABEL="server.py through uvicorn"
  TEXT_BACKEND_COMMAND=(
    python
    -m
    uvicorn
    server:app
    --host
    127.0.0.1
    --port
    8000
  )
else
  fail "No supported text backend entry point was found."
fi

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
  if [ -f package-lock.json ]; then
    npm ci --legacy-peer-deps
  else
    npm install \
      --legacy-peer-deps \
      --package-lock=false
  fi
fi

cd "$ROOT"

pkill -f "local_server.py" 2>/dev/null || true
pkill -f "uvicorn server:app" 2>/dev/null || true
pkill -f "pollinations_test_server.py" 2>/dev/null || true
pkill -f "cloudflare_test_server.py" 2>/dev/null || true
pkill -f "worker_proxy_server.py" 2>/dev/null || true
pkill -f "craco start" 2>/dev/null || true
pkill -f "react-scripts start" 2>/dev/null || true

(
  cd "$ROOT/backend"

  nohup "${TEXT_BACKEND_COMMAND[@]}" \
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
echo "Text backend: $TEXT_BACKEND_LABEL"

FRONT_CODE="000"
PROXY_STATUS=""

for _ in $(seq 1 60); do
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
     worker_health_ready "$PROXY_STATUS"
  then
    break
  fi

  sleep 1
done

[ "$FRONT_CODE" = "200" ] || {
  tail -120 "$ROOT/logs/frontend.log" || true
  fail "Frontend failed to start."
}

worker_health_ready "$PROXY_STATUS" || {
  tail -120 "$ROOT/logs/worker-proxy.log" || true
  fail "Worker is reachable but not fully configured."
}

echo
echo "=================================================="
echo " WORKER-BACKED BEATVISION READY"
echo "=================================================="
echo
echo "Frontend:"
echo "  http://127.0.0.1:3000"
echo
echo "Text backend:"
echo "  $TEXT_BACKEND_LABEL"
echo
echo "Image Worker:"
echo "  $PROXY_STATUS"
