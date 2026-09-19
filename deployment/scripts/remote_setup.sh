#!/usr/bin/env bash
set -euo pipefail

echo "=== 1. Configuring 2 GB Swap File ==="
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "vm.swappiness=10" >> /etc/sysctl.conf
    sysctl -p
fi
swapon --show

echo "=== 2. Installing Docker Engine ==="
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release git htop ufw

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

UBUNTU_CODENAME=$(lsb_release -cs)
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME} stable" > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

usermod -aG docker azureuser

echo "=== 3. Configuring Docker Daemon & Log Limits ==="
cat > /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker
systemctl enable docker

echo "=== 4. Cloning NextLite Repository ==="
rm -rf /opt/nextlite
git clone -b migration/node-to-python https://github.com/manan-ios/nextlite-voice-engineering-spec.git /opt/nextlite
chown -R azureuser:azureuser /opt/nextlite

echo "=== 5. Verification ==="
free -h
docker --version
docker compose version
ls -la /opt/nextlite
echo "=== Setup Completed Successfully ==="
