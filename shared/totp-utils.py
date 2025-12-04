#!/usr/bin/env python3
"""
Zero-SPA TOTP Utilities

Time-based One-Time Password generation and validation utilities.
Compatible with Google Authenticator, Authy, and other TOTP apps.

Based on RFC 6238 (TOTP) and RFC 4226 (HOTP).
"""

import hmac
import hashlib
import struct
import time
import base64
import secrets
import sys
import os


class TOTP:
    """
    Time-based One-Time Password implementation.

    Generates and validates 6-digit codes that change every 30 seconds,
    compatible with standard authenticator apps.
    """

    def __init__(self, secret: str, digits: int = 6, period: int = 30,
                 algorithm: str = 'SHA1', drift: int = 1):
        """
        Initialize TOTP generator.

        Args:
            secret: Base32-encoded secret key
            digits: Number of digits in OTP (default: 6)
            period: Time period in seconds (default: 30)
            algorithm: Hash algorithm (SHA1, SHA256, SHA512)
            drift: Number of periods to allow for clock drift
        """
        self.secret = secret.replace(' ', '').upper()
        self.digits = digits
        self.period = period
        self.drift = drift

        # Select hash algorithm
        algorithms = {
            'SHA1': hashlib.sha1,
            'SHA256': hashlib.sha256,
            'SHA512': hashlib.sha512
        }
        self.algorithm = algorithms.get(algorithm.upper(), hashlib.sha1)

    def _decode_secret(self) -> bytes:
        """Decode base32 secret to bytes."""
        # Add padding if necessary
        secret = self.secret
        padding = 8 - (len(secret) % 8)
        if padding != 8:
            secret += '=' * padding
        return base64.b32decode(secret)

    def _get_counter(self, timestamp: float = None) -> int:
        """Get the current time counter."""
        if timestamp is None:
            timestamp = time.time()
        return int(timestamp // self.period)

    def _hotp(self, counter: int) -> str:
        """
        Generate HOTP value for a given counter.

        Implements RFC 4226 HOTP algorithm.
        """
        # Decode secret
        key = self._decode_secret()

        # Convert counter to 8-byte big-endian
        counter_bytes = struct.pack('>Q', counter)

        # Generate HMAC
        hmac_digest = hmac.new(key, counter_bytes, self.algorithm).digest()

        # Dynamic truncation
        offset = hmac_digest[-1] & 0x0F
        code = struct.unpack('>I', hmac_digest[offset:offset + 4])[0]
        code &= 0x7FFFFFFF  # Clear top bit

        # Generate code with specified digits
        code = code % (10 ** self.digits)

        return str(code).zfill(self.digits)

    def generate(self, timestamp: float = None) -> str:
        """
        Generate current TOTP code.

        Args:
            timestamp: Optional timestamp (default: current time)

        Returns:
            6-digit OTP code as string
        """
        counter = self._get_counter(timestamp)
        return self._hotp(counter)

    def verify(self, code: str, timestamp: float = None) -> bool:
        """
        Verify a TOTP code.

        Allows for clock drift by checking adjacent time periods.

        Args:
            code: The OTP code to verify
            timestamp: Optional timestamp (default: current time)

        Returns:
            True if code is valid, False otherwise
        """
        if timestamp is None:
            timestamp = time.time()

        code = code.strip()

        # Check current and adjacent periods for clock drift
        for offset in range(-self.drift, self.drift + 1):
            check_time = timestamp + (offset * self.period)
            expected = self.generate(check_time)
            if hmac.compare_digest(code, expected):
                return True

        return False

    def get_remaining_seconds(self) -> int:
        """Get seconds remaining until next code."""
        return self.period - (int(time.time()) % self.period)

    def get_uri(self, issuer: str, account: str) -> str:
        """
        Generate otpauth:// URI for QR code.

        Args:
            issuer: Service name (e.g., "Zero-SPA")
            account: User account (e.g., "user@server")

        Returns:
            otpauth:// URI string
        """
        import urllib.parse

        params = {
            'secret': self.secret,
            'issuer': issuer,
            'algorithm': 'SHA1',
            'digits': str(self.digits),
            'period': str(self.period)
        }

        label = urllib.parse.quote(f"{issuer}:{account}")
        query = urllib.parse.urlencode(params)

        return f"otpauth://totp/{label}?{query}"


def generate_secret(length: int = 20) -> str:
    """
    Generate a cryptographically secure TOTP secret.

    Args:
        length: Number of random bytes (default: 20 = 160 bits)

    Returns:
        Base32-encoded secret
    """
    raw_secret = secrets.token_bytes(length)
    return base64.b32encode(raw_secret).decode('utf-8')


def load_secret_from_file(filepath: str) -> str:
    """
    Load TOTP secret from env file.

    Args:
        filepath: Path to secret file

    Returns:
        TOTP secret string
    """
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if line.startswith('TOTP_SECRET='):
                secret = line.split('=', 1)[1].strip('"\'')
                return secret
    raise ValueError(f"TOTP_SECRET not found in {filepath}")


def main():
    """CLI interface for TOTP utilities."""
    import argparse

    parser = argparse.ArgumentParser(description='Zero-SPA TOTP Utilities')
    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # Generate secret
    gen_parser = subparsers.add_parser('generate', help='Generate new TOTP secret')
    gen_parser.add_argument('--length', type=int, default=20,
                           help='Secret length in bytes (default: 20)')

    # Generate code
    code_parser = subparsers.add_parser('code', help='Generate TOTP code')
    code_parser.add_argument('--secret', help='TOTP secret (or use --file)')
    code_parser.add_argument('--file', help='Load secret from file')

    # Verify code
    verify_parser = subparsers.add_parser('verify', help='Verify TOTP code')
    verify_parser.add_argument('code', help='Code to verify')
    verify_parser.add_argument('--secret', help='TOTP secret (or use --file)')
    verify_parser.add_argument('--file', help='Load secret from file')

    # Generate URI
    uri_parser = subparsers.add_parser('uri', help='Generate otpauth:// URI')
    uri_parser.add_argument('--secret', help='TOTP secret (or use --file)')
    uri_parser.add_argument('--file', help='Load secret from file')
    uri_parser.add_argument('--issuer', default='Zero-SPA', help='Issuer name')
    uri_parser.add_argument('--account', default='user@server', help='Account name')

    args = parser.parse_args()

    if args.command == 'generate':
        secret = generate_secret(args.length)
        print(f"TOTP_SECRET=\"{secret}\"")

    elif args.command == 'code':
        if args.file:
            secret = load_secret_from_file(args.file)
        elif args.secret:
            secret = args.secret
        else:
            print("Error: --secret or --file required", file=sys.stderr)
            sys.exit(1)

        totp = TOTP(secret)
        code = totp.generate()
        remaining = totp.get_remaining_seconds()
        print(f"{code} (expires in {remaining}s)")

    elif args.command == 'verify':
        if args.file:
            secret = load_secret_from_file(args.file)
        elif args.secret:
            secret = args.secret
        else:
            print("Error: --secret or --file required", file=sys.stderr)
            sys.exit(1)

        totp = TOTP(secret)
        if totp.verify(args.code):
            print("Valid")
            sys.exit(0)
        else:
            print("Invalid")
            sys.exit(1)

    elif args.command == 'uri':
        if args.file:
            secret = load_secret_from_file(args.file)
        elif args.secret:
            secret = args.secret
        else:
            print("Error: --secret or --file required", file=sys.stderr)
            sys.exit(1)

        totp = TOTP(secret)
        uri = totp.get_uri(args.issuer, args.account)
        print(uri)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
