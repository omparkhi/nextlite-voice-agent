# Security

## Multi-tenant isolation

- every request must be authenticated
- every tenant resource must be authorized
- tenant ID must be derived from authenticated context
- never trust a tenant ID from client input

## Authentication

- Custom JWT + refresh token system
- Access token: short-lived
- Refresh token: long-lived, stored server-side
- Password hashing: bcrypt or argon2
- Email verification required before account activation
- No external auth platform (Clerk, Supabase Auth, NextAuth, etc.)

## Authorization

- Simple enum-based roles: ADMIN, CLIENT_OWNER, CLIENT_VIEWER
- No full RBAC system for MVP
- Server-side authorization enforced on every tenant-scoped request
- Admin routes require ADMIN role
- Client routes require CLIENT_OWNER or CLIENT_VIEWER role
- Client routes filter by tenant_id from auth context

## Secrets

Store in environment/secret management:
- database credentials
- Redis credentials
- Plivo credentials (auth_id, auth_token)
- Sarvam credentials (api-subscription-key)
- LLM credentials
- Cashfree credentials (x-client-id, x-client-secret, webhook secret key)
- Resend credentials (api key)
- webhook secrets (Plivo, Cashfree)
- n8n credentials

Never commit secrets.

## Webhooks

Verify signatures/authentication for:
- Plivo telephony webhooks (Plivo signature validation)
- Cashfree payment webhooks (HMAC-SHA256: x-webhook-signature, x-webhook-timestamp)
- n8n webhooks (shared secret or token)

Make webhook processing idempotent.

Cashfree webhook verification:
- signedPayload = timestamp + rawBody
- expectedSignature = Base64Encode(HMACSHA256(signedPayload, merchantSecretKey))
- Must use raw body (not parsed JSON) for signature verification
- Headers: x-webhook-signature, x-webhook-timestamp, x-webhook-version

## Data

Protect:
- call transcripts
- customer information
- payment metadata
- business documents

Use least privilege.

## Logs

Never log:
- API secrets
- full payment credentials
- unnecessary sensitive customer information

Use correlation IDs.

## Admin security

Admin endpoints require stronger authorization than client endpoints.
ADMIN role required for all admin operations.

## Audit

Record important:
- agent configuration changes
- deployment changes
- billing state changes
- admin actions
- permission changes
