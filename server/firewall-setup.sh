#!/bin/bash
#
# Zero-SPA Firewall Setup Script
# Configures iptables/nftables for default-drop policy on protected ports
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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

# Protected ports (should match access.conf OPEN_PORTS)
PROTECTED_PORTS=(8080)

# Detect network interface
detect_interface() {
    DEFAULT_IFACE=$(ip route | grep default | awk '{print $5}' | head -1)
    if [[ -z "$DEFAULT_IFACE" ]]; then
        DEFAULT_IFACE=$(ip link show | grep -E '^[0-9]+:' | grep -v lo | awk -F: '{print $2}' | tr -d ' ' | head -1)
    fi
    echo "$DEFAULT_IFACE"
}

# Check if using nftables or iptables
detect_firewall() {
    if command -v nft &> /dev/null && systemctl is-active --quiet nftables 2>/dev/null; then
        echo "nftables"
    elif command -v iptables &> /dev/null; then
        echo "iptables"
    else
        log_error "No supported firewall found (iptables or nftables)"
        exit 1
    fi
}

# Setup iptables rules
setup_iptables() {
    local iface=$1

    log_step "Setting up iptables rules..."

    # Create fwknop chains if they don't exist
    iptables -N FWKNOP_INPUT 2>/dev/null || true

    # Allow established connections
    iptables -C INPUT -i "$iface" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
        iptables -I INPUT 1 -i "$iface" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # Allow loopback
    iptables -C INPUT -i lo -j ACCEPT 2>/dev/null || \
        iptables -I INPUT 2 -i lo -j ACCEPT

    # Add FWKNOP_INPUT chain to INPUT (fwknop will insert rules here)
    iptables -C INPUT -j FWKNOP_INPUT 2>/dev/null || \
        iptables -I INPUT 3 -j FWKNOP_INPUT

    # Drop protected ports by default
    for port in "${PROTECTED_PORTS[@]}"; do
        log_info "Blocking port $port (will be opened via SPA)"
        iptables -C INPUT -i "$iface" -p tcp --dport "$port" -j DROP 2>/dev/null || \
            iptables -A INPUT -i "$iface" -p tcp --dport "$port" -j DROP
    done

    log_info "iptables rules configured"
}

# Setup nftables rules
setup_nftables() {
    local iface=$1

    log_step "Setting up nftables rules..."

    # Create fwknop table and chain
    nft add table inet fwknop 2>/dev/null || true
    nft add chain inet fwknop input { type filter hook input priority 0 \; } 2>/dev/null || true

    # Flush existing rules
    nft flush chain inet fwknop input

    # Allow established connections
    nft add rule inet fwknop input iif "$iface" ct state established,related accept

    # Allow loopback
    nft add rule inet fwknop input iif lo accept

    # Drop protected ports by default
    for port in "${PROTECTED_PORTS[@]}"; do
        log_info "Blocking port $port (will be opened via SPA)"
        nft add rule inet fwknop input iif "$iface" tcp dport "$port" drop
    done

    log_info "nftables rules configured"
}

# Save iptables rules
save_iptables() {
    log_step "Saving iptables rules..."

    if command -v iptables-save &> /dev/null; then
        iptables-save > /etc/iptables.rules

        # Create restore script
        cat > /etc/network/if-pre-up.d/iptables << 'EOF'
#!/bin/bash
iptables-restore < /etc/iptables.rules
EOF
        chmod +x /etc/network/if-pre-up.d/iptables 2>/dev/null || true

        log_info "iptables rules saved to /etc/iptables.rules"
    fi
}

# Print current rules
print_rules() {
    echo ""
    log_info "Current firewall rules:"
    echo ""

    if [[ "$FW_TYPE" == "iptables" ]]; then
        iptables -L INPUT -n -v --line-numbers | head -20
    else
        nft list chain inet fwknop input
    fi
}

# Print verification instructions
print_verification() {
    local iface=$1

    echo ""
    log_info "=========================================="
    log_info "Firewall Setup Complete!"
    log_info "=========================================="
    echo ""
    echo "Protected ports: ${PROTECTED_PORTS[*]}"
    echo "Interface: $iface"
    echo ""
    echo "Verification commands:"
    echo "  # Check that ports are closed (should show 'filtered'):"
    echo "  nmap -p ${PROTECTED_PORTS[0]} localhost"
    echo ""
    echo "  # View fwknop firewall rules:"
    echo "  fwknopd --fw-list"
    echo ""
    echo "  # Monitor firewall logs:"
    echo "  journalctl -u fwknop -f"
    echo ""
    log_warn "IMPORTANT: Ensure you have console access before testing!"
    log_warn "If you lock yourself out, you'll need console/IPMI access."
    log_info "=========================================="
}

# Main
main() {
    log_info "=========================================="
    log_info "Zero-SPA Firewall Setup"
    log_info "=========================================="

    IFACE=$(detect_interface)
    FW_TYPE=$(detect_firewall)

    log_info "Network interface: $IFACE"
    log_info "Firewall type: $FW_TYPE"

    if [[ "$FW_TYPE" == "iptables" ]]; then
        setup_iptables "$IFACE"
        save_iptables
    else
        setup_nftables "$IFACE"
    fi

    print_rules
    print_verification "$IFACE"
}

main "$@"
