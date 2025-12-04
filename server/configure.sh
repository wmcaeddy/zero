#!/bin/bash
#
# Zero-SPA Server Configuration Script
# Configures fwknop server with generated keys
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
KEYS_FILE="$PROJECT_DIR/shared/generated-keys.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

# Check if keys have been generated
check_keys() {
    if [[ ! -f "$KEYS_FILE" ]]; then
        log_error "Keys file not found: $KEYS_FILE"
        log_error "Please run: $PROJECT_DIR/shared/keygen.sh first"
        exit 1
    fi

    source "$KEYS_FILE"

    if [[ -z "$SPA_KEY_BASE64" || -z "$SPA_HMAC_KEY_BASE64" ]]; then
        log_error "Invalid keys file. Please regenerate keys."
        exit 1
    fi

    log_info "Keys loaded successfully"
}

# Detect network interface
detect_interface() {
    # Try to find the default interface
    DEFAULT_IFACE=$(ip route | grep default | awk '{print $5}' | head -1)

    if [[ -z "$DEFAULT_IFACE" ]]; then
        # Fallback to first non-loopback interface
        DEFAULT_IFACE=$(ip link show | grep -E '^[0-9]+:' | grep -v lo | awk -F: '{print $2}' | tr -d ' ' | head -1)
    fi

    if [[ -z "$DEFAULT_IFACE" ]]; then
        log_warn "Could not detect network interface. Using 'eth0'"
        DEFAULT_IFACE="eth0"
    fi

    log_info "Detected network interface: $DEFAULT_IFACE"
}

# Configure fwknopd.conf
configure_fwknopd() {
    log_step "Configuring /etc/fwknop/fwknopd.conf..."

    # Copy template and update interface
    cp "$SCRIPT_DIR/fwknopd.conf" /etc/fwknop/fwknopd.conf

    # Update interface
    sed -i "s/^PCAP_INTF.*/PCAP_INTF                   $DEFAULT_IFACE;/" /etc/fwknop/fwknopd.conf

    chmod 600 /etc/fwknop/fwknopd.conf

    log_info "fwknopd.conf configured"
}

# Configure access.conf
configure_access() {
    log_step "Configuring /etc/fwknop/access.conf..."

    # Copy template
    cp "$SCRIPT_DIR/access.conf.template" /etc/fwknop/access.conf

    # Replace placeholders with actual keys using awk (safer for base64 special chars)
    awk -v key="$SPA_KEY_BASE64" '{gsub(/__REPLACE_WITH_GENERATED_KEY__/, key)}1' \
        /etc/fwknop/access.conf > /etc/fwknop/access.conf.tmp
    mv /etc/fwknop/access.conf.tmp /etc/fwknop/access.conf

    awk -v key="$SPA_HMAC_KEY_BASE64" '{gsub(/__REPLACE_WITH_GENERATED_HMAC_KEY__/, key)}1' \
        /etc/fwknop/access.conf > /etc/fwknop/access.conf.tmp
    mv /etc/fwknop/access.conf.tmp /etc/fwknop/access.conf

    chmod 600 /etc/fwknop/access.conf

    log_info "access.conf configured"
}

# Validate configuration
validate_config() {
    log_step "Validating configuration..."

    # Test fwknopd configuration
    if fwknopd --test; then
        log_info "Configuration is valid"
    else
        log_error "Configuration validation failed"
        exit 1
    fi
}

# Copy systemd service file
install_service() {
    log_step "Installing systemd service..."

    if [[ -f "$PROJECT_DIR/systemd/fwknop.service" ]]; then
        cp "$PROJECT_DIR/systemd/fwknop.service" /etc/systemd/system/
        systemctl daemon-reload
        systemctl enable fwknop
        log_info "Systemd service installed and enabled"
    else
        log_warn "Systemd service file not found, using package default"
    fi
}

# Print summary
print_summary() {
    echo ""
    log_info "=========================================="
    log_info "Configuration Complete!"
    log_info "=========================================="
    echo ""
    echo "Configuration files:"
    echo "  - /etc/fwknop/fwknopd.conf"
    echo "  - /etc/fwknop/access.conf"
    echo ""
    echo "Protected ports: tcp/22, tcp/8080, tcp/443"
    echo "Access timeout:  30 seconds"
    echo "Network interface: $DEFAULT_IFACE"
    echo ""
    echo "Next steps:"
    echo "  1. Setup firewall:  sudo ./firewall-setup.sh"
    echo "  2. Start service:   sudo systemctl start fwknop"
    echo "  3. Check status:    sudo systemctl status fwknop"
    echo "  4. View logs:       sudo journalctl -u fwknop -f"
    echo ""
    log_warn "IMPORTANT: Share the keys with the client:"
    echo "  Keys file: $KEYS_FILE"
    log_info "=========================================="
}

# Main
main() {
    log_info "=========================================="
    log_info "Zero-SPA Server Configuration"
    log_info "=========================================="

    check_keys
    detect_interface
    configure_fwknopd
    configure_access
    validate_config
    install_service
    print_summary
}

main "$@"
