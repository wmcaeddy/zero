#!/bin/bash
#
# Zero-SPA Server Installation Script
# Installs fwknop server and dependencies
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

# Detect package manager
detect_package_manager() {
    if command -v apt-get &> /dev/null; then
        PKG_MANAGER="apt"
        PKG_INSTALL="apt-get install -y"
        PKG_UPDATE="apt-get update"
    elif command -v dnf &> /dev/null; then
        PKG_MANAGER="dnf"
        PKG_INSTALL="dnf install -y"
        PKG_UPDATE="dnf check-update || true"
    elif command -v yum &> /dev/null; then
        PKG_MANAGER="yum"
        PKG_INSTALL="yum install -y"
        PKG_UPDATE="yum check-update || true"
    elif command -v pacman &> /dev/null; then
        PKG_MANAGER="pacman"
        PKG_INSTALL="pacman -S --noconfirm"
        PKG_UPDATE="pacman -Sy"
    else
        log_error "Unsupported package manager"
        exit 1
    fi
    log_info "Detected package manager: $PKG_MANAGER"
}

# Install fwknop server
install_fwknop() {
    log_info "Installing fwknop server..."

    case $PKG_MANAGER in
        apt)
            $PKG_UPDATE
            $PKG_INSTALL fwknop-server fwknop-client libfko3
            ;;
        dnf|yum)
            $PKG_INSTALL epel-release || true
            $PKG_INSTALL fwknop fwknop-server
            ;;
        pacman)
            $PKG_UPDATE
            $PKG_INSTALL fwknop
            ;;
    esac

    # Verify installation
    if command -v fwknopd &> /dev/null; then
        log_info "fwknopd installed successfully: $(fwknopd -V 2>&1 | head -1)"
    else
        log_error "fwknopd installation failed"
        exit 1
    fi
}

# Install additional dependencies
install_dependencies() {
    log_info "Installing additional dependencies..."

    case $PKG_MANAGER in
        apt)
            $PKG_INSTALL iptables python3 python3-pip python3-venv libpcap-dev
            ;;
        dnf|yum)
            $PKG_INSTALL iptables python3 python3-pip libpcap-devel
            ;;
        pacman)
            $PKG_INSTALL iptables python python-pip libpcap
            ;;
    esac
}

# Create required directories
setup_directories() {
    log_info "Setting up directories..."

    mkdir -p /etc/fwknop
    mkdir -p /var/log/fwknop
    mkdir -p /var/run/fwknop

    chmod 700 /etc/fwknop
    chmod 755 /var/log/fwknop
}

# Backup existing configuration
backup_config() {
    if [[ -f /etc/fwknop/access.conf ]]; then
        BACKUP_FILE="/etc/fwknop/access.conf.backup.$(date +%Y%m%d_%H%M%S)"
        log_warn "Backing up existing access.conf to $BACKUP_FILE"
        cp /etc/fwknop/access.conf "$BACKUP_FILE"
    fi

    if [[ -f /etc/fwknop/fwknopd.conf ]]; then
        BACKUP_FILE="/etc/fwknop/fwknopd.conf.backup.$(date +%Y%m%d_%H%M%S)"
        log_warn "Backing up existing fwknopd.conf to $BACKUP_FILE"
        cp /etc/fwknop/fwknopd.conf "$BACKUP_FILE"
    fi
}

# Main installation
main() {
    log_info "=========================================="
    log_info "Zero-SPA Server Installation"
    log_info "=========================================="

    detect_package_manager
    install_dependencies
    install_fwknop
    setup_directories
    backup_config

    log_info "=========================================="
    log_info "Installation complete!"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Generate keys:    ../shared/keygen.sh"
    log_info "  2. Configure server: ./configure.sh"
    log_info "  3. Setup firewall:   ./firewall-setup.sh"
    log_info "  4. Start service:    systemctl start fwknop"
    log_info "=========================================="
}

main "$@"
