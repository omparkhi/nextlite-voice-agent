# NextLite Voice V3 — Azure Production Deployment Runbook ($100 Budget)

This runbook provides the verified, step-by-step procedure for deploying NextLite Voice V3 on Microsoft Azure within a **$100 credit budget**, ensuring production-grade reliability for Pipecat real-time voice streaming and the FastAPI control plane.

---

## 1. Verified Repository Architecture

| Component | Path | Technology / Version | Port / Transport |
| :--- | :--- | :--- | :--- |
| **Control Plane API** | `apps/api` | Python 3.11+, FastAPI, SQLAlchemy 2.0 (`asyncpg`), Pydantic v2 | Port `3001` (HTTP) |
| **Realtime Voice Worker** | `apps/pipecat-worker` | Python 3.11+, Pipecat 1.8.1, Sarvam AI, WebSockets | Port `8000` (HTTP & WSS) |
| **Frontend Dashboard** | `apps/web` | React 18, Vite 5, Tailwind CSS, TypeScript 5.3 | Port `80` (Static SPA) |
| **Database** | Docker `pgvector/pgvector:pg16` | PostgreSQL 16 with native `pgvector` extension | Port `5432` (Internal) |
| **Cache & Ephemeral State** | Docker `redis:7-alpine` | Redis 7 with LRU eviction & authentication | Port `6379` (Internal) |
| **Reverse Proxy & SSL** | Docker `nginx:alpine` | Nginx with unbuffered WebSocket streaming | Port `80` & `443` |

---

## 2. Infrastructure Sizing & Cost Analysis ($100 Budget)

### Monthly Fixed Azure Infrastructure Costs (Region: Central India `centralindia` / East US `eastus`)

| Azure Resource | SKU / Specifications | Monthly Cost (USD) |
| :--- | :--- | :--- |
| **Virtual Machine** | `Standard_B2s` (2 vCPU, 4 GB RAM, Ubuntu 24.04 LTS) | ~$30.37 |
| **Managed Disk** | 32 GB Standard SSD (`E4` LRS) | ~$2.40 |
| **Public IP Address** | 1x Standard SKU Static IPv4 | ~$3.65 |
| **Data Egress** | ~15 GB Voice Streaming (First 5 GB/mo free) | ~$0.85 |
| **Container Registry** | GitHub Container Registry (`ghcr.io`) | **$0.00** |
| **Frontend CDN** | Azure Static Web Apps (Free Tier) or Vercel | **$0.00** |
| **SSL / TLS Certificate** | Let's Encrypt (Automated via Certbot / Nginx) | **$0.00** |
| **Total Monthly Spend** | — | **~$37.27 / month** |

### Usage-Based Third-Party Provider Costs (Separate from Azure Budget)

| Provider / Item | Rate / Unit | Estimated 500 Minutes / Month |
| :--- | :--- | :--- |
| **Plivo Telephony** | Inbound SIP/PSTN: ~$0.0085 – $0.012 / min | ~$5.00 – $6.00 |
| **Sarvam AI (Speech)** | STT + TTS + LLM: ~$0.004 – $0.006 / min | ~$2.50 – $3.50 |
| **Custom Domain** | Namecheap / Cloudflare registrar | ~$10.00 / year (~$0.83/mo) |
| **External Cloud Backup** | Azure Blob / Cloudflare R2 (~1 GB archive) | ~$0.02 / month |

> [!WARNING]
> **Important Cost & Budget Clarifications**:
> - **Budget Alerts are Notifications**: Azure Cost Management Budget Alerts send email alerts at 50%, 75%, and 90%; they do **not** automatically stop compute charges.
> - **Deallocated VM Costs**: If you stop (deallocate) the VM, compute billing pauses, but the **Managed Disk ($2.40/mo)** and **Static IP ($3.65/mo)** continue to incur ~$6.00/mo.
> - **Runway**: Assuming ~$37.27/mo Azure burn, $100 in credits covers **~80 days (2.6 months)** of continuous 24/7 VM operations.

---

## 3. Step-by-Step Azure Resource Provisioning

Run these commands using the **Azure CLI** on your local workstation:

```bash
# 1. Login to Azure
az login

# 2. Define Variables
RESOURCE_GROUP="rg-nextlite-prod"
LOCATION="centralindia"  # or "eastus"
VM_NAME="vm-nextlite-prod"
VM_SIZE="Standard_B2s"
ADMIN_USERNAME="azureuser"

# 3. Create Resource Group
az group create --name $RESOURCE_GROUP --location $LOCATION

# 4. Create Network Security Group (NSG) with restricted ingress
az network nsg create --resource-group $RESOURCE_GROUP --name "${VM_NAME}-nsg"

# Allow HTTP (Port 80)
az network nsg rule create --resource-group $RESOURCE_GROUP --nsg-name "${VM_NAME}-nsg" \
  --name "Allow-HTTP" --priority 100 --direction Inbound --access Allow \
  --protocol Tcp --source-address-prefixes '*' --destination-port-ranges 80

# Allow HTTPS (Port 443)
az network nsg rule create --resource-group $RESOURCE_GROUP --nsg-name "${VM_NAME}-nsg" \
  --name "Allow-HTTPS" --priority 110 --direction Inbound --access Allow \
  --protocol Tcp --source-address-prefixes '*' --destination-port-ranges 443

# Allow SSH (Port 22) - Restrict to your IP address for security
MY_IP=$(curl -s https://api.ipify.org)
az network nsg rule create --resource-group $RESOURCE_GROUP --nsg-name "${VM_NAME}-nsg" \
  --name "Allow-SSH" --priority 120 --direction Inbound --access Allow \
  --protocol Tcp --source-address-prefixes "${MY_IP}/32" --destination-port-ranges 22

# 5. Create Virtual Machine with Standard SSD
az vm create \
  --resource-group $RESOURCE_GROUP \
  --name $VM_NAME \
  --image "Canonical:ubuntu-24_04-lts:server:latest" \
  --size $VM_SIZE \
  --admin-username $ADMIN_USERNAME \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --os-disk-size-gb 32 \
  --storage-sku StandardSSD_LRS \
  --nsg "${VM_NAME}-nsg"

# 6. Retrieve Static Public IP
PUBLIC_IP=$(az vm list-ip-addresses -g $RESOURCE_GROUP -n $VM_NAME --query "[0].virtualMachine.network.publicIpAddresses[0].ipAddress" -o tsv)
echo "NextLite VM Public IP: ${PUBLIC_IP}"
```

---

## 4. Azure Budget Alerts Setup

```bash
az consumption budget create \
  --budget-name "NextLite-Credit-Budget" \
  --amount 100 \
  --time-grain monthly \
  --start-date "2026-10-01" \
  --end-date "2027-10-01" \
  --notification-threshold 50 \
  --contact-emails "your-email@example.com"
```

---

## 5. VM Setup & Docker Installation

SSH into the Azure VM:

```bash
ssh azureuser@<YOUR_PUBLIC_IP>

# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker & Docker Compose Plugin
sudo apt install -y ca-certificates curl gnupg lsb-release git

sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable Docker for non-root user
sudo usermod -aG docker $USER
newgrp docker
```

---

## 6. Repository Setup & Environment Configuration

```bash
# Clone repository
sudo mkdir -p /opt/nextlite
sudo chown -R $USER:$USER /opt/nextlite
git clone <YOUR_GIT_REPOSITORY_URL> /opt/nextlite
cd /opt/nextlite

# Copy production environment template
cp deployment/env/prod.env.example deployment/.env
chmod 600 deployment/.env

# Populate production secrets (Generate strong JWT tokens with: openssl rand -hex 32)
nano deployment/.env
```

---

## 7. TLS & Let's Encrypt Automated Bootstrap

Run the bootstrap script which handles temporary self-signed cert creation, boots Nginx, and requests official Let's Encrypt certificates without initial startup crash:

```bash
chmod +x /opt/nextlite/deployment/scripts/*.sh

# Run TLS bootstrap (Replace with your actual domain and email)
/opt/nextlite/deployment/scripts/init-letsencrypt.sh voice.yourdomain.com admin@yourdomain.com
```

---

## 8. Starting the NextLite Stack & Schema Verification

```bash
cd /opt/nextlite/deployment

# Start PostgreSQL and Redis first
docker compose -f docker-compose.prod.yml up -d postgres redis

# Verify PostgreSQL and pgvector extension
docker exec nextlite_postgres pg_isready -U nextlite_user -d nextlite
docker exec -i nextlite_postgres psql -U nextlite_user -d nextlite -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker exec -i nextlite_postgres psql -U nextlite_user -d nextlite -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"

# Start API, Worker, and Nginx
docker compose -f docker-compose.prod.yml up -d --build

# Verify running container status
docker compose -f docker-compose.prod.yml ps
```

---

## 9. Plivo Telephony Webhook Setup

In the **Plivo Console** (`https://console.plivo.com/`):
1. Navigate to **Voice** $\rightarrow$ **Applications** $\rightarrow$ **Add New Application**.
2. **Application Name**: `NextLite-Voice-Prod`
3. **Primary Answer URL**: `https://voice.yourdomain.com/plivo/inbound`
4. **Answer URL Method**: `POST`
5. **Fallback Answer URL**: `https://voice.yourdomain.com/plivo/inbound`
6. Assign your rented virtual phone number (DID) to this application.

---

## 10. Health-Checks & Verification Commands

```bash
# 1. API Liveness Probe
curl -s https://api.yourdomain.com/api/health | jq .
# Expected: {"status": "ok", "service": "nextlite-control-plane-python", "version": "3.0.0"}

# 2. API Readiness Probe (Verifies active DB and Redis pings)
curl -s https://api.yourdomain.com/api/ready | jq .
# Expected: {"status": "ready", "ready": true, "database": "connected", "redis": "connected"}

# 3. Pipecat Voice Worker Health Probe
curl -s https://voice.yourdomain.com/health | jq .
# Expected: {"status": "ok", "service": "pipecat-worker", "has_sarvam_key": true}
```

---

## 11. Backup, Restore & Emergency Safe Shutdown

### Database Backup
```bash
# Execute backup
/opt/nextlite/deployment/scripts/backup-db.sh

# Configure automated cron backup at 2:00 AM daily
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/nextlite/deployment/scripts/backup-db.sh >> /var/log/nextlite-backup.log 2>&1") | crontab -
```

### Database Restore
```bash
/opt/nextlite/deployment/scripts/restore-db.sh /var/backups/nextlite/nextlite_backup_20260917_120000.sql.gz
```

### Emergency Safe-Shutdown (Cost Protection)
```bash
/opt/nextlite/deployment/scripts/safe-shutdown.sh
```
