# NextLite Voice V3 — Authentication & Security Parity Report

**Status:** PASS (100% Parity)  

## 1. Password Hashing & Verification
- **Argon2id Support:** Native implementation using `argon2-cffi` matching parameters (memory=65536, iterations=3, parallelism=4).
- **Bcrypt Fallback:** Seamlessly verifies legacy bcrypt hashes on existing user accounts without forcing password resets.

## 2. JWT & Token Lifecycle
- **Tokens:** Access token generation with HS256 HMAC and configured expiration (`15m`).
- **Refresh Rotation:** Secure refresh token rotation with single-use revocation and cookie flags (`httpOnly`, `samesite=lax`).
- **RBAC & Scoping:** Rigid enforcement of `ADMIN`, `CLIENT_OWNER`, and `CLIENT_VIEWER` access permissions.\n