#!/usr/bin/env bash
# ==========================================
# NextLite Voice V3 - Automated Database Backup Script
# Creates compressed PostgreSQL dump with timestamp, sets secure
# file permissions, prunes local retention, and optionally uploads
# to Azure Blob Storage or S3-compatible offsite storage.
# ==========================================

set -euo pipefail

BACKUP_DIR="/var/backups/nextlite"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/nextlite_backup_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=7

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[$(date)] Starting NextLite PostgreSQL backup..."

# 1. Dump database directly from container into compressed file
docker exec nextlite_postgres pg_dump -U "${POSTGRES_USER:-nextlite_user}" "${POSTGRES_DB:-nextlite}" | gzip -9 > "${BACKUP_FILE}"
chmod 600 "${BACKUP_FILE}"

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date)] Local backup created successfully: ${BACKUP_FILE} (${FILE_SIZE})"

# 2. Optional Offsite Cloud Storage Upload
UPLOAD_STATUS="LOCAL_ONLY"

# Option A: Azure Blob Storage Upload (if configured)
if [ -n "${AZURE_STORAGE_CONTAINER:-}" ] && [ -n "${AZURE_STORAGE_ACCOUNT:-}" ]; then
    echo "[$(date)] Uploading backup to Azure Blob Storage container: ${AZURE_STORAGE_CONTAINER}..."
    if command -v az &> /dev/null; then
        az storage blob upload \
          --account-name "${AZURE_STORAGE_ACCOUNT}" \
          --container-name "${AZURE_STORAGE_CONTAINER}" \
          --name "database-backups/nextlite_backup_${TIMESTAMP}.sql.gz" \
          --file "${BACKUP_FILE}" \
          --auth-mode login \
          --output none
        UPLOAD_STATUS="AZURE_BLOB_UPLOADED"
        echo "[$(date)] Offsite upload to Azure Blob Storage completed."
    elif command -v azcopy &> /dev/null && [ -n "${AZURE_STORAGE_SAS_TOKEN:-}" ]; then
        azcopy copy "${BACKUP_FILE}" "https://${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${AZURE_STORAGE_CONTAINER}/database-backups/nextlite_backup_${TIMESTAMP}.sql.gz?${AZURE_STORAGE_SAS_TOKEN}" --output-level quiet
        UPLOAD_STATUS="AZURE_BLOB_UPLOADED"
        echo "[$(date)] Offsite upload via azcopy completed."
    else
        echo "[Warning] Azure storage variables present but neither 'az' CLI nor 'azcopy' found on host. Backup remains local only."
    fi

# Option B: S3 / Cloudflare R2 / Backblaze B2 Upload (if configured)
elif [ -n "${S3_BUCKET_NAME:-}" ]; then
    echo "[$(date)] Uploading backup to S3-compatible bucket: ${S3_BUCKET_NAME}..."
    if command -v aws &> /dev/null; then
        aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET_NAME}/database-backups/nextlite_backup_${TIMESTAMP}.sql.gz" --only-show-errors
        UPLOAD_STATUS="S3_UPLOADED"
        echo "[$(date)] Offsite upload to S3 completed."
    elif command -v rclone &> /dev/null; then
        rclone copy "${BACKUP_FILE}" "remote:${S3_BUCKET_NAME}/database-backups/" --quiet
        UPLOAD_STATUS="S3_UPLOADED"
        echo "[$(date)] Offsite upload via rclone completed."
    else
        echo "[Warning] S3_BUCKET_NAME present but neither 'aws' CLI nor 'rclone' found on host. Backup remains local only."
    fi
else
    echo "[Notice] External offsite upload skipped (Neither AZURE_STORAGE_CONTAINER nor S3_BUCKET_NAME configured). Backup is stored LOCALLY ONLY."
fi

# 3. Prune local backups older than retention threshold
find "${BACKUP_DIR}" -name "nextlite_backup_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Local backup retention enforced (> ${RETENTION_DAYS} days pruned). Status: ${UPLOAD_STATUS}"
