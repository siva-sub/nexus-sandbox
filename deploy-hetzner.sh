#!/bin/bash
set -e

# =============================================================================
# Nexus Sandbox - Hetzner Deployment Script
# Usage: ./deploy-hetzner.sh <SERVER_IP>
# =============================================================================

SERVER_IP=$1
SSH_KEY="$HOME/.ssh/id_ed25519"
REMOTE_USER="root"
REMOTE_DIR="/opt/nexus-sandbox"
ComposeFile="docker-compose.yml"

if [ -z "$SERVER_IP" ]; then
    echo "Usage: ./deploy-hetzner.sh <SERVER_IP>"
    exit 1
fi

echo "🚀 Deploying to $SERVER_IP..."

# 1. Wait for SSH
echo "⏳ Waiting for SSH..."
until ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i $SSH_KEY $REMOTE_USER@$SERVER_IP "echo SSH ready" >/dev/null 2>&1; do
    echo "   ...waiting"
    sleep 5
done

# 2. Install Docker
echo "📦 Installing dependencies..."
ssh -o StrictHostKeyChecking=no -i $SSH_KEY $REMOTE_USER@$SERVER_IP "
    apt-get update && \
    apt-get install -y docker.io docker-compose-v2 rsync
"

# 3. Sync Code
echo "🔄 Syncing code..."
rsync -avz -e "ssh -o StrictHostKeyChecking=no -i $SSH_KEY" \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.venv' \
    --exclude '__pycache__' \
    ./ $REMOTE_USER@$SERVER_IP:$REMOTE_DIR

# 4. Start Services
echo "🚀 Starting services..."
ssh -o StrictHostKeyChecking=no -i $SSH_KEY $REMOTE_USER@$SERVER_IP "
    cd $REMOTE_DIR && \
    docker compose -f $ComposeFile up -d --build --remove-orphans
"

echo "✅ Deployment complete!"
echo "   Dashboard: http://$SERVER_IP:8080"
echo "   Gateway:   http://$SERVER_IP:8000/docs"
