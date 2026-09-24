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
echo '[1/5] Navigating to /opt/nextlite and fixing permissions...'
sudo chown -R `$USER:`$USER /opt/nextlite || true
cd /opt/nextlite

echo '[2/5] Fetching and checking out branch $Branch...'
git fetch origin
git checkout $Branch
git pull origin $Branch

echo '[3/5] Building frontend (apps/web)...'
if [ -d 'apps/web' ]; then
    docker run --rm -v /opt/nextlite/apps/web:/app -w /app node:20-alpine sh -c "npm install && npm run build"
    sudo chown -R `$USER:`$USER /opt/nextlite/apps/web/dist || true
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

$CLEAN_COMMANDS = $REMOTE_COMMANDS.Replace("`r`n", "`n").Replace("`r", "`n")

Write-Host "`nExecuting remote update on Azure VM ($AzureUser@$AzureHost)...`n" -ForegroundColor Yellow

if ($SshKeyPath -ne "") {
    $CLEAN_COMMANDS | ssh -i "$SshKeyPath" "$AzureUser@$AzureHost" "bash -s"
} else {
    $CLEAN_COMMANDS | ssh "$AzureUser@$AzureHost" "bash -s"
}
