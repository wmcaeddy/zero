#!/bin/bash
#
# Zero-SPA Client Installation Script
# Installs fwknop client and MFA dependencies
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            OS="debian"
        elif command -v dnf &> /dev/null; then
            OS="fedora"
        elif command -v yum &> /dev/null; then
            OS="rhel"
        elif command -v pacman &> /dev/null; then
            OS="arch"
        else
            OS="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    else
        OS="unknown"
    fi
    log_info "Detected OS: $OS"
}

# Install fwknop client
install_fwknop() {
    log_info "Installing fwknop client..."

    case $OS in
        debian)
            #!/bin/bash

# Zero Agent Installer (Ubuntu/Debian)

set -e

# Prompt for Admin URL during install
read -p "Enter Zero Admin System URL [https://zer0.up.railway.app]: " ADMIN_URL
ADMIN_URL=${ADMIN_URL:-https://zer0.up.railway.app}

echo "Installing Zero Agent..."
echo "Admin URL: $ADMIN_URL"

# 1. Update and install dependencies
sudo apt-get update
sudo apt-get install -y python3 python3-pip fwknop-client fwknop-server iptables

# 2. Install Python dependencies
echo "Installing Python requirements..."
# Try converting to pip3 install with break-system-packages directly or use apt
# For Ubuntu 24.04 (Noble), we should strictly use apt key packages if available or break for this user script
sudo apt-get install -y python3-flask python3-requests || pip3 install requests flask --break-system-packages

# 3. Setup client directory
INSTALL_DIR="/opt/zero-agent"
sudo mkdir -p "$INSTALL_DIR"
sudo cp client.py config.py api.py firewall.py "$INSTALL_DIR/"
sudo chmod +x "$INSTALL_DIR/client.py"

# Pre-configure config.json
CONFIG_FILE="/root/.zero-client/config.json"
sudo mkdir -p "/root/.zero-client"
echo "{\"admin_url\": \"$ADMIN_URL\", \"username\": null}" | sudo tee "$CONFIG_FILE" > /dev/null

# 4. Create symlink
sudo ln -sf "$INSTALL_DIR/client.py" /usr/local/bin/zero-agent

echo ""
echo "Installation Complete!"
echo "Run 'sudo zero-agent register' to add this host to the Admin System."
echo "Run 'sudo zero-agent daemon' to start protection."
           ;;
        fedora)
            sudo dnf install -y fwknop
            ;;
        rhel)
            sudo yum install -y epel-release
            sudo yum install -y fwknop
            ;;
        arch)
            sudo pacman -S --noconfirm fwknop
            ;;
        macos)
            if command -v brew &> /dev/null; then
                brew install fwknop
            else
                log_error "Homebrew not found. Please install it first."
                exit 1
            fi
            ;;
        *)
            log_error "Unsupported OS. Please install fwknop manually."
            exit 1
            ;;
    esac

    # Verify installation
    if command -v fwknop &> /dev/null; then
        log_info "fwknop installed: $(fwknop -V 2>&1 | head -1)"
    else
        log_error "fwknop installation failed"
        exit 1
    fi
}

# Install Python dependencies
install_python_deps() {
    log_info "Installing Python dependencies..."

    # Check Python version
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 not found. Please install Python 3.8+"
        exit 1
    fi

    PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    log_info "Python version: $PYTHON_VERSION"

    # Install optional QR code library
    pip3 install --user qrcode pillow 2>/dev/null || log_warn "QR code library not installed (optional)"
}

# Install additional tools
install_tools() {
    log_info "Installing additional tools..."

    case $OS in
        debian)
            sudo apt-get install -y qrencode nmap curl
            ;;
        fedora)
            sudo dnf install -y qrencode nmap curl
            ;;
        rhel)
            sudo yum install -y qrencode nmap curl
            ;;
        arch)
            sudo pacman -S --noconfirm qrencode nmap curl
            ;;
        macos)
            brew install qrencode nmap curl
            ;;
    esac
}

# Setup configuration directory
setup_config_dir() {
    log_info "Setting up configuration directory..."

    CONFIG_DIR="$HOME/.zero-spa"
    mkdir -p "$CONFIG_DIR"
    chmod 700 "$CONFIG_DIR"

    log_info "Configuration directory: $CONFIG_DIR"
}

# Make scripts executable
setup_scripts() {
    log_info "Setting up scripts..."

    chmod +x "$SCRIPT_DIR/spa-mfa.py" 2>/dev/null || true
    chmod +x "$SCRIPT_DIR/spa-mfa.sh" 2>/dev/null || true
    chmod +x "$SCRIPT_DIR/setup-totp.py" 2>/dev/null || true

    # Create symlink for easy access
    if [[ -d "$HOME/.local/bin" ]]; then
        ln -sf "$SCRIPT_DIR/spa-mfa.py" "$HOME/.local/bin/spa-mfa"
        log_info "Created symlink: ~/.local/bin/spa-mfa"
    fi
}

# Print summary
print_summary() {
    echo ""
    log_info "=========================================="
    log_info "Client Installation Complete!"
    log_info "=========================================="
    echo ""
    echo "Installed components:"
    echo "  - fwknop client"
    echo "  - Python TOTP utilities"
    echo "  - QR code tools"
    echo ""
    echo "Next steps:"
    echo "  1. Get keys from server administrator"
    echo "  2. Configure client: ./configure-client.sh"
    echo "  3. Setup TOTP: python3 setup-totp.py"
    echo "  4. Test access: python3 spa-mfa.py --server 192.168.2.19 --port 8080"
    echo ""
    log_info "=========================================="
}

# Main
main() {
    log_info "=========================================="
    log_info "Zero-SPA Client Installation"
    log_info "=========================================="

    detect_os
    install_fwknop
    install_python_deps
    install_tools
    setup_config_dir
    setup_scripts
    print_summary
}

main "$@"
