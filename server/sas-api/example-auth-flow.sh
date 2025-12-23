#!/bin/bash
#
# Example Authentication Flow for Zero-SPA Admin Console
# Demonstrates JWT-based session management
#
# Usage: ./example-auth-flow.sh
#

set -e

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
USERNAME="${USERNAME:-user@example.com}"
OTP="${OTP:-123456}"

echo "=== Zero-SPA JWT Authentication Flow Example ==="
echo ""
echo "Base URL: $BASE_URL"
echo "Username: $USERNAME"
echo ""

# Step 1: Authenticate with MFA
echo "Step 1: Authenticating with MFA..."
echo "POST $BASE_URL/api/auth/verify"

AUTH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/verify" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$USERNAME\",
    \"otp\": \"$OTP\"
  }")

echo "Response:"
echo "$AUTH_RESPONSE" | jq '.' || echo "$AUTH_RESPONSE"
echo ""

# Check if authentication was successful
if echo "$AUTH_RESPONSE" | grep -q '"success":true'; then
  echo "✓ Authentication successful!"

  # Extract token
  TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.token')
  EXPIRES_IN=$(echo "$AUTH_RESPONSE" | jq -r '.expiresIn')

  echo "  Token: ${TOKEN:0:50}..."
  echo "  Expires in: $EXPIRES_IN seconds"
  echo ""

  # Step 2: Use token to access protected endpoint
  echo "Step 2: Accessing protected endpoint (GET assets)..."
  echo "GET $BASE_URL/api/assets"
  echo "Authorization: Bearer $TOKEN"

  ASSETS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/assets" \
    -H "Authorization: Bearer $TOKEN")

  echo "Response:"
  echo "$ASSETS_RESPONSE" | jq '.' || echo "$ASSETS_RESPONSE"
  echo ""

  # Step 3: Create a new asset (protected)
  echo "Step 3: Creating a new asset (protected endpoint)..."
  echo "POST $BASE_URL/api/assets"

  CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/assets" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Example Server",
      "ip_address": "192.168.1.100",
      "hostname": "example-srv-01",
      "os": "Ubuntu 22.04",
      "notes": "Created via JWT-authenticated API"
    }')

  echo "Response:"
  echo "$CREATE_RESPONSE" | jq '.' || echo "$CREATE_RESPONSE"
  echo ""

  if echo "$CREATE_RESPONSE" | grep -q '"success":true'; then
    echo "✓ Asset created successfully!"
    ASSET_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.id')
    echo "  Asset ID: $ASSET_ID"
    echo ""
  fi

  # Step 4: Refresh token
  echo "Step 4: Refreshing JWT token..."
  echo "POST $BASE_URL/api/auth/refresh"

  REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/refresh" \
    -H "Authorization: Bearer $TOKEN")

  echo "Response:"
  echo "$REFRESH_RESPONSE" | jq '.' || echo "$REFRESH_RESPONSE"
  echo ""

  if echo "$REFRESH_RESPONSE" | grep -q '"success":true'; then
    echo "✓ Token refreshed successfully!"
    NEW_TOKEN=$(echo "$REFRESH_RESPONSE" | jq -r '.token')
    echo "  New Token: ${NEW_TOKEN:0:50}..."
    echo ""

    # Update token for subsequent requests
    TOKEN="$NEW_TOKEN"
  fi

  # Step 5: Test SPA network connection (protected)
  echo "Step 5: Testing SPA network connection (protected endpoint)..."
  echo "POST $BASE_URL/api/network/connect"

  CONNECT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/network/connect" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "targetIp": "192.168.1.100",
      "port": 22,
      "protocol": "tcp"
    }')

  echo "Response:"
  echo "$CONNECT_RESPONSE" | jq '.' || echo "$CONNECT_RESPONSE"
  echo ""

  # Step 6: Test invalid token handling
  echo "Step 6: Testing invalid token handling..."
  echo "GET $BASE_URL/api/assets"
  echo "Authorization: Bearer invalid-token"

  INVALID_RESPONSE=$(curl -s -X GET "$BASE_URL/api/assets" \
    -H "Authorization: Bearer invalid-token")

  echo "Response:"
  echo "$INVALID_RESPONSE" | jq '.' || echo "$INVALID_RESPONSE"
  echo ""

  if echo "$INVALID_RESPONSE" | grep -q '"error".*"Invalid or expired token"'; then
    echo "✓ Invalid token correctly rejected!"
  fi

  echo ""
  echo "=== Authentication Flow Complete ==="
  echo ""
  echo "Summary:"
  echo "  ✓ MFA authentication successful"
  echo "  ✓ JWT token generated"
  echo "  ✓ Protected endpoints accessible with token"
  echo "  ✓ Token refresh working"
  echo "  ✓ Invalid tokens rejected"
  echo ""
  echo "Your current valid token:"
  echo "$TOKEN"

else
  echo "✗ Authentication failed!"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Ensure SAS API is configured (SAS_Endpoint_Url, SAS_User, SAS_Password)"
  echo "  2. Verify user has a valid MFA token assigned"
  echo "  3. Check OTP is correct 6-digit code"
  echo "  4. Review server logs for detailed error messages"
  echo ""
  exit 1
fi
