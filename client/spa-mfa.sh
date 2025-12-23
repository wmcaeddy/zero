#!/bin/bash
#
# Zero-SPA: MFA-Enforced Single Packet Authorization (Shell Version)
#
# A shell-based alternative to spa-mfa.py for environments without Python.
# Requires: fwknop, oathtool (for TOTP)
#
# Usage:
#   ./spa-mfa.sh --server 192.168.2.19 --port 8080
#   ./spa-mfa.sh --server 192.168.2.19 --port 22 --connect ssh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
SERVER=""
PORT=""
PROTOCOL="tcp"
CONNECT_TYPE="http"
SKIP_MFA=false
NO_CONNECT=false
VERBOSE=false
USERNAME="${USER:-root}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Logging functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

# Print usage
usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Zero-SPA: MFA-Enforced Single Packet Authorization

Options:
  -s, --server SERVER    SPA server address (required)
  -p, --port PORT        Port to access (required)
  --protocol PROTO       Protocol: tcp or udp (default: tcp)
  -c, --connect TYPE     Connection type: ssh, http, curl, none (default: http)
  -u, --username USER    Username for SSH (default: \$USER)
  --skip-mfa             Skip MFA verification (not recommended)
  --no-connect           Only send SPA packet, don't connect
  -v, --verbose          Verbose output
  -h, --help             Show this help

Examples:
  $(basename "$0") -s 192.168.2.19 -p 8080
  $(basename "$0") -s 192.168.2.19 -p 22 -c ssh
  $(basename "$0") -s 192.168.2.19 -p 443 --no-connect
EOF
    exit 0
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -s|--server)
                SERVER="$2"
                shift 2
                ;;
            -p|--port)
                PORT="$2"
                shift 2
                ;;
            --protocol)
                PROTOCOL="$2"
                shift 2
                ;;
            -c|--connect)
                CONNECT_TYPE="$2"
                shift 2
                ;;
            -u|--username)
                USERNAME="$2"
                shift 2
                ;;
            --skip-mfa)
                SKIP_MFA=true
                shift
                ;;
            --no-connect)
                NO_CONNECT=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                usage
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                ;;
        esac
    done

    if [[ -z "$SERVER" || -z "$PORT" ]]; then
        log_error "Server and port are required"
        usage
    fi
}

# Check dependencies
check_deps() {
    if ! command -v fwknop &> /dev/null; then
        log_error "fwknop not found. Please install it first."
        exit 1
    fi

    if [[ "$SKIP_MFA" == false ]] && ! command -v oathtool &> /dev/null; then
        log_warn "oathtool not found. Install with: apt install oathtool"
        log_warn "Falling back to Python TOTP..."
    fi
}

# Load TOTP secret
load_totp_secret() {
    TOTP_SECRET=""

    # Try various locations
    for secret_file in \
        "$HOME/.zero-spa/totp-secret.env" \
        "$PROJECT_DIR/shared/totp-secret.env"; do
        if [[ -f "$secret_file" ]]; then
            TOTP_SECRET=$(grep "^TOTP_SECRET=" "$secret_file" | cut -d'=' -f2 | tr -d '"')
            if [[ -n "$TOTP_SECRET" ]]; then
                log_info "Loaded TOTP secret from: $secret_file"
                return 0
            fi
        fi
    done

    log_warn "No TOTP secret found"
    return 1
}

# Verify TOTP code
verify_totp() {
    if [[ -z "$TOTP_SECRET" ]]; then
        log_warn "No TOTP secret configured. Skipping MFA verification."
        return 0
    fi

    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║     MFA Verification Required        ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
    echo ""

    local attempts=3
    while [[ $attempts -gt 0 ]]; do
        read -p "Enter TOTP code from your authenticator app: " code

        # Validate format
        if [[ ! "$code" =~ ^[0-9]{6}$ ]]; then
            log_error "Invalid code format. Please enter 6 digits."
            ((attempts--))
            continue
        fi

        # Verify with oathtool
        if command -v oathtool &> /dev/null; then
            expected=$(oathtool --totp --base32 "$TOTP_SECRET" 2>/dev/null)
            # Also check previous and next codes for clock drift
            expected_prev=$(oathtool --totp --base32 "$TOTP_SECRET" -N "-30sec" 2>/dev/null)
            expected_next=$(oathtool --totp --base32 "$TOTP_SECRET" -N "+30sec" 2>/dev/null)

            if [[ "$code" == "$expected" || "$code" == "$expected_prev" || "$code" == "$expected_next" ]]; then
                log_success "TOTP verification successful!"
                return 0
            fi
        else
            # Fallback to Python
            if python3 "$PROJECT_DIR/shared/totp-utils.py" verify "$code" --secret "$TOTP_SECRET" 2>/dev/null; then
                log_success "TOTP verification successful!"
                return 0
            fi
        fi

        ((attempts--))
        if [[ $attempts -gt 0 ]]; then
            log_error "Invalid code. $attempts attempts remaining."
        fi
    done

    log_error "Maximum attempts exceeded."
    return 1
}

# Send SPA packet
send_spa() {
    log_step "Sending SPA packet to $SERVER for $PROTOCOL/$PORT..."

    local cmd="fwknop -A $PROTOCOL/$PORT -D $SERVER --use-hmac -R"

    # Use stanza if available
    if [[ -f "$HOME/.fwknoprc" ]]; then
        cmd="fwknop -n $SERVER"
    fi

    if [[ "$VERBOSE" == true ]]; then
        cmd="$cmd --verbose"
    fi

    if eval "$cmd"; then
        log_success "SPA packet sent successfully!"
        return 0
    else
        log_error "Failed to send SPA packet"
        return 1
    fi
}

# Wait for port to open
wait_for_port() {
    log_step "Waiting for $SERVER:$PORT to become accessible..."

    local timeout=10
    local elapsed=0

    while [[ $elapsed -lt $timeout ]]; do
        if nc -z -w1 "$SERVER" "$PORT" 2>/dev/null || \
           timeout 1 bash -c "echo > /dev/tcp/$SERVER/$PORT" 2>/dev/null; then
            log_success "Port $PORT is now accessible!"
            return 0
        fi
        sleep 0.5
        ((elapsed++)) || true
    done

    log_warn "Timeout waiting for port $PORT"
    return 1
}

# Connect to service
connect_service() {
    case "$CONNECT_TYPE" in
        ssh)
            log_step "Connecting via SSH..."
            exec ssh "${USERNAME}@${SERVER}" -p "$PORT"
            ;;
        http)
            local url="http://${SERVER}:${PORT}"
            log_success "Access granted! Open in browser: $url"
            # Try to open browser
            xdg-open "$url" 2>/dev/null || open "$url" 2>/dev/null || true
            ;;
        curl)
            local url="http://${SERVER}:${PORT}"
            log_step "Fetching: $url"
            curl -s "$url"
            ;;
        none)
            log_success "Access granted to $SERVER:$PORT"
            log_info "Connect within 30 seconds before access expires"
            ;;
    esac
}

# Main
main() {
    parse_args "$@"

    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║          Zero-SPA: MFA Network Access                 ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""

    check_deps

    # Step 1: MFA
    if [[ "$SKIP_MFA" == false ]]; then
        load_totp_secret
        if ! verify_totp; then
            log_error "MFA verification failed. Access denied."
            exit 1
        fi
    else
        log_warn "MFA verification skipped (--skip-mfa)"
    fi

    echo ""

    # Step 2: SPA
    if ! send_spa; then
        log_error "Failed to send SPA packet. Access denied."
        exit 1
    fi

    # Step 3: Wait
    wait_for_port || true

    # Step 4: Connect
    if [[ "$NO_CONNECT" == false ]]; then
        echo ""
        connect_service
    else
        log_success "Access granted to $SERVER:$PORT"
        log_info "Connect within 30 seconds before access expires"
    fi
}

main "$@"
