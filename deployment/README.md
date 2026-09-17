# NextLite Voice V3 — Azure Production Deployment Guide

This guide details the exact step-by-step procedure for deploying NextLite Voice V3 on a single Microsoft Azure Virtual Machine running Ubuntu 24.04 LTS using Systemd, Caddy, PostgreSQL, and Redis.

---

## 1. Required Azure VM Characteristics

| Attribute | Specification |
| :--- | :--- |
| **Recommended SKU** | `Standard_D4s_v5` (or `Standard_B4ms` for cost-optimized burstable workloads) |
| **vCPU** | 4 vCPUs |
| **RAM** | 16 GB |
| **OS Disk** | 64 GB Premium SSD (Managed Disk) |
| **Public IP** | Static IPv4 (Standard SKU) |

---

## 2. Required Ubuntu Version
- **Ubuntu 24.04 LTS (Noble Numbat)**, 64-bit (x86_64).

---

## 3. Required OS Packages
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  build-essential \
  curl \
  git \
  pkg-config \
  libasound2-dev \
  libsox-dev \
  software-properties-common \
  debian-keyring \
  debian-archive-keyring \
  apt-transport-https
```

---

## 4. Python Version
- **Python 3.11** or **Python 3.12** with `venv` and `pip`:
```bash
sudo apt install -y python3 python3-venv python3-pip
python3 --version
```

---

## 5. Node.js Version
- **Node.js 20+ LTS** (Required for building the frontend React dashboard):
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

---

## 6. PostgreSQL Setup
Install and configure PostgreSQL 16:
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# Create NextLite Database & Dedicated User
sudo -u postgres psql -c "CREATE USER nextlite_user WITH PASSWORD 'CHANGE_ME_STRONG_DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE nextlite OWNER nextlite_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE nextlite TO nextlite_user;"
```

---

## 7. Redis Setup
Install and configure Redis 7:
```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server

# Verify Redis connection
redis-cli ping
# Output: PONG
```

---

## 8. Directory Layout & User Setup
Create dedicated system user `nextlite` and deployment directories:
```bash
# Create system user
sudo useradd -r -s /bin/false -d /opt/nextlite nextlite

# Create application & configuration directories
sudo mkdir -p /opt/nextlite
sudo mkdir -p /etc/nextlite
sudo mkdir -p /var/log/nextlite
sudo mkdir -p /var/log/caddy

# Set ownership
sudo chown -R nextlite:nextlite /opt/nextlite /etc/nextlite /var/log/nextlite /var/log/caddy
```

---

## 9. Virtual Environment Creation & Dependencies
Clone the repository and build the Python virtual environment:
```bash
cd /opt/nextlite
sudo -u nextlite git clone -b migration/node-to-python <YOUR_REPOSITORY_URL> .

# Create virtualenv
sudo -u nextlite python3 -m venv /opt/nextlite/apps/pipecat-worker/.venv

# Install Python dependencies
sudo -u nextlite /opt/nextlite/apps/pipecat-worker/.venv/bin/pip install --upgrade pip
sudo -u nextlite /opt/nextlite/apps/pipecat-worker/.venv/bin/pip install -e /opt/nextlite/apps/pipecat-worker
sudo -u nextlite /opt/nextlite/apps/pipecat-worker/.venv/bin/pip install \
  fastapi>=0.115.0 \
  uvicorn[standard]>=0.30.0 \
  sqlalchemy>=2.0.0 \
  asyncpg>=0.29.0 \
  redis>=5.0.0 \
  pydantic-settings>=2.4.0 \
  httpx>=0.27.0 \
  loguru>=0.7.2 \
  bcrypt>=4.0.0 \
  python-jose[cryptography]>=3.3.0 \
  pydantic>=2.8.0

# Install Node.js workspace dependencies for frontend
sudo -u nextlite npm ci
```

---

## 10. Environment File Installation
Copy environment templates to `/etc/nextlite/` and configure real credentials:
```bash
sudo cp /opt/nextlite/deployment/env/api.env.example /etc/nextlite/api.env
sudo cp /opt/nextlite/deployment/env/worker.env.example /etc/nextlite/worker.env

# Secure file permissions (Root read/write only)
sudo chmod 600 /etc/nextlite/api.env /etc/nextlite/worker.env
sudo chown nextlite:nextlite /etc/nextlite/api.env /etc/nextlite/worker.env

# Edit environment variables with production secrets
sudo nano /etc/nextlite/api.env
sudo nano /etc/nextlite/worker.env
```

---

## 11. Database Migration Procedure
Apply canonical PostgreSQL migrations to the local database instance:

```bash
cd /opt/nextlite/apps/api/drizzle
for sql_file in $(ls -v *.sql); do
  echo "Applying migration: $sql_file"
  PGPASSWORD="CHANGE_ME_STRONG_DB_PASSWORD" psql -h 127.0.0.1 -U nextlite_user -d nextlite -f "$sql_file"
done
```

---

## 12. Systemd Installation
Install and register NextLite services:
```bash
sudo cp /opt/nextlite/deployment/systemd/nextlite-api.service /etc/systemd/system/
sudo cp /opt/nextlite/deployment/systemd/nextlite-worker.service /etc/systemd/system/

sudo systemctl daemon-reload
```

---

## 13. Caddy Installation
Install Caddy Web Server on Ubuntu:
```bash
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

---

## 14. TLS & Domain Setup
1. Assign your public domain (e.g., `voice.example.com`) to the Azure Public IP in your DNS provider (`A` record).
2. Configure Caddy:
```bash
sudo cp /opt/nextlite/deployment/caddy/Caddyfile.example /etc/caddy/Caddyfile
# Replace voice.example.com with your actual domain
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
Caddy will automatically request and install a Let's Encrypt TLS certificate.

---

## 15. Frontend Build
Build the production React single page application:
```bash
cd /opt/nextlite
# Set VITE_API_URL to empty so all requests use relative /api paths under the same domain
sudo -u nextlite VITE_API_URL= npm run build:web
```
The output directory `/opt/nextlite/apps/web/dist` is served directly by Caddy.

---

## 16. Service Startup
Enable and launch all services:
```bash
sudo systemctl enable --now nextlite-api
sudo systemctl enable --now nextlite-worker

# Verify status
sudo systemctl status nextlite-api
sudo systemctl status nextlite-worker
```

---

## 17. Health Checks
Verify all services are responding correctly:

```bash
# 1. Check API Health
curl -s http://127.0.0.1:3001/api/health | jq .
# Expected: { "status": "ok", "service": "nextlite-control-plane-python", "version": "3.0.0", ... }

# 2. Check API Readiness (DB + Redis)
curl -s http://127.0.0.1:3001/api/ready | jq .
# Expected: { "status": "ready", "ready": true, "database": "connected", "redis": "connected" }

# 3. Check Worker Health
curl -s http://127.0.0.1:8000/health | jq .
# Expected: { "status": "ok", "service": "pipecat-worker", ... }

# 4. Check Public HTTPS Ingress
curl -s https://voice.example.com/health | jq .
curl -s https://voice.example.com/api/health | jq .
```

---

## 18. Plivo Telephony Configuration
1. Log in to the [Plivo Console](https://console.plivo.com/).
2. Navigate to **Phone Numbers** -> Select your DID (e.g., `+919876543210`).
3. Set **Primary Answer URL** to:
   ```text
   https://voice.example.com/plivo/test-xml?deploymentId=<YOUR_DEPLOYMENT_UUID>
   ```
4. Set HTTP Method to `POST` or `GET`.
5. Dial the number from any PSTN mobile phone to initiate the call.

---

## 19. Rollback Procedure
If a deployment fails:
```bash
# 1. Stop services
sudo systemctl stop nextlite-worker nextlite-api

# 2. Checkout previous known-good commit
cd /opt/nextlite
sudo -u nextlite git checkout 1f142d3

# 3. Rebuild frontend
sudo -u nextlite VITE_API_URL= npm run build:web

# 4. Restart services
sudo systemctl restart nextlite-api nextlite-worker
```

---

## 20. Log Commands
Use `journalctl` to inspect live structured logs:

```bash
# View API logs in real time
sudo journalctl -u nextlite-api -f -o cat

# View Worker logs in real time (Turn timing, Sarvam STT/LLM/TTS, Plivo frames)
sudo journalctl -u nextlite-worker -f -o cat

# View Caddy access & error logs
sudo journalctl -u caddy -f -o cat
sudo tail -f /var/log/caddy/nextlite_access.log
```
