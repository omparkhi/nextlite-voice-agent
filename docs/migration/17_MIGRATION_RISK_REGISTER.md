# Migration Risk Register & Mitigation Strategy

**Audit Date:** September 2026

---

## 1. Risk Matrix

| Risk ID | Category | Severity | Probability | Description | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-01** | Multi-Tenancy | CRITICAL | LOW | Accidental cross-tenant data leakage in FastAPI queries | Implement SQLAlchemy async scoped session with mandatory tenant filter mixin; 100% test coverage |
| **RSK-02** | Concurrency | HIGH | LOW | Race condition in atomic appointment numbering | Use PostgreSQL `UPDATE ... RETURNING` with row-level locks on `tenant_appointment_counters` |
| **RSK-03** | Telemetry | MEDIUM | LOW | Timing metric distortion during Python async transition | Use strict `time.monotonic()` latches in `turn_timing.py` |
| **RSK-04** | Tool Safety | CRITICAL | LOW | LLM speaking internal UUIDs to PSTN caller | Strict `getUserSafeDisplayId` sanitization filter on all tool outputs |
| **RSK-05** | API Parity | HIGH | LOW | Subtle JSON field name casing mismatch (camelCase vs snake_case) | Pydantic `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)` |
| **RSK-06** | Auth Token | HIGH | LOW | Incompatible Argon2 password hash format | Use passlib / argon2-cffi with identical parameters ($argon2id$v=19$m=65536,t=3,p=4) |