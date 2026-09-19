#!/usr/bin/env bash
# ==========================================
# NextLite Voice V3 - Safe Let's Encrypt TLS Bootstrap Script
# Solves the first-boot Nginx SSL certificate dependency issue.
# Usage: ./init-letsencrypt.sh yourdomain.com your-email@example.com
# ==========================================

set -euo pipefail

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <DOMAIN> <EMAIL>"
    echo "Example: $0 voice.example.com admin@example.com"
    exit 1
fi

DOMAIN="$1"
EMAIL="$2"
RSA_KEY_SIZE=4096
DATA_PATH="/opt/nextlite/deployment/certbot"

echo "[$(date)] Starting TLS bootstrap for domain: ${DOMAIN} (${EMAIL})..."

# 1. Create required directories
mkdir -p "${DATA_PATH}/conf/live/${DOMAIN}"
mkdir -p "${DATA_PATH}/www"

# 2. Check if real certificate already exists
if [ -f "${DATA_PATH}/conf/live/${DOMAIN}/fullchain.pem" ]; then
    echo "[$(date)] Existing SSL certificate found for ${DOMAIN}. Verifying renewal..."
    docker run --rm \
      -v "${DATA_PATH}/conf:/etc/letsencrypt" \
      -v "${DATA_PATH}/www:/var/www/certbot" \
      certbot/certbot renew --webroot -w /var/www/certbot --quiet
    docker exec nextlite_nginx nginx -s reload || true
    echo "[$(date)] SSL verification complete."
    exit 0
fi

# 3. Generate temporary self-signed dummy certificate so Nginx can start
echo "[$(date)] Creating temporary self-signed certificate for first Nginx boot..."
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout "${DATA_PATH}/conf/live/${DOMAIN}/privkey.pem" \
  -out "${DATA_PATH}/conf/live/${DOMAIN}/fullchain.pem" \
  -subj "/CN=localhost"

# 4. Start Nginx container
echo "[$(date)] Starting Nginx..."
cd /opt/nextlite/deployment
docker compose -f docker-compose.prod.yml up -d nginx

# 5. Remove dummy certificates
echo "[$(date)] Deleting dummy certificate..."
rm -rf "${DATA_PATH}/conf/live/${DOMAIN}"

# 6. Request real Let's Encrypt certificate via ACME webroot challenge
echo "[$(date)] Requesting official Let's Encrypt certificate from Let's Encrypt CA..."
docker run --rm \
  -v "${DATA_PATH}/conf:/etc/letsencrypt" \
  -v "${DATA_PATH}/www:/var/www/certbot" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
    --email "${EMAIL}" \
    -d "${DOMAIN}" \
    --rsa-key-size "${RSA_KEY_SIZE}" \
    --agree-tos \
    --no-eff-email \
    --force-renewal

# 7. Reload Nginx with production TLS certificates
echo "[$(date)] Reloading Nginx with production certificates..."
docker exec nextlite_nginx nginx -s reload

echo "[$(date)] TLS bootstrap successfully completed! HTTPS is active on https://${DOMAIN}"
