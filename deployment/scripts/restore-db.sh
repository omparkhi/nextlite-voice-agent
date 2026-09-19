#!/usr/bin/env bash
# ==========================================
# NextLite Voice V3 - Database Restore Script
# Restores PostgreSQL database from a compressed backup file
# Usage: ./restore-db.sh /path/to/backup.sql.gz
# ==========================================

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <path_to_backup_file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file '${BACKUP_FILE}' not found!"
    exit 1
fi

read -p "WARNING: Restoring will overwrite existing data in '${POSTGRES_DB:-nextlite}'. Are you sure? (y/N): " CONFIRM
if [[ "${CONFIRM}" != "y" && "${CONFIRM}" != "Y" ]]; then
    echo "Restore canceled."
    exit 0
fi

echo "[$(date)] Restoring database from ${BACKUP_FILE}..."

# Decompress and stream to psql
gunzip -c "${BACKUP_FILE}" | docker exec -i nextlite_postgres psql -U "${POSTGRES_USER:-nextlite_user}" -d "${POSTGRES_DB:-nextlite}"

echo "[$(date)] Database restore completed successfully!"
