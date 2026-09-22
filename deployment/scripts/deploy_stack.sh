#!/usr/bin/env bash
set -euo pipefail

cd /opt/nextlite/deployment

echo "=== 1. Generating Production Environment File ==="
POSTGRES_PWD=$(openssl rand -hex 16)
REDIS_PWD=$(openssl rand -hex 16)
JWT_SEC=$(openssl rand -hex 32)
JWT_REF_SEC=$(openssl rand -hex 32)
WORKER_SEC="24d69bf59eaff1dd54f66adf44a4ee4d242b04fa5ee78935a6413959ed861286"
SARVAM_KEY="sk_4fx1a0d8_qIwlS3rcL0OW4DMPt4c03p53"
NVIDIA_KEY="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"
PLIVO_ID="MAYZVINZNKMTKTYJHIYY"
PLIVO_TOK="MjBjZThiNDQtNGU1MS00ODM5LTdmNzItMWVlYzQy"
PLIVO_NUM="+912269850488"
PUBLIC_IP="172.198.153.14"

cat > .env <<EOF
# Production Environment Configuration
NODE_ENV=production
LOG_LEVEL=info

# Database & Cache
POSTGRES_DB=nextlite
POSTGRES_USER=nextlite_user
POSTGRES_PASSWORD=${POSTGRES_PWD}
REDIS_PASSWORD=${REDIS_PWD}

# Security & Authentication
JWT_SECRET=${JWT_SEC}
JWT_REFRESH_SECRET=${JWT_REF_SEC}
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
WORKER_API_SECRET=${WORKER_SEC}

# Telephony (Plivo)
TELEPHONY_PROVIDER=plivo
PLIVO_AUTH_ID=${PLIVO_ID}
PLIVO_AUTH_TOKEN=${PLIVO_TOK}
PLIVO_CALLER_ID=${PLIVO_NUM}
PLIVO_STREAM_HOST=${PUBLIC_IP}

# AI Engines
SARVAM_API_KEY=${SARVAM_KEY}
NVIDIA_API_KEY=${NVIDIA_KEY}
EMBEDDING_PROVIDER=nvidia
STT_MODEL=saaras:v3-realtime
LLM_MODEL=sarvam-2b
TTS_MODEL=bulbul:v2

# URLs
FRONTEND_URL=http://${PUBLIC_IP}
CORS_ORIGIN=*
EOF

chmod 600 .env
echo "Production .env file created."

echo "=== 2. Creating TLS Bootstrap Certificate ==="
mkdir -p certbot/conf/live/yourdomain.com
mkdir -p certbot/www
if [ ! -f certbot/conf/live/yourdomain.com/fullchain.pem ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
      -keyout certbot/conf/live/yourdomain.com/privkey.pem \
      -out certbot/conf/live/yourdomain.com/fullchain.pem \
      -subj "/CN=${PUBLIC_IP}"
fi

echo "=== 3. Starting PostgreSQL & Redis First ==="
docker compose -f docker-compose.prod.yml up -d postgres redis

echo "Waiting for PostgreSQL to be healthy..."
for i in {1..30}; do
    if docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U nextlite_user -d nextlite > /dev/null 2>&1; then
        echo "PostgreSQL is ready!"
        break
    fi
    sleep 2
done

echo "Verifying pgvector extension in PostgreSQL..."
docker compose -f docker-compose.prod.yml exec -T postgres psql -U nextlite_user -d nextlite -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker compose -f docker-compose.prod.yml exec -T postgres psql -U nextlite_user -d nextlite -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"

echo "=== 4. Building & Starting FastAPI API & Pipecat Voice Worker ==="
docker compose -f docker-compose.prod.yml up -d --build api worker

echo "Waiting for API readiness (/api/ready)..."
for i in {1..30}; do
    if curl -s http://localhost:3001/api/ready | grep -q "ready"; then
        echo "API is ready!"
        break
    fi
    sleep 2
done

echo "Waiting for Pipecat Voice Worker (/health)..."
for i in {1..30}; do
    if curl -s http://localhost:8000/health | grep -q "healthy"; then
        echo "Worker is ready!"
        break
    fi
    sleep 2
done

echo "=== 5. Starting Nginx Reverse Proxy ==="
docker compose -f docker-compose.prod.yml up -d nginx

echo "=== 6. Health & Status Summary ==="
docker compose -f docker-compose.prod.yml ps
echo "API Health Check:"
curl -s http://localhost:3001/api/health
echo ""
echo "API Readiness Check:"
curl -s http://localhost:3001/api/ready
echo ""
echo "Worker Health Check:"
curl -s http://localhost:8000/health
echo ""
echo "Nginx Proxy Health Check:"
curl -k -s https://localhost/api/health
echo ""
echo "=== Deployment Completed Successfully ==="
