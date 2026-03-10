#!/usr/bin/env bash
# cspell:words Eeuo pkill cloudflared ngrok nohup maraai
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-5000}"
HOST="${HOST:-0.0.0.0}"

echo "[MaraAI] Project: $PROJECT_DIR"
echo "[MaraAI] Target port: $PORT"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

is_port_available() {
  local port="$1"
  if command_exists ss; then
    ! ss -ltn | awk '{print $4}' | grep -qE "[:.]${port}$"
    return $?
  fi
  if command_exists lsof; then
    ! lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  return 0
}

pick_available_port() {
  local base="$1"
  for offset in $(seq 0 20); do
    local candidate=$((base + offset))
    if is_port_available "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  echo "$base"
}

stop_stale_processes() {
  echo "[MaraAI] Stopping stale MaraAI/tunnel processes..."
  pkill -f "cloudflared tunnel --url" >/dev/null 2>&1 || true
  pkill -f "ngrok http" >/dev/null 2>&1 || true
  pkill -f "tsx server/index.ts" >/dev/null 2>&1 || true
}

install_cloudflared() {
  if command_exists cloudflared; then
    return 0
  fi

  echo "[MaraAI] Installing cloudflared..."
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)
      echo "[MaraAI] Unsupported architecture for automatic cloudflared install: $arch"
      return 1
      ;;
  esac

  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}" -o /tmp/cloudflared
  chmod +x /tmp/cloudflared

  if [[ -w /usr/local/bin ]]; then
    mv /tmp/cloudflared /usr/local/bin/cloudflared
  else
    mkdir -p "$HOME/.local/bin"
    mv /tmp/cloudflared "$HOME/.local/bin/cloudflared"
    export PATH="$HOME/.local/bin:$PATH"
  fi

  command_exists cloudflared
}

install_ngrok() {
  if command_exists ngrok; then
    return 0
  fi

  echo "[MaraAI] Installing ngrok..."
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)
      echo "[MaraAI] Unsupported architecture for automatic ngrok install: $arch"
      return 1
      ;;
  esac

  curl -fsSL "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-${arch}.tgz" -o /tmp/ngrok.tgz
  tar -xzf /tmp/ngrok.tgz -C /tmp

  if [[ -w /usr/local/bin ]]; then
    mv /tmp/ngrok /usr/local/bin/ngrok
  else
    mkdir -p "$HOME/.local/bin"
    mv /tmp/ngrok "$HOME/.local/bin/ngrok"
    export PATH="$HOME/.local/bin:$PATH"
  fi

  command_exists ngrok
}

install_python_requirements_if_present() {
  if [[ -f requirements.txt ]]; then
    echo "[MaraAI] requirements.txt found. Installing Python dependencies..."
    if command_exists python3; then
      python3 -m pip install --upgrade pip
      python3 -m pip install -r requirements.txt
    else
      echo "[MaraAI] python3 not found. Skipping Python requirements install."
    fi
  else
    echo "[MaraAI] No requirements.txt found. Skipping Python dependencies."
  fi
}

ensure_node() {
  if ! command_exists node || ! command_exists npm; then
    echo "[MaraAI] Node.js/npm missing. Please install Node 20+ and rerun."
    exit 1
  fi

  local major
  major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [[ "$major" -lt 20 ]]; then
    echo "[MaraAI] Node version $(node -v) detected; Node 20+ is required."
    echo "[MaraAI] Quick fix (nvm): nvm install 20 && nvm use 20"
    exit 1
  fi
}

install_node_dependencies() {
  echo "[MaraAI] Installing Node dependencies..."
  npm install
}

detect_runtime() {
  if [[ -f package.json ]]; then
    echo "node"
    return 0
  fi
  if [[ -f app.py || -f main.py || -f server.py ]]; then
    echo "python"
    return 0
  fi
  echo "unknown"
}

start_node_app() {
  export PORT HOST
  local cmd
  if npm run | grep -q "start:backend"; then
    cmd="npm run start:backend"
  elif npm run | grep -q "start"; then
    cmd="npm run start"
  else
    cmd="npm run dev"
  fi

  echo "[MaraAI] Starting Node app with: $cmd"
  nohup bash -lc "$cmd" > .maraai-server.log 2>&1 &
  APP_PID=$!
}

start_python_app() {
  export PORT HOST
  local py_entry=""
  for f in app.py main.py server.py; do
    if [[ -f "$f" ]]; then
      py_entry="$f"
      break
    fi
  done
  if [[ -z "$py_entry" ]]; then
    echo "[MaraAI] No Python entry file found (app.py/main.py/server.py)."
    exit 1
  fi
  echo "[MaraAI] Starting Python app: python3 $py_entry"
  nohup python3 "$py_entry" > .maraai-server.log 2>&1 &
  APP_PID=$!
}

wait_for_server() {
  echo "[MaraAI] Waiting for local server startup..."
  for _ in $(seq 1 60); do
    for candidate in $(seq "$PORT" $((PORT + 20))); do
      if curl -fsS "http://127.0.0.1:${candidate}/api/health" >/dev/null 2>&1 || curl -fsS "http://127.0.0.1:${candidate}" >/dev/null 2>&1; then
        PORT="$candidate"
        echo "[MaraAI] Server is up on http://127.0.0.1:${PORT}"
        return 0
      fi
    done
    if [[ -f .maraai-server.log ]] && grep -q "serving on port" .maraai-server.log; then
      local logged
      logged="$(grep -Eo 'serving on port [0-9]+' .maraai-server.log | tail -n 1 | awk '{print $4}')"
      if [[ -n "$logged" ]] && curl -fsS "http://127.0.0.1:${logged}/api/health" >/dev/null 2>&1; then
        PORT="$logged"
        echo "[MaraAI] Server is up on http://127.0.0.1:${PORT}"
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}

install_missing_module_and_retry() {
  if grep -Eq "Cannot find module '([^']+)'" .maraai-server.log; then
    local missing
    missing="$(sed -nE "s/.*Cannot find module '([^']+)'.*/\1/p" .maraai-server.log | head -n 1)"
    if [[ -n "$missing" ]]; then
      echo "[MaraAI] Auto-installing missing npm module: $missing"
      npm install "$missing"
      return 0
    fi
  fi
  return 1
}

open_tunnel() {
  if install_cloudflared; then
    echo "[MaraAI] Opening Cloudflare Tunnel..."
    cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate 2>&1 | tee .maraai-tunnel.log
    return 0
  fi

  if install_ngrok; then
    echo "[MaraAI] Opening ngrok tunnel..."
    ngrok http "$PORT" 2>&1 | tee .maraai-tunnel.log
    return 0
  fi

  echo "[MaraAI] Could not install cloudflared or ngrok automatically."
  return 1
}

cleanup() {
  if [[ -n "${APP_PID:-}" ]] && kill -0 "$APP_PID" >/dev/null 2>&1; then
    kill "$APP_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

RUNTIME="$(detect_runtime)"
echo "[MaraAI] Detected runtime: $RUNTIME"

stop_stale_processes
PORT="$(pick_available_port "$PORT")"
echo "[MaraAI] Using free port: $PORT"

install_python_requirements_if_present

if [[ "$RUNTIME" == "node" ]]; then
  ensure_node
  install_node_dependencies
  start_node_app
elif [[ "$RUNTIME" == "python" ]]; then
  if ! command_exists python3; then
    echo "[MaraAI] python3 is required but not installed."
    exit 1
  fi
  start_python_app
else
  echo "[MaraAI] Could not detect app runtime (Node/Python)."
  exit 1
fi

if ! wait_for_server; then
  echo "[MaraAI] Initial startup failed. Checking for missing modules..."
  if [[ "$RUNTIME" == "node" ]] && install_missing_module_and_retry; then
    if kill -0 "$APP_PID" >/dev/null 2>&1; then
      kill "$APP_PID" || true
    fi
    start_node_app
    wait_for_server || {
      echo "[MaraAI] Server still failed after auto-fix. Recent logs:"
      tail -n 120 .maraai-server.log || true
      exit 1
    }
  else
    echo "[MaraAI] Server failed to start. Recent logs:"
    tail -n 120 .maraai-server.log || true
    exit 1
  fi
fi

echo "[MaraAI] Local server log: $PROJECT_DIR/.maraai-server.log"
echo "[MaraAI] Tunnel log: $PROJECT_DIR/.maraai-tunnel.log"
echo "[MaraAI] Keep this terminal open to keep MaraAI online."
echo "[MaraAI] Searching for public URL in tunnel logs..."

(
  for _ in $(seq 1 40); do
    if [[ -f .maraai-tunnel.log ]]; then
      url="$(grep -Eo 'https://[a-zA-Z0-9.-]+\.(trycloudflare.com|ngrok-free.app|ngrok.io)' .maraai-tunnel.log | head -n 1 || true)"
      if [[ -n "$url" ]]; then
        echo "[MaraAI] Public URL: $url"
        break
      fi
    fi
    sleep 1
  done
) &

open_tunnel