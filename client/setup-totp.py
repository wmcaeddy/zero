#!/usr/bin/env python3
"""
Zero-SPA TOTP Setup Script

Sets up Time-based One-Time Password (TOTP) for MFA authentication.
Generates a secret and displays a QR code for authenticator apps.

Usage:
    python3 setup-totp.py --user eddy --server 192.168.2.19
"""

import os
import sys
import argparse
import base64
import secrets
from pathlib import Path

# Try to import QR code library
try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

# ANSI colors
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    CYAN = '\033[0;36m'
    BOLD = '\033[1m'
    NC = '\033[0m'


def log_info(msg):
    print(f"{Colors.GREEN}[INFO]{Colors.NC} {msg}")


def log_warn(msg):
    print(f"{Colors.YELLOW}[WARN]{Colors.NC} {msg}")


def log_error(msg):
    print(f"{Colors.RED}[ERROR]{Colors.NC} {msg}")


def generate_secret(length=20):
    """Generate a cryptographically secure TOTP secret."""
    raw_secret = secrets.token_bytes(length)
    return base64.b32encode(raw_secret).decode('utf-8')


def generate_otp_uri(secret, issuer, account):
    """Generate otpauth:// URI for QR code."""
    import urllib.parse

    params = {
        'secret': secret,
        'issuer': issuer,
        'algorithm': 'SHA1',
        'digits': '6',
        'period': '30'
    }

    label = urllib.parse.quote(f"{issuer}:{account}")
    query = urllib.parse.urlencode(params)

    return f"otpauth://totp/{label}?{query}"


def print_ascii_qr(data):
    """Print ASCII QR code to terminal."""
    try:
        import subprocess
        result = subprocess.run(
            ['qrencode', '-t', 'ANSIUTF8', data],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print(result.stdout)
            return True
    except Exception:
        pass

    if HAS_QRCODE:
        try:
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=1,
                border=1
            )
            qr.add_data(data)
            qr.make(fit=True)

            # Print to terminal
            qr.print_ascii(invert=True)
            return True
        except Exception:
            pass

    return False


def save_qr_image(data, filepath):
    """Save QR code as image file."""
    if not HAS_QRCODE:
        try:
            import subprocess
            subprocess.run(
                ['qrencode', '-o', str(filepath), '-s', '10', data],
                check=True
            )
            return True
        except Exception:
            return False

    try:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4
        )
        qr.add_data(data)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        img.save(str(filepath))
        return True
    except Exception as e:
        log_error(f"Failed to save QR image: {e}")
        return False


def save_secret(secret, config_dir, server):
    """Save TOTP secret to configuration file."""
    config_dir = Path(config_dir)
    config_dir.mkdir(parents=True, exist_ok=True)

    secret_file = config_dir / 'totp-secret.env'

    with open(secret_file, 'w') as f:
        f.write(f"""#
# Zero-SPA TOTP Secret
# Server: {server}
# Generated: {__import__('datetime').datetime.now().isoformat()}
#
# Add this secret to your authenticator app
# (Google Authenticator, Authy, Microsoft Authenticator, etc.)
#

TOTP_SECRET="{secret}"

# TOTP Configuration
TOTP_DIGITS=6
TOTP_PERIOD=30
TOTP_ALGORITHM=SHA1
""")

    os.chmod(secret_file, 0o600)
    return secret_file


def main():
    parser = argparse.ArgumentParser(
        description='Zero-SPA TOTP Setup',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --user eddy --server 192.168.2.19
  %(prog)s --user admin --server prod.example.com --output ~/totp-qr.png
"""
    )

    parser.add_argument('--user', '-u', default=os.environ.get('USER', 'user'),
                        help='Username for TOTP account')
    parser.add_argument('--server', '-s', default='192.168.2.19',
                        help='Server address')
    parser.add_argument('--issuer', '-i', default='Zero-SPA',
                        help='Issuer name for authenticator app')
    parser.add_argument('--output', '-o', help='Save QR code to file')
    parser.add_argument('--secret', help='Use existing secret instead of generating new one')
    parser.add_argument('--config-dir', default=str(Path.home() / '.zero-spa'),
                        help='Configuration directory')
    parser.add_argument('--no-save', action='store_true',
                        help='Do not save secret to file')

    args = parser.parse_args()

    print()
    print(f"{Colors.BOLD}╔══════════════════════════════════════════════════════╗{Colors.NC}")
    print(f"{Colors.BOLD}║              Zero-SPA TOTP Setup                      ║{Colors.NC}")
    print(f"{Colors.BOLD}╚══════════════════════════════════════════════════════╝{Colors.NC}")
    print()

    # Generate or use provided secret
    if args.secret:
        secret = args.secret.replace(' ', '').upper()
        log_info("Using provided TOTP secret")
    else:
        secret = generate_secret()
        log_info("Generated new TOTP secret")

    # Create account identifier
    account = f"{args.user}@{args.server}"

    # Generate OTP URI
    otp_uri = generate_otp_uri(secret, args.issuer, account)

    print()
    print(f"{Colors.CYAN}Account:{Colors.NC}  {account}")
    print(f"{Colors.CYAN}Issuer:{Colors.NC}   {args.issuer}")
    print(f"{Colors.CYAN}Secret:{Colors.NC}   {secret}")
    print()

    # Display QR code
    print(f"{Colors.BOLD}Scan this QR code with your authenticator app:{Colors.NC}")
    print()

    if not print_ascii_qr(otp_uri):
        log_warn("Could not display QR code in terminal")
        print(f"\nManual setup URI:\n{otp_uri}\n")

    # Save QR code to file if requested
    if args.output:
        output_path = Path(args.output)
        if save_qr_image(otp_uri, output_path):
            log_info(f"QR code saved to: {output_path}")
        else:
            log_warn("Could not save QR code image")

    # Save secret to configuration
    if not args.no_save:
        secret_file = save_secret(secret, args.config_dir, args.server)
        log_info(f"Secret saved to: {secret_file}")

    print()
    print(f"{Colors.BOLD}╔══════════════════════════════════════════════════════╗{Colors.NC}")
    print(f"{Colors.BOLD}║                    Setup Complete                     ║{Colors.NC}")
    print(f"{Colors.BOLD}╚══════════════════════════════════════════════════════╝{Colors.NC}")
    print()
    print("Next steps:")
    print("  1. Scan the QR code with Google Authenticator, Authy, or similar")
    print("  2. Verify the 6-digit code changes every 30 seconds")
    print("  3. Test access:")
    print(f"     python3 spa-mfa.py --server {args.server} --port 8080")
    print()

    # Test current code
    try:
        # Add shared directory to path
        script_dir = Path(__file__).parent.absolute()
        project_dir = script_dir.parent
        sys.path.insert(0, str(project_dir / 'shared'))

        from totp_utils import TOTP
        totp = TOTP(secret)
        current_code = totp.generate()
        remaining = totp.get_remaining_seconds()
        print(f"{Colors.GREEN}Current TOTP code:{Colors.NC} {current_code} (expires in {remaining}s)")
    except Exception:
        pass

    print()


if __name__ == '__main__':
    main()
