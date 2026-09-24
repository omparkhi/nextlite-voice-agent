# deploy-azure.ps1
# Script to build frontend and deploy changes directly to Azure Production VM

param (
    [string]$AzureHost = "172.198.153.14",
    [string]$AzureUser = "azureuser",
    [string]$Branch = "migration/node-to-python",
    [string]$SshKeyPath = ""
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " NextLite Azure Production Deployment " -ForegroundColor Green
Write-Host " Target Host: $AzureHost" -ForegroundColor Yellow
Write-Host " Branch:      $Branch" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Cyan

$REMOTE_COMMANDS = @"
set -e
echo '[1/5] Navigating to /opt/nextlite...'
cd /opt/nextlite

echo '[2/5] Fetching and checking out branch $Branch...'
git fetch origin
git checkout $Branch
git pull origin $Branch

echo '[3/5] Building frontend (apps/web)...'
if [ -d 'apps/web' ]; then
    cd apps/web
    if command -v pnpm &> /dev/null; then
        pnpm install --frozen-lockfile || pnpm install
        pnpm build
    elif command -v npm &> /dev/null; then
        npm install
        npm run build
    fi
    cd /opt/nextlite
fi

echo '[4/5] Rebuilding and restarting containers...'
cd /opt/nextlite/deployment
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

echo '[5/5] Checking container status...'
docker compose -f docker-compose.prod.yml ps

echo 'Reloading Nginx to serve new assets...'
docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload || true

echo 'Deployment complete!'
"@

Write-Host "`nExecuting remote update on Azure VM ($AzureUser@$AzureHost)...`n" -ForegroundColor Yellow

if ($SshKeyPath -ne "") {
    ssh -i "$SshKeyPath" "$AzureUser@$AzureHost" "$REMOTE_COMMANDS"
} else {
    ssh "$AzureUser@$AzureHost" "$REMOTE_COMMANDS"
}
