#!/bin/bash
#
# Zero-SPA Key Generation Script
# Generates cryptographic keys for fwknop SPA and TOTP
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_FILE="$SCRIPT_DIR/generated-keys.env"
TOTP_FILE="$SCRIPT_DIR/totp-secret.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# Generate fwknop keys
generate_fwknop_keys() {
    log_step "Generating fwknop SPA keys..."

    # Check if fwknop is installed
    if command -v fwknop &> /dev/null; then
        # Use fwknop's built-in key generation
        KEY_OUTPUT=$(fwknop --key-gen --key-gen-file /dev/stdout 2>/dev/null)

        SPA_KEY=$(echo "$KEY_OUTPUT" | grep "^KEY_BASE64" | cut -d':' -f2 | tr -d ' ')
        HMAC_KEY=$(echo "$KEY_OUTPUT" | grep "^HMAC_KEY_BASE64" | cut -d':' -f2 | tr -d ' ')
    fi

    # Fallback to openssl if fwknop not available or output unexpected
    if [[ -z "$SPA_KEY" || -z "$HMAC_KEY" ]]; then
        log_warn "Using openssl for key generation..."
        # Use tr -d '\n' to ensure single line output
        SPA_KEY=$(openssl rand -base64 32 | tr -d '\n')
        HMAC_KEY=$(openssl rand -base64 64 | tr -d '\n')
    fi

    log_info "SPA keys generated successfully"
}

# Generate TOTP secret
generate_totp_secret() {
    log_step "Generating TOTP secret..."

    # Generate a 160-bit (20 byte) secret for TOTP
    # Base32 encoded for compatibility with authenticator apps
    TOTP_SECRET=$(python3 -c "
import base64
import secrets
# Generate 20 random bytes (160 bits) for TOTP
raw_secret = secrets.token_bytes(20)
# Encode as base32 (standard for TOTP)
print(base64.b32encode(raw_secret).decode('utf-8'))
" 2>/dev/null || openssl rand -hex 20 | xxd -r -p | base32)

    log_info "TOTP secret generated successfully"
}

# Save keys to files
save_keys() {
    log_step "Saving keys to files..."

    # Backup existing files
    if [[ -f "$KEYS_FILE" ]]; then
        cp "$KEYS_FILE" "${KEYS_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        log_warn "Backed up existing keys file"
    fi

    # Save fwknop keys
    cat > "$KEYS_FILE" << EOF
#
# Zero-SPA Generated Keys
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
#
# IMPORTANT: Keep these keys secure!
# - Do not commit to version control
# - Share securely with authorized clients only
#

# fwknop SPA Encryption Key (Rijndael/AES)
SPA_KEY_BASE64="$SPA_KEY"

# fwknop HMAC Authentication Key
SPA_HMAC_KEY_BASE64="$HMAC_KEY"
EOF

    chmod 600 "$KEYS_FILE"

    # Save TOTP secret
    cat > "$TOTP_FILE" << EOF
#
# Zero-SPA TOTP Secret
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
#
# Add this to your authenticator app (Google Authenticator, Authy, etc.)
#

# TOTP Secret (Base32 encoded)
TOTP_SECRET="$TOTP_SECRET"

# TOTP Configuration
TOTP_DIGITS=6
TOTP_PERIOD=30
TOTP_ALGORITHM=SHA1
EOF

    chmod 600 "$TOTP_FILE"

    log_info "Keys saved to:"
    echo "  - $KEYS_FILE"
    echo "  - $TOTP_FILE"
}

# Generate QR code for TOTP
generate_qr() {
    log_step "Generating TOTP QR code..."

    # Check if qrencode is available
    if command -v qrencode &> /dev/null; then
        ISSUER="Zero-SPA"
        ACCOUNT="eddy@192.168.2.19"
        OTP_URI="otpauth://totp/${ISSUER}:${ACCOUNT}?secret=${TOTP_SECRET}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=30"

        QR_FILE="$SCRIPT_DIR/totp-qr.png"
        qrencode -o "$QR_FILE" -s 10 "$OTP_URI"

        log_info "QR code saved to: $QR_FILE"
        echo ""
        echo "Scan this QR code with your authenticator app:"
        qrencode -t ANSIUTF8 "$OTP_URI" 2>/dev/null || true
    else
        log_warn "qrencode not installed. Install with: apt install qrencode"
        echo ""
        echo "Manual TOTP setup:"
        echo "  Secret: $TOTP_SECRET"
        echo "  Algorithm: SHA1"
        echo "  Digits: 6"
        echo "  Period: 30 seconds"
    fi
}

# Print summary
print_summary() {
    echo ""
    log_info "=========================================="
    log_info "Key Generation Complete!"
    log_info "=========================================="
    echo ""
    echo "Generated files:"
    echo "  - $KEYS_FILE (fwknop keys)"
    echo "  - $TOTP_FILE (TOTP secret)"
    echo ""
    echo "For server configuration:"
    echo "  Copy SPA_KEY_BASE64 and SPA_HMAC_KEY_BASE64 to /etc/fwknop/access.conf"
    echo ""
    echo "For client configuration:"
    echo "  Copy the same keys to ~/.fwknoprc"
    echo "  Add TOTP_SECRET to your authenticator app"
    echo ""
    log_warn "SECURITY: These files contain sensitive keys!"
    log_warn "Do not commit to git or share insecurely."
    log_info "=========================================="
}

# Main
main() {
    log_info "=========================================="
    log_info "Zero-SPA Key Generation"
    log_info "=========================================="

    generate_fwknop_keys
    generate_totp_secret
    save_keys
    generate_qr
    print_summary
}

main "$@"
