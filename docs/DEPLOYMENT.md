# Zero-SPA Deployment Guide

Step-by-step guide for deploying MFA-enforced Single Packet Authorization.

## Overview

This guide covers:
1. Server setup on 192.168.2.19
2. Client setup on your local machine
3. Testing the complete flow
4. Troubleshooting common issues

## Prerequisites

### Server (192.168.2.19)
- Linux (Ubuntu 20.04+, Debian 11+, RHEL 8+)
- Root access
- Network interface accessible from client
- Ports 62201/udp (SPA), 8080/tcp (sample app)

### Client
- Linux, macOS, or Windows (WSL)
- Python 3.8+
- Network access to server

---

## Part 1: Server Setup (192.168.2.19)

### Step 1.1: Clone Repository

```bash
# SSH into server
ssh eddy@192.168.2.19

# Clone repository
git clone https://github.com/yourusername/zero.git /opt/zero-spa
cd /opt/zero-spa
```

### Step 1.2: Install fwknop Server

```bash
# Run installation script
sudo ./server/install.sh
```

This installs:
- fwknop-server
- iptables/nftables
- Python 3 + Flask (for sample app)

### Step 1.3: Generate Cryptographic Keys

```bash
# Generate SPA and TOTP keys
./shared/keygen.sh
```

Output files:
- `shared/generated-keys.env` - fwknop SPA keys
- `shared/totp-secret.env` - TOTP secret for MFA
- `shared/totp-qr.png` - QR code for authenticator app

**IMPORTANT**: Save these files securely! You'll need to transfer them to the client.

### Step 1.4: Configure fwknop Server

```bash
# Configure fwknop with generated keys
sudo ./server/configure.sh
```

Verify configuration:
```bash
sudo fwknopd --test
```

### Step 1.5: Setup Firewall Rules

```bash
# Configure iptables to block protected ports
sudo ./server/firewall-setup.sh
```

Verify ports are blocked:
```bash
# From another machine
nmap -p 22,8080,443 192.168.2.19
# Should show "filtered" for all ports
```

### Step 1.6: Start Sample Application

```bash
# Install Python dependencies
cd /opt/zero-spa/server/sample-app
pip3 install -r requirements.txt

# Run sample app (for testing)
python3 app.py &

# Or install as systemd service
sudo cp /opt/zero-spa/systemd/zero-spa-app.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable zero-spa-app
sudo systemctl start zero-spa-app
```

### Step 1.7: Start fwknop Daemon

```bash
# Install systemd service
sudo cp /opt/zero-spa/systemd/fwknop.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable fwknop
sudo systemctl start fwknop

# Check status
sudo systemctl status fwknop
```

### Step 1.8: Verify Server Setup

```bash
# Check fwknop is running
sudo fwknopd --fw-list

# Check sample app is running
curl -s http://localhost:8080/health

# Check logs
sudo journalctl -u fwknop -f
```

---

## Part 2: Client Setup

### Step 2.1: Install fwknop Client

```bash
# Clone repository (if not already done)
git clone https://github.com/yourusername/zero.git ~/zero-spa
cd ~/zero-spa

# Run installation
./client/install.sh
```

### Step 2.2: Transfer Keys from Server

Securely copy keys from server:

```bash
# On client, copy keys from server
scp eddy@192.168.2.19:/opt/zero-spa/shared/generated-keys.env ~/zero-spa/shared/
scp eddy@192.168.2.19:/opt/zero-spa/shared/totp-secret.env ~/zero-spa/shared/

# Or copy to ~/.zero-spa/
mkdir -p ~/.zero-spa
scp eddy@192.168.2.19:/opt/zero-spa/shared/totp-secret.env ~/.zero-spa/
```

### Step 2.3: Configure fwknop Client

```bash
# Copy and edit fwknoprc template
cp ~/zero-spa/client/fwknoprc.template ~/.fwknoprc
chmod 600 ~/.fwknoprc

# Edit with your keys
nano ~/.fwknoprc
```

Replace these values in `~/.fwknoprc`:
```
KEY_BASE64              <value from generated-keys.env: SPA_KEY_BASE64>
HMAC_KEY_BASE64         <value from generated-keys.env: SPA_HMAC_KEY_BASE64>
```

### Step 2.4: Setup TOTP Authenticator

```bash
# Setup TOTP (displays QR code)
python3 ~/zero-spa/client/setup-totp.py --user eddy --server 192.168.2.19
```

Scan the QR code with your authenticator app:
- Google Authenticator
- Authy
- Microsoft Authenticator
- 1Password
- Bitwarden

---

## Part 3: Testing

### Test 1: Verify Port is Blocked

```bash
# Before SPA, port should be filtered/closed
nmap -p 8080 192.168.2.19
# Expected: PORT     STATE    SERVICE
#           8080/tcp filtered http-alt
```

### Test 2: Send SPA Packet Without MFA

```bash
# Test fwknop directly (skips MFA)
fwknop -n 192.168.2.19 --verbose

# Port should now be open for 30 seconds
nmap -p 8080 192.168.2.19
# Expected: PORT     STATE SERVICE
#           8080/tcp open  http-alt
```

### Test 3: Complete MFA Flow

```bash
# Use the full MFA wrapper
python3 ~/zero-spa/client/spa-mfa.py --server 192.168.2.19 --port 8080

# You'll be prompted for TOTP code
# Enter 6-digit code from authenticator app
```

### Test 4: Access Sample Application

After successful MFA + SPA:
```bash
# Via curl
curl http://192.168.2.19:8080/

# Via browser
# Open: http://192.168.2.19:8080/
```

### Test 5: SSH Access

```bash
# SSH with MFA
python3 ~/zero-spa/client/spa-mfa.py \
    --server 192.168.2.19 \
    --port 22 \
    --connect ssh \
    --username eddy
```

---

## Part 4: Production Hardening

### 4.1: Secure Key Storage

```bash
# Use encrypted storage for keys
# Option 1: LUKS encrypted partition
# Option 2: HashiCorp Vault
# Option 3: Hardware security module (HSM)

# At minimum, restrict file permissions
chmod 600 ~/.fwknoprc
chmod 600 ~/.zero-spa/totp-secret.env
```

### 4.2: Enable GnuPG Encryption

For higher security, use asymmetric encryption:

```bash
# Server: Generate GPG key
gpg --gen-key

# Client: Generate GPG key
gpg --gen-key

# Exchange public keys
# Configure access.conf to use GPG_REMOTE_ID
```

### 4.3: Audit Logging

```bash
# Enable detailed logging in fwknopd.conf
VERBOSE                     Y;

# Send logs to centralized SIEM
# Configure rsyslog to forward /var/log/fwknop/*
```

### 4.4: Intrusion Detection

```bash
# Monitor for failed SPA attempts
sudo grep "SPA packet from" /var/log/syslog | grep -i "fail\|reject\|invalid"

# Set up alerting for suspicious activity
```

---

## Troubleshooting

### Issue: "fwknop: command not found"

```bash
# Ubuntu/Debian
sudo apt install fwknop-client fwknop-server

# RHEL/CentOS
sudo yum install epel-release
sudo yum install fwknop
```

### Issue: SPA packet not received

```bash
# Check server is listening
sudo tcpdump -i eth0 port 62201

# Check firewall allows UDP 62201
sudo iptables -L -n | grep 62201

# Check fwknopd is running
sudo systemctl status fwknop
```

### Issue: Port doesn't open after SPA

```bash
# Check fwknopd logs
sudo journalctl -u fwknop -n 50

# Check iptables rules
sudo fwknopd --fw-list

# Verify keys match between client and server
# Compare KEY_BASE64 and HMAC_KEY_BASE64
```

### Issue: TOTP code rejected

```bash
# Check system time is synchronized
timedatectl status

# Sync NTP
sudo timedatectl set-ntp true

# TOTP allows 30-second drift by default
# If clocks differ by more, codes will fail
```

### Issue: Connection refused after SPA

```bash
# Verify the target service is running
sudo ss -tlnp | grep 8080

# Check if firewall rule was actually added
sudo iptables -L FWKNOP_INPUT -n -v
```

---

## Quick Reference

### Server Commands
```bash
# Start fwknop
sudo systemctl start fwknop

# Stop fwknop
sudo systemctl stop fwknop

# View logs
sudo journalctl -u fwknop -f

# Test config
sudo fwknopd --test

# List active rules
sudo fwknopd --fw-list
```

### Client Commands
```bash
# MFA access to HTTP service
python3 spa-mfa.py -s 192.168.2.19 -p 8080

# MFA access to SSH
python3 spa-mfa.py -s 192.168.2.19 -p 22 -c ssh

# Skip MFA (testing only)
python3 spa-mfa.py -s 192.168.2.19 -p 8080 --skip-mfa

# Direct fwknop (no MFA)
fwknop -n 192.168.2.19
```

---

## Security Considerations

1. **Key Rotation**: Rotate SPA and HMAC keys periodically
2. **TOTP Backup**: Store TOTP recovery codes securely
3. **Network Segmentation**: Place SPA servers in DMZ
4. **Monitoring**: Set up alerts for failed authentication attempts
5. **Updates**: Keep fwknop and system packages updated

---

## Next Steps

- [ ] Configure multiple users with different access levels
- [ ] Set up GnuPG encryption for enhanced security
- [ ] Integrate with LDAP/Active Directory
- [ ] Deploy across multiple servers
- [ ] Set up centralized logging with ELK/Splunk
