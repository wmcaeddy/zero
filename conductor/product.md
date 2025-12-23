# Product Guide - Zero-SPA

## Initial Concept
Zero-SPA provides MFA-enforced network access similar to Zero Networks, using Single Packet Authorization (SPA) with fwknop and TOTP, including integration with Thales SafeNet Authentication Service (SAS).

## Target Audience
- **IT/Security Administrators:** Responsible for managing network access policies, monitoring logs, and configuring security parameters.
- **End-users (Developers/Remote Workers):** Users requiring secure, on-demand access to internal network resources and services.

## Core Goals
- **Port Concealment:** Eliminate open ports and hide services from unauthorized scanners using SPA.
- **MFA-Enforced Access:** Implement a seamless and secure MFA/TOTP flow for granting network access.
- **Centralized Management:** Provide a unified "Zero Console" for policy management and access control.
- **Enterprise Integration:** Simplify integration with enterprise authentication services, specifically Thales SafeNet Authentication Service (SAS).

## Key Features
- **Advanced Firewall Support:** Support for complex firewall configurations including nftables and dynamic rule updates.
- **Enhanced Client Experience:** A polished client-side MFA experience with a cross-platform CLI and improved desktop integration.
- **Comprehensive Auditing:** Detailed auditing and logging of all access attempts and administrative actions.
- **Automated Token Provisioning:** Automated lifecycle management and provisioning of mobilePASS tokens via BSIDCA.

## Strategic Priority
The immediate focus is on a **User Experience (UX) Overhaul**. This involves refining the "Zero Console" UI to be more intuitive and improving the client CLI/wrapper to ensure a frictionless experience for both administrators and end-users.
