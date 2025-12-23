# Zero-SPA Admin Console - API Endpoints

This document lists all available API endpoints after the modularization.

## Authentication Endpoints (`routes/auth.js`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth/verify` | Rate Limited | Verify user MFA credentials (username + OTP) |
| POST | `/api/auth/refresh` | JWT Required | Refresh JWT token |

## Asset Management (`routes/assets.js`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/assets` | No | List all assets |
| POST | `/api/assets` | JWT Required | Create new asset |
| DELETE | `/api/assets/:id` | JWT Required | Delete asset by ID |

## Policy Management (`routes/policies.js`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/policies` | No | List all policies |
| POST | `/api/policies` | JWT Required | Create new policy |
| DELETE | `/api/policies/:id` | JWT Required | Delete policy by ID |

## Network/SPA (`routes/network.js`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/network/connect` | JWT Required | Connect to network target (SPA packet) |

## User Management - SCIM (`routes/users.js`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/scim/users` | No | List SCIM users |
| POST | `/api/scim/users` | No | Create SCIM user |
| DELETE | `/api/scim/users/:id` | No | Delete SCIM user |

## User Management - SAS (`routes/users.js`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/sas/users` | No | List SAS users (with pagination, caching) |
| GET | `/api/sas/containers` | No | Get SAS containers |

## Token Provisioning - BSIDCA (`routes/users.js`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/tokens` | No | Provision token for user |
| POST | `/api/tokens/activation-code` | No | Get MobilePASS activation code |
| GET | `/api/tokens/info` | No | Get token provisioning information |

## System Status (`routes/status.js`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/status` | No | Get system status and configuration |
| GET | `/api/audit` | No | Get audit logs |
| GET | `/health` | No | Health check (for Railway/monitoring) |

## Frontend

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/` | No | Serve main HTML page |
| GET | `/public/*` | No | Serve static files |

## Rate Limiting

Authentication endpoints (`/api/auth/verify`) are protected by rate limiting:
- **IP-based**: 5 attempts per minute
- **Username-based**: 10 attempts per 5 minutes

## JWT Authentication

The following endpoints require JWT authentication (Bearer token in Authorization header):
- POST `/api/auth/refresh`
- POST `/api/assets`
- DELETE `/api/assets/:id`
- POST `/api/policies`
- DELETE `/api/policies/:id`
- POST `/api/network/connect`

JWT tokens are obtained via `/api/auth/verify` and expire after 1 hour (configurable via `JWT_EXPIRY`).

## Query Parameters

### `/api/sas/users`
- `page` (integer, default: 1) - Page number for pagination
- `pageSize` (integer, default: 5) - Number of users per page
- `refresh` (boolean, default: false) - Force refresh cache

---

**Total Endpoints**: 21 API endpoints + 1 frontend route + 1 static file handler
**Modularization Date**: 2025-12-22
