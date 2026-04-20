#!/bin/sh
# Entrypoint for the MaraAI container.
#
# Railway mounts persistent Volumes AS root at container start, masking any
# ownership set during image build. Because the app runs as the unprivileged
# `nodejs` user, we need to fix /data ownership at runtime before dropping
# privileges. Without this, better-sqlite3 crashes on boot with
# SQLITE_CANTOPEN when a Volume is attached at /data.
set -e

mkdir -p /data
chown -R nodejs:nodejs /data 2>/dev/null || true

exec su-exec nodejs:nodejs "$@"
