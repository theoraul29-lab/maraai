#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/maraai.service"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found. This installer requires systemd."
  exit 1
fi

mkdir -p "$SERVICE_DIR"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=MaraAI Production Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
Environment=NODE_ENV=production
Environment=PORT=5000
ExecStart=/usr/bin/env bash $ROOT_DIR/script/maraai-start-prod.sh
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

if ! systemctl --user daemon-reload; then
  echo "systemd user session is not available in this environment."
  echo "On a normal Linux laptop, run this script in a user login session."
  exit 2
fi

systemctl --user enable maraai.service
systemctl --user restart maraai.service

echo "MaraAI autostart installed."
echo "Check status: systemctl --user status maraai.service"
echo "Follow logs: journalctl --user -u maraai.service -f"
