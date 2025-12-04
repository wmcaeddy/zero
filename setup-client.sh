#!/bin/bash
#
# Zero-SPA Client Setup Script
# Sets up the local client with keys from ~/.zero-spa/
#
# Usage: ./setup-client.sh
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
CONFIG_DIR="$HOME/.zero-spa"
KEYS_FILE="$CONFIG_DIR/generated-keys.env"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       Zero-SPA Client Setup                                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Install fwknop client
log_step "Step 1/4: Installing fwknop client..."
if ! command -v fwknop &> /dev/null; then
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y fwknop-client
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y fwknop
    elif command -v pacman &> /dev/null; then
        sudo pacman -S --noconfirm fwknop
    else
        log_error "Please install fwknop-client manually"
        exit 1
    fi
fi
log_info "fwknop client: $(fwknop -V 2>&1 | head -1)"

# Step 2: Check for keys
log_step "Step 2/4: Checking for keys..."
if [[ ! -f "$KEYS_FILE" ]]; then
    log_error "Keys file not found: $KEYS_FILE"
    log_info "Please copy keys from server:"
    echo "  scp user@192.168.2.19:/opt/zero-spa/shared/generated-keys.env ~/.zero-spa/"
    echo "  scp user@192.168.2.19:/opt/zero-spa/shared/totp-secret.env ~/.zero-spa/"
    exit 1
fi

# Load keys
source "$KEYS_FILE"

# Step 3: Configure fwknoprc
log_step "Step 3/4: Configuring fwknop client..."
FWKNOPRC="$HOME/.fwknoprc"

cat > "$FWKNOPRC" << EOF
#
# Zero-SPA fwknop Client Configuration
# Generated: $(date)
#

[default]
DIGEST_TYPE             sha256
FW_TIMEOUT              30
SPA_SERVER_PORT         62201
SPA_SERVER_PROTO        udp
USE_HMAC                Y

[192.168.2.19]
ACCESS                  tcp/8080
ALLOW_IP                resolve
SPA_SERVER              192.168.2.19
KEY_BASE64              $SPA_KEY_BASE64
HMAC_KEY_BASE64         $SPA_HMAC_KEY_BASE64
USE_HMAC                Y
FW_TIMEOUT              30
EOF

chmod 600 "$FWKNOPRC"
log_info "Created: $FWKNOPRC"

# Step 4: Setup TOTP
log_step "Step 4/4: Setting up TOTP..."
if [[ -f "$CONFIG_DIR/totp-secret.env" ]]; then
    source "$CONFIG_DIR/totp-secret.env"

    # Display QR code if qrencode is available
    if command -v qrencode &> /dev/null; then
        ISSUER="Zero-SPA"
        ACCOUNT="eddy@192.168.2.19"
        OTP_URI="otpauth://totp/${ISSUER}:${ACCOUNT}?secret=${TOTP_SECRET}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=30"

        echo ""
        echo "Scan this QR code with your authenticator app:"
        echo ""
        qrencode -t ANSIUTF8 "$OTP_URI"
    else
        echo ""
        echo "Add this to your authenticator app manually:"
        echo "  Secret: $TOTP_SECRET"
        echo "  Algorithm: SHA1"
        echo "  Digits: 6"
        echo "  Period: 30 seconds"
    fi
fi

echo ""
log_info "══════════════════════════════════════════════════════════════"
log_info "              Client Setup Complete!"
log_info "══════════════════════════════════════════════════════════════"
echo ""
echo "To access the protected service:"
echo ""
echo "  python3 $SCRIPT_DIR/client/spa-mfa.py --server 192.168.2.19 --port 8080"
echo ""
echo "Or use fwknop directly (without MFA):"
echo ""
echo "  fwknop -n 192.168.2.19"
echo "  curl http://192.168.2.19:8080"
echo ""
log_info "══════════════════════════════════════════════════════════════"
