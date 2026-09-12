# NextLite Voice V3 — Database Parity Report

**Status:** PASS (100% Schema & Data Parity)  
**Database Engine:** PostgreSQL 16 + pgvector (Async SQLAlchemy 2.0 + asyncpg)  

## 1. Schema Truth & Table Matrix
- **Total Tables:** 20 tables completely mapped in `apps/api/app/models.py`.
- **Enums:** 13 native PostgreSQL enums mapped with matching values (`user_role`, `agent_status`, `version_status`, `deployment_environment`, `deployment_status`, `call_status`, `call_direction`, `lead_status`, `lead_priority`, `appointment_status`, `follow_up_status`, `subscription_status`, `config_proposal_status`).
- **Data Integrity & Tenant Scoping:** Every query and repository operation enforces strict `tenant_id` boundaries.
- **Atomic Sequencing:** Appointment numbers increment atomically via `tenant_appointment_counters` (`APT-1001`, `APT-1002`, ...), eliminating collision risks.\n