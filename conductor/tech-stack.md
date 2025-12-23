# Technology Stack - Zero-SPA

## Languages
- **JavaScript (Node.js):** Primary language for the SAS/BSIDCA API integration and the Zero Console backend.
- **Python:** Used for client-side MFA wrappers, TOTP utilities, and the sample protected application.
- **Shell (Bash):** Used for installation, configuration, and firewall management scripts.

## Frameworks & Libraries
- **Express.js:** Web framework for the `sas-api` service.
- **Flask:** Light-weight web framework used for the `sample-app`.
- **PyOTP:** (Inferred) Python library for TOTP generation and validation.

## Security & Infrastructure
- **fwknop:** Single Packet Authorization (SPA) implementation for port concealment.
- **iptables / nftables:** Linux kernel firewalls used for dynamic access control.
- **Docker & Docker Compose:** Containerization platform for the Zero Console and related services.
- **systemd:** Service manager for running `fwknopd` and other background processes on Linux.

## External Integrations
- **Thales SafeNet Authentication Service (SAS):** Used for enterprise-grade OTP validation.
- **BSIDCA API:** Used for automated token provisioning and lifecycle management.
