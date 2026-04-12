#!/bin/sh
# Ollama startup script for MaraAI Railway deployment
#
# 1. Starts the Ollama server in the background
# 2. Optionally pulls the configured model (OLLAMA_PULL_ON_START=true)
# 3. Keeps the server running in the foreground

set -e

MODEL="${OLLAMA_MODEL:-llama3.2:1b}"
PULL="${OLLAMA_PULL_ON_START:-true}"

echo "[ollama-entrypoint] Starting Ollama server (model: ${MODEL})"

# Start server in background
ollama serve &
SERVER_PID=$!

# Wait for server to be ready (max 30s)
echo "[ollama-entrypoint] Waiting for Ollama server to be ready..."
for i in $(seq 1 30); do
  if ollama list > /dev/null 2>&1; then
    echo "[ollama-entrypoint] Server is ready."
    break
  fi
  sleep 1
done

# Optionally pull the model
if [ "$PULL" = "true" ]; then
  echo "[ollama-entrypoint] Pulling model: ${MODEL}"
  if ollama pull "${MODEL}"; then
    echo "[ollama-entrypoint] Model pull complete."
  else
    echo "[ollama-entrypoint] WARNING: Model pull failed. Service will still start; pull may retry on first request."
  fi
else
  echo "[ollama-entrypoint] Skipping model pull (OLLAMA_PULL_ON_START=false)."
fi

echo "[ollama-entrypoint] Ollama ready. Waiting for server process..."
wait "$SERVER_PID"
