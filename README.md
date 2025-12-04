# Zero-SPA: MFA-Enforced Network Access with fwknop

A prototype implementation of Single Packet Authorization (SPA) with Multi-Factor Authentication (MFA/TOTP) for secure network access control on Linux hosts.

## Overview

This project provides MFA-enforced network access similar to Zero Networks, using open-source components:

- **[fwknop](https://github.com/mrash/fwknop)**: Single Packet Authorization for port concealment
- **TOTP**: Time-based One-Time Passwords for multi-factor authentication
- **iptables/nftables**: Host-based firewall for port blocking

## Architecture

```
┌─────────────────┐     1. TOTP Validation      ┌─────────────────┐
│   Client Host   │ ──────────────────────────► │  TOTP Secret    │
│                 │                              │  (Shared)       │
│  ┌───────────┐  │     2. SPA Packet (UDP)     └─────────────────┘
│  │ spa-mfa   │  │ ────────────────────────────────────┐
│  │ (wrapper) │  │                                      │
│  └───────────┘  │                                      ▼
│                 │                              ┌─────────────────┐
│                 │     4. Connect to Service    │  Server Host    │
│                 │ ◄──────────────────────────► │  192.168.2.19   │
└─────────────────┘                              │                 │
                                                 │  ┌───────────┐  │
                                                 │  │ fwknopd   │  │
                                                 │  └─────┬─────┘  │
                                                 │        │        │
                                                 │  3. Open Port   │
                                                 │     (30 sec)    │
                                                 │        ▼        │
                                                 │  ┌───────────┐  │
                                                 │  │ iptables  │  │
                                                 │  │ (DROP→    │  │
                                                 │  │  ACCEPT)  │  │
                                                 │  └───────────┘  │
                                                 │        │        │
                                                 │        ▼        │
                                                 │  ┌───────────┐  │
                                                 │  │ Sample    │  │
                                                 │  │ App:8080  │  │
                                                 │  └───────────┘  │
                                                 └─────────────────┘
```

## Components

```
zero/
├── server/                     # Server-side components (192.168.2.19)
│   ├── install.sh             # Install fwknop server
│   ├── configure.sh           # Configure fwknop and firewall
│   ├── fwknopd.conf           # fwknop daemon configuration
│   ├── access.conf.template   # Access control template
│   ├── firewall-setup.sh      # iptables/nftables rules
│   └── sample-app/            # Sample protected application
│       ├── app.py             # Flask HTTP server
│       └── requirements.txt
│
├── client/                     # Client-side components
│   ├── install.sh             # Install fwknop client
│   ├── spa-mfa.py             # MFA wrapper for fwknop
│   ├── spa-mfa.sh             # Shell wrapper alternative
│   ├── setup-totp.py          # TOTP secret generator
│   └── fwknoprc.template      # Client configuration template
│
├── shared/                     # Shared utilities
│   ├── keygen.sh              # Generate fwknop keys
│   └── totp-utils.py          # TOTP generation/validation
│
├── systemd/                    # Systemd service files
│   ├── fwknop.service         # fwknop daemon service
│   └── sample-app.service     # Sample app service
│
└── docs/
    └── DEPLOYMENT.md          # Step-by-step deployment guide
```

## Quick Start

### Server Setup (192.168.2.19)

```bash
# 1. Clone this repository
git clone https://github.com/yourusername/zero.git
cd zero

# 2. Install fwknop server
sudo ./server/install.sh

# 3. Generate keys
./shared/keygen.sh

# 4. Configure fwknop (edit access.conf with generated keys)
sudo ./server/configure.sh

# 5. Setup firewall rules
sudo ./server/firewall-setup.sh

# 6. Start sample application
cd server/sample-app && pip install -r requirements.txt
python app.py &

# 7. Start fwknop daemon
sudo systemctl start fwknop
```

### Client Setup

```bash
# 1. Install fwknop client
sudo ./client/install.sh

# 2. Setup TOTP (generates QR code for authenticator app)
python3 ./client/setup-totp.py --user eddy --server 192.168.2.19

# 3. Configure client (copy keys from server setup)
./client/configure.sh

# 4. Access the protected service
python3 ./client/spa-mfa.py --server 192.168.2.19 --port 8080
```

## Security Features

| Feature | Description |
|---------|-------------|
| **Port Concealment** | All ports are DROP by default, invisible to port scans |
| **SPA Authentication** | Encrypted, non-replayable single packet opens ports |
| **HMAC Verification** | Cryptographic authentication of SPA packets |
| **TOTP/MFA** | Time-based OTP required before SPA packet is sent |
| **Time-Limited Access** | Ports open for configurable duration (default: 30s) |
| **Source IP Binding** | Access restricted to authenticated client IP |

## Requirements

### Server
- Linux (Ubuntu 20.04+, Debian 11+, RHEL 8+)
- fwknop-server 2.6.8+
- iptables or nftables
- Python 3.8+ (for sample app)

### Client
- Linux, macOS, or Windows (WSL)
- fwknop-client 2.6.8+
- Python 3.8+ (for MFA wrapper)
- TOTP Authenticator app (Google Authenticator, Authy, etc.)

## License

MIT License - See LICENSE file for details.
