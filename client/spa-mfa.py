#!/usr/bin/env python3
"""
Zero-SPA: MFA-Enforced Single Packet Authorization Client

This script combines TOTP (Time-based One-Time Password) verification
with fwknop Single Packet Authorization to provide multi-factor
authenticated network access.

Usage:
    python3 spa-mfa.py --server 192.168.2.19 --port 8080
    python3 spa-mfa.py --server 192.168.2.19 --port 22 --connect ssh

Author: Zero-SPA Project
License: MIT
"""

import os
import sys
import subprocess
import argparse
import getpass
import time
import socket
import shutil
from pathlib import Path

# Add shared directory to path for TOTP utilities
SCRIPT_DIR = Path(__file__).parent.absolute()
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_DIR / 'shared'))

try:
    from totp_utils import TOTP, load_secret_from_file
except ImportError:
    # Inline TOTP implementation if module not found
    import hmac
    import hashlib
    import struct
    import base64

    class TOTP:
        def __init__(self, secret, digits=6, period=30):
            self.secret = secret.replace(' ', '').upper()
            self.digits = digits
            self.period = period

        def _decode_secret(self):
            secret = self.secret
            padding = 8 - (len(secret) % 8)
            if padding != 8:
                secret += '=' * padding
            return base64.b32decode(secret)

        def generate(self, timestamp=None):
            if timestamp is None:
                timestamp = time.time()
            counter = int(timestamp // self.period)
            key = self._decode_secret()
            counter_bytes = struct.pack('>Q', counter)
            hmac_digest = hmac.new(key, counter_bytes, hashlib.sha1).digest()
            offset = hmac_digest[-1] & 0x0F
            code = struct.unpack('>I', hmac_digest[offset:offset + 4])[0]
            code &= 0x7FFFFFFF
            code = code % (10 ** self.digits)
            return str(code).zfill(self.digits)

        def verify(self, code, timestamp=None, drift=1):
            if timestamp is None:
                timestamp = time.time()
            code = code.strip()
            for offset in range(-drift, drift + 1):
                check_time = timestamp + (offset * self.period)
                expected = self.generate(check_time)
                if hmac.compare_digest(code, expected):
                    return True
            return False

    def load_secret_from_file(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                if line.strip().startswith('TOTP_SECRET='):
                    return line.split('=', 1)[1].strip().strip('"\'')
        raise ValueError(f"TOTP_SECRET not found in {filepath}")


# ANSI colors
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    CYAN = '\033[0;36m'
    BOLD = '\033[1m'
    NC = '\033[0m'


def log_info(msg):
    print(f"{Colors.GREEN}[INFO]{Colors.NC} {msg}")


def log_warn(msg):
    print(f"{Colors.YELLOW}[WARN]{Colors.NC} {msg}")


def log_error(msg):
    print(f"{Colors.RED}[ERROR]{Colors.NC} {msg}")


def log_step(msg):
    print(f"{Colors.CYAN}[STEP]{Colors.NC} {msg}")


def log_success(msg):
    print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {msg}")


def check_fwknop():
    """Check if fwknop client is installed."""
    if not shutil.which('fwknop'):
        log_error("fwknop client not found. Please install it first.")
        log_info("Ubuntu/Debian: sudo apt install fwknop-client")
        log_info("RHEL/CentOS:   sudo yum install fwknop")
        sys.exit(1)
    return True


def load_config(config_file=None):
    """Load configuration from file or environment."""
    config = {
        'totp_secret': None,
        'spa_key': None,
        'hmac_key': None,
        'fwknoprc': None
    }

    # Try to load TOTP secret
    totp_paths = [
        config_file,
        os.environ.get('ZERO_SPA_TOTP_FILE'),
        PROJECT_DIR / 'shared' / 'totp-secret.env',
        Path.home() / '.zero-spa' / 'totp-secret.env',
    ]

    for path in totp_paths:
        if path and Path(path).exists():
            try:
                config['totp_secret'] = load_secret_from_file(str(path))
                log_info(f"Loaded TOTP secret from: {path}")
                break
            except Exception:
                continue

    # Check for fwknoprc
    fwknoprc_paths = [
        Path.home() / '.fwknoprc',
        PROJECT_DIR / 'client' / 'fwknoprc',
    ]

    for path in fwknoprc_paths:
        if path.exists():
            config['fwknoprc'] = str(path)
            log_info(f"Found fwknoprc: {path}")
            break

    return config


def verify_totp(totp_secret):
    """Prompt for and verify TOTP code."""
    if not totp_secret:
        log_warn("No TOTP secret configured. Skipping MFA verification.")
        return True

    totp = TOTP(totp_secret)

    print()
    print(f"{Colors.BOLD}╔══════════════════════════════════════╗{Colors.NC}")
    print(f"{Colors.BOLD}║     MFA Verification Required        ║{Colors.NC}")
    print(f"{Colors.BOLD}╚══════════════════════════════════════╝{Colors.NC}")
    print()

    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            code = input(f"Enter TOTP code from your authenticator app: ").strip()

            if len(code) != 6 or not code.isdigit():
                log_error("Invalid code format. Please enter 6 digits.")
                continue

            if totp.verify(code):
                log_success("TOTP verification successful!")
                return True
            else:
                remaining = max_attempts - attempt - 1
                if remaining > 0:
                    log_error(f"Invalid code. {remaining} attempts remaining.")
                else:
                    log_error("Maximum attempts exceeded.")

        except KeyboardInterrupt:
            print()
            log_error("Aborted by user.")
            sys.exit(1)

    return False


def send_spa_packet(server, port, protocol='tcp', config=None, verbose=False):
    """Send SPA packet using fwknop."""
    log_step(f"Sending SPA packet to {server} for {protocol}/{port}...")

    cmd = ['fwknop']

    # Add access specification
    cmd.extend(['-A', f'{protocol}/{port}'])

    # Add server
    cmd.extend(['-D', server])

    # Use HMAC
    cmd.append('--use-hmac')

    # Auto-resolve external IP
    cmd.append('-R')

    # Use stanza from fwknoprc if available
    if config and config.get('fwknoprc'):
        # Check if server stanza exists
        cmd.extend(['-n', server])

    # Verbose output
    if verbose:
        cmd.append('--verbose')

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            log_success("SPA packet sent successfully!")
            if verbose and result.stdout:
                print(result.stdout)
            return True
        else:
            log_error(f"fwknop failed: {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        log_error("fwknop timed out")
        return False
    except Exception as e:
        log_error(f"Error running fwknop: {e}")
        return False


def wait_for_port(host, port, timeout=10):
    """Wait for port to become accessible."""
    log_step(f"Waiting for {host}:{port} to become accessible...")

    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((host, port))
            sock.close()

            if result == 0:
                log_success(f"Port {port} is now accessible!")
                return True
        except Exception:
            pass

        time.sleep(0.5)

    log_warn(f"Timeout waiting for port {port}")
    return False


def connect_to_service(server, port, service_type, username=None):
    """Connect to the service after SPA authentication."""
    if service_type == 'ssh':
        user = username or os.environ.get('USER', 'root')
        cmd = ['ssh', f'{user}@{server}', '-p', str(port)]
        log_step(f"Connecting via SSH: {' '.join(cmd)}")
        os.execvp('ssh', cmd)

    elif service_type == 'http':
        url = f"http://{server}:{port}"
        log_success(f"Access granted! Open in browser: {url}")

        # Try to open in browser
        try:
            import webbrowser
            webbrowser.open(url)
        except Exception:
            pass

    elif service_type == 'curl':
        url = f"http://{server}:{port}"
        cmd = ['curl', '-s', url]
        log_step(f"Fetching: {url}")
        subprocess.run(cmd)

    else:
        log_success(f"Access granted to {server}:{port}")
        log_info(f"Port will be accessible for ~30 seconds")


def main():
    parser = argparse.ArgumentParser(
        description='Zero-SPA: MFA-Enforced Single Packet Authorization',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Access web application
  %(prog)s --server 192.168.2.19 --port 8080

  # SSH with MFA
  %(prog)s --server 192.168.2.19 --port 22 --connect ssh

  # Just open the port (don't connect)
  %(prog)s --server 192.168.2.19 --port 443 --no-connect

  # Skip MFA (not recommended)
  %(prog)s --server 192.168.2.19 --port 8080 --skip-mfa
"""
    )

    parser.add_argument('--server', '-s', required=True,
                        help='SPA server address (e.g., 192.168.2.19)')
    parser.add_argument('--port', '-p', type=int, required=True,
                        help='Port to access (e.g., 22, 8080)')
    parser.add_argument('--protocol', default='tcp', choices=['tcp', 'udp'],
                        help='Protocol (default: tcp)')
    parser.add_argument('--connect', '-c', choices=['ssh', 'http', 'curl', 'none'],
                        default='http', help='Service type to connect to')
    parser.add_argument('--username', '-u', help='Username for SSH connection')
    parser.add_argument('--totp-file', help='Path to TOTP secret file')
    parser.add_argument('--skip-mfa', action='store_true',
                        help='Skip MFA verification (not recommended)')
    parser.add_argument('--no-connect', action='store_true',
                        help='Only send SPA packet, do not connect')
    parser.add_argument('--no-wait', action='store_true',
                        help='Do not wait for port to open')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Verbose output')

    args = parser.parse_args()

    print()
    print(f"{Colors.BOLD}╔══════════════════════════════════════════════════════╗{Colors.NC}")
    print(f"{Colors.BOLD}║          Zero-SPA: MFA Network Access                 ║{Colors.NC}")
    print(f"{Colors.BOLD}╚══════════════════════════════════════════════════════╝{Colors.NC}")
    print()

    # Check prerequisites
    check_fwknop()

    # Load configuration
    config = load_config(args.totp_file)

    # Step 1: MFA Verification
    if not args.skip_mfa:
        if not verify_totp(config['totp_secret']):
            log_error("MFA verification failed. Access denied.")
            sys.exit(1)
    else:
        log_warn("MFA verification skipped (--skip-mfa)")

    print()

    # Step 2: Send SPA Packet
    if not send_spa_packet(args.server, args.port, args.protocol,
                           config, args.verbose):
        log_error("Failed to send SPA packet. Access denied.")
        sys.exit(1)

    # Step 3: Wait for port to open
    if not args.no_wait:
        if not wait_for_port(args.server, args.port, timeout=10):
            log_warn("Port may not be accessible yet. Proceeding anyway...")

    # Step 4: Connect to service
    if not args.no_connect and args.connect != 'none':
        print()
        connect_to_service(args.server, args.port, args.connect, args.username)
    else:
        log_success(f"Access granted to {args.server}:{args.port}")
        log_info(f"Connect within 30 seconds before access expires")


if __name__ == '__main__':
    main()
