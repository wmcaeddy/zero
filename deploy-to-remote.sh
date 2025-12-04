#!/bin/bash
#
# Deploy Zero-SPA to remote server and setup local client
#
# Usage: ./deploy-to-remote.sh [user@]host
# Example: ./deploy-to-remote.sh eddy@192.168.2.19
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HOST="${1:-eddy@192.168.2.19}"
REMOTE_PATH="/opt/zero-spa"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       Zero-SPA Remote Deployment                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Remote host: $REMOTE_HOST"
echo "Remote path: $REMOTE_PATH"
echo ""

read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Step 1: Copy project to remote server
log_step "Step 1/4: Copying project to remote server..."
ssh "$REMOTE_HOST" "sudo mkdir -p $REMOTE_PATH && sudo chown \$(whoami) $REMOTE_PATH"
rsync -avz --exclude='.git' --exclude='__pycache__' "$SCRIPT_DIR/" "$REMOTE_HOST:$REMOTE_PATH/"

# Step 2: Run deployment on remote server
log_step "Step 2/4: Running deployment on remote server..."
ssh -t "$REMOTE_HOST" "cd $REMOTE_PATH && sudo ./deploy-server.sh"

# Step 3: Copy keys back to local machine
log_step "Step 3/4: Copying keys to local machine..."
mkdir -p "$HOME/.zero-spa"
scp "$REMOTE_HOST:$REMOTE_PATH/shared/generated-keys.env" "$HOME/.zero-spa/"
scp "$REMOTE_HOST:$REMOTE_PATH/shared/totp-secret.env" "$HOME/.zero-spa/"
chmod 600 "$HOME/.zero-spa/"*

# Step 4: Setup local client
log_step "Step 4/4: Setting up local client..."
"$SCRIPT_DIR/setup-client.sh"

echo ""
log_info "══════════════════════════════════════════════════════════════"
log_info "              Deployment Complete!"
log_info "══════════════════════════════════════════════════════════════"
echo ""
echo "To access the protected service:"
echo "  python3 $SCRIPT_DIR/client/spa-mfa.py --server 192.168.2.19 --port 8080"
echo ""
