# Zero-SPA Setup Notes

## What Was Done

### 1. Server Deployment (192.168.2.19)

**Installed:**
- fwknop-server (Single Packet Authorization daemon)
- Flask sample app on port 8080
- iptables firewall rules blocking port 8080

**Configuration Files on Server:**
- `/etc/fwknop/fwknopd.conf` - fwknop daemon config (UDP server on port 62201)
- `/etc/fwknop/access.conf` - Access control with encryption keys
- `/opt/zero-spa/` - Project files

**Running Services:**
- fwknopd (run manually: `/usr/sbin/fwknopd`)
- Sample app (run: `cd /opt/zero-spa/server/sample-app && python3 app.py`)

### 2. Client Setup (Local Machine)

**Installed:**
- fwknop-client
- qrencode

**Configuration Files:**
- `~/.fwknoprc` - fwknop client config with encryption keys
- `~/.zero-spa/generated-keys.env` - SPA encryption keys
- `~/.zero-spa/totp-secret.env` - TOTP secret for MFA

### 3. Keys Generated

**SPA Keys (in ~/.zero-spa/generated-keys.env):**
```
SPA_KEY_BASE64="UWp7lQfHDXMmDuIIp5ntAf1x5rIDm+LzMbvk7HYsPZY="
SPA_HMAC_KEY_BASE64="JnsOP7EUuj2FoKjNsKR/Vk0ukVspUwK47SpF8qTb20PshygPljyoLitrHJiazM2DIez9XkNrzxyVsSLEQvxpug=="
```

**TOTP Secret (in ~/.zero-spa/totp-secret.env):**
```
TOTP_SECRET="Z5X7FFZLGJ4Z3QFCUCRMRVIMDKUVNPSO"
```

---

## How to Test

### Test 1: Verify port is blocked
```bash
timeout 3 curl http://192.168.2.19:8080/
# Should timeout (port blocked)
```

### Test 2: Open port with SPA
```bash
fwknop -n 192.168.2.19
curl http://192.168.2.19:8080/api/whoami
# Should return JSON response
```

### Test 3: Full MFA flow
```bash
python3 /home/eddy/github/zero/client/spa-mfa.py --server 192.168.2.19 --port 8080
# Prompts for TOTP code, then opens access
```

---

## How to Display TOTP QR Code

```bash
source ~/.zero-spa/totp-secret.env
qrencode -t ANSIUTF8 "otpauth://totp/Zero-SPA:eddy@192.168.2.19?secret=${TOTP_SECRET}&issuer=Zero-SPA"
```

---

## Restart Services on Server

SSH to server and run:
```bash
ssh root@192.168.2.19

# Start fwknopd
pkill fwknopd
/usr/sbin/fwknopd

# Start sample app
cd /opt/zero-spa/server/sample-app
nohup python3 app.py > /var/log/zero-spa-app.log 2>&1 &
```

---

## Push to GitHub

1. Login to GitHub CLI:
```bash
gh auth login
```

2. Create repo and push:
```bash
cd /home/eddy/github/zero
gh repo create wmcaeddy/zero-spa --public --description "MFA-enforced Single Packet Authorization" --source . --push
```

---

## Project Structure

```
/home/eddy/github/zero/
├── deploy-server.sh          # Deploy to server (run as root)
├── setup-client.sh           # Setup local client
├── deploy-to-remote.sh       # Automated remote deploy
├── server/
│   ├── install.sh            # Install fwknop server
│   ├── configure.sh          # Configure with keys
│   ├── firewall-setup.sh     # Block port 8080
│   ├── fwknopd.conf          # Server config template
│   ├── access.conf.template  # Access control template
│   └── sample-app/
│       └── app.py            # Flask protected app
├── client/
│   ├── install.sh            # Install client tools
│   ├── spa-mfa.py            # MFA + SPA client
│   ├── setup-totp.py         # TOTP setup
│   └── fwknoprc.template     # Client config template
├── shared/
│   ├── keygen.sh             # Generate keys
│   └── totp-utils.py         # TOTP utilities
└── systemd/
    ├── fwknop.service        # fwknopd systemd service
    └── zero-spa-app.service  # Sample app service
```

---

## Important Notes

- Port 8080 is blocked by default via iptables DROP rule
- SPA packet opens access for 30 seconds only
- Client IP must be specified correctly (192.168.2.18 for local network)
- TOTP codes are valid for 30 seconds with ±30 second drift tolerance
