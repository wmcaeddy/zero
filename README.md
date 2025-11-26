# STA/SAS PCE API Demo

A web interface to demonstrate SafeNet Trusted Access (STA) API functionality for user registration via SCIM and MobilePASS+ token provisioning via REST API.

## Overview

This demo shows how to add users to STA/SAS PCE via API **without LDAP synchronization**:

1. **Register User via SCIM** - Create users using SCIM 2.0 API
2. **Provision MobilePASS+ Token via REST** - Automatically provision tokens and send activation links

## Deployment to Railway

### 1. Set Environment Variables

In your Railway project settings, add these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `REST_API_Endpoint_Url` | REST API endpoint for token operations | `https://api.eu.safenetid.com/api/v1/tenants/YOUR_TENANT/` |
| `SCIM_API_Endpoint_Url` | SCIM API endpoint for user management | `https://api.eu.safenetid.com/tenants/YOUR_TENANT/scim/v2/` |
| `API_KEY` | Your STA API key | `your-api-key` |

### 2. Deploy

Connect your GitHub repository to Railway for automatic deployments, or use the CLI:

```bash
railway up
```

## Local Development

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Start the server
npm start
```

Open http://localhost:3000

## API Endpoints

### SCIM Endpoints (User Management)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/scim/users` | Create a new user |
| `GET` | `/api/scim/users` | List all users |
| `GET` | `/api/scim/users/:id` | Get user by ID |
| `DELETE` | `/api/scim/users/:id` | Delete user |

### REST Endpoints (Token Management)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/tokens` | Provision a new MobilePASS+ token |
| `GET` | `/api/tokens` | List all tokens |
| `GET` | `/api/rest/users` | List users via REST API |

## SCIM User Registration Example

```json
POST /api/scim/users

{
  "userName": "john.doe@example.com",
  "givenName": "John",
  "familyName": "Doe",
  "email": "john.doe@example.com"
}
```

## MobilePASS+ Provisioning Example

```json
POST /api/tokens

{
  "userId": "<User ID from SCIM>",
  "tokenType": "MobilePASS",
  "deliveryMethod": "email"
}
```

When `deliveryMethod` is set to `email`, the user receives an activation link to register the token in the MobilePASS app.

## Debug Information

The web interface shows detailed debug information for each API call including:
- Full request details (method, URL, headers, body)
- Response status and data
- Error messages if any

## Workflow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. Register    │────▶│  2. Get User    │────▶│  3. Provision   │
│  User (SCIM)    │     │     ID          │     │  Token (REST)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## References

- [STA SCIM API Documentation](https://thalesdocs.com/sta/operator/scim/index.html)
- [STA REST API Documentation](https://thalesdocs.com/sta/operator/rest/index.html)
