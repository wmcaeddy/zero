#!/bin/bash
#
# Zero-SPA Server Deployment Script
# Deploys MFA-protected sample app on port 8080
#
# Usage: ./deploy-server.sh
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

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       Zero-SPA Server Deployment (Port 8080)                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

# Step 1: Install fwknop server
log_step "Step 1/6: Installing fwknop server..."
"$SCRIPT_DIR/server/install.sh"

# Step 2: Generate keys
log_step "Step 2/6: Generating cryptographic keys..."
"$SCRIPT_DIR/shared/keygen.sh"

# Step 3: Configure fwknop
log_step "Step 3/6: Configuring fwknop server..."
"$SCRIPT_DIR/server/configure.sh"

# Step 4: Setup firewall (block port 8080)
log_step "Step 4/6: Setting up firewall rules..."
"$SCRIPT_DIR/server/firewall-setup.sh"

# Step 5: Install sample app dependencies
log_step "Step 5/6: Installing sample app..."
cd "$SCRIPT_DIR/server/sample-app"
pip3 install -r requirements.txt 2>/dev/null || pip install -r requirements.txt

# Step 6: Install and start services
log_step "Step 6/6: Installing systemd services..."

# Copy service files
cp "$SCRIPT_DIR/systemd/fwknop.service" /etc/systemd/system/
cp "$SCRIPT_DIR/systemd/zero-spa-app.service" /etc/systemd/system/

# Update working directory in service file
sed -i "s|/opt/zero-spa|$SCRIPT_DIR|g" /etc/systemd/system/zero-spa-app.service

systemctl daemon-reload
systemctl enable fwknop
systemctl enable zero-spa-app
systemctl restart fwknop
systemctl restart zero-spa-app

# Wait for services
sleep 2

echo ""
log_info "══════════════════════════════════════════════════════════════"
log_info "              Deployment Complete!"
log_info "══════════════════════════════════════════════════════════════"
echo ""
echo "Services status:"
systemctl is-active fwknop && echo "  - fwknop: running" || echo "  - fwknop: NOT running"
systemctl is-active zero-spa-app && echo "  - zero-spa-app: running" || echo "  - zero-spa-app: NOT running"
echo ""
echo "Protected port: 8080 (requires MFA + SPA to access)"
echo ""
echo "Keys generated at:"
echo "  - $SCRIPT_DIR/shared/generated-keys.env"
echo "  - $SCRIPT_DIR/shared/totp-secret.env"
echo ""
log_warn "IMPORTANT: Copy these key files to client machine securely!"
echo ""
echo "Test commands:"
echo "  # Verify port 8080 is blocked:"
echo "  nmap -p 8080 localhost"
echo ""
echo "  # View fwknop logs:"
echo "  journalctl -u fwknop -f"
echo ""
log_info "══════════════════════════════════════════════════════════════"
