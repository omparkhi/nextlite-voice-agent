#!/usr/bin/env bash
# ==========================================
# NextLite Voice V3 - Emergency / Cost-Guard Safe Shutdown Script
# Gracefully stops all services, performs a pre-shutdown DB backup,
# and flushes disk caches before VM deallocation.
# ==========================================

set -euo pipefail

echo "[$(date)] Initiating graceful shutdown sequence..."

# 1. Trigger database backup prior to shutdown
/opt/nextlite/deployment/scripts/backup-db.sh || echo "[Warning] Pre-shutdown backup encountered an issue, proceeding..."

# 2. Gracefully stop Docker containers
cd /opt/nextlite/deployment
docker compose -f docker-compose.prod.yml stop

# 3. Sync filesystem to ensure all dirty pages are written to persistent SSD
sync

echo "[$(date)] All NextLite containers safely stopped and disk buffers flushed."
