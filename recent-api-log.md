PS E:\NextLite\nextlite-voice-engineering-spec>  & ".\apps\pipecat-worker\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload --app-dir apps/api
INFO:     Will watch for changes in these directories: ['E:\\NextLite\\nextlite-voice-engineering-spec']
INFO:     Uvicorn running on http://0.0.0.0:3001 (Press CTRL+C to quit)
INFO:     Started reloader process [18640] using WatchFiles
INFO:     Started server process [24548]
INFO:     Waiting for application startup.
2026-09-13 22:09:35.287 | INFO     | app.main:lifespan:14 - Starting NextLite Python Control Plane...
2026-09-13 22:09:35.288 | INFO     | app.main:lifespan:16 - PostgreSQL Database connection pool initialized.
INFO:     Application startup complete.
2026-09-13 22:09:37.372 | INFO     | app.main:lifespan:20 - Redis connection established.
2026-09-13 22:10:40,895 INFO sqlalchemy.engine.Engine select pg_catalog.version()
2026-09-13 22:10:40,896 INFO sqlalchemy.engine.Engine [raw sql] ()
2026-09-13 22:10:40,960 INFO sqlalchemy.engine.Engine select current_schema()
2026-09-13 22:10:40,961 INFO sqlalchemy.engine.Engine [raw sql] ()
2026-09-13 22:10:40,971 INFO sqlalchemy.engine.Engine show standard_conforming_strings
2026-09-13 22:10:40,972 INFO sqlalchemy.engine.Engine [raw sql] ()
2026-09-13 22:10:40,977 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:10:41,064 INFO sqlalchemy.engine.Engine SELECT refresh_tokens.id, refresh_tokens.user_id, refresh_tokens.token, refresh_tokens.expires_at, refresh_tokens.created_at
FROM refresh_tokens
WHERE refresh_tokens.token = $1::VARCHAR
2026-09-13 22:10:41,065 INFO sqlalchemy.engine.Engine [generated in 0.00110s] ('62275b88-ceea-4f46-ba92-6ef028baab8c',)
2026-09-13 22:10:41,067 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:10:41,068 INFO sqlalchemy.engine.Engine SELECT refresh_tokens.id, refresh_tokens.user_id, refresh_tokens.token, refresh_tokens.expires_at, refresh_tokens.created_at
FROM refresh_tokens
WHERE refresh_tokens.token = $1::VARCHAR
2026-09-13 22:10:41,069 INFO sqlalchemy.engine.Engine [cached since 0.004645s ago] ('62275b88-ceea-4f46-ba92-6ef028baab8c',)
2026-09-13 22:10:41,127 INFO sqlalchemy.engine.Engine SELECT users.id, users.tenant_id, users.email, users.password_hash, users.role, users.email_verified, users.created_at, users.updated_at
FROM users
WHERE users.id = $1::UUID
2026-09-13 22:10:41,127 INFO sqlalchemy.engine.Engine [generated in 0.00080s] (UUID('940fe78c-35ea-479a-b33f-fee352a9728c'),)
2026-09-13 22:10:41,132 INFO sqlalchemy.engine.Engine SELECT users.id, users.tenant_id, users.email, users.password_hash, users.role, users.email_verified, users.created_at, users.updated_at
FROM users
WHERE users.id = $1::UUID
2026-09-13 22:10:41,133 INFO sqlalchemy.engine.Engine [cached since 0.006445s ago] (UUID('940fe78c-35ea-479a-b33f-fee352a9728c'),)
2026-09-13 22:10:41,259 INFO sqlalchemy.engine.Engine DELETE FROM refresh_tokens WHERE refresh_tokens.token = $1::VARCHAR
2026-09-13 22:10:41,260 INFO sqlalchemy.engine.Engine [generated in 0.00082s] ('62275b88-ceea-4f46-ba92-6ef028baab8c',)
2026-09-13 22:10:41,262 INFO sqlalchemy.engine.Engine DELETE FROM refresh_tokens WHERE refresh_tokens.token = $1::VARCHAR
2026-09-13 22:10:41,263 INFO sqlalchemy.engine.Engine [cached since 0.004061s ago] ('62275b88-ceea-4f46-ba92-6ef028baab8c',)
2026-09-13 22:10:41,288 INFO sqlalchemy.engine.Engine INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at) VALUES ($1::UUID, $2::UUID, $3::VARCHAR, $4::TIMESTAMP WITHOUT TIME ZONE, $5::TIMESTAMP WITHOUT TIME ZONE)
2026-09-13 22:10:41,289 INFO sqlalchemy.engine.Engine [generated in 0.00116s] (UUID('6a112661-dcb4-47ee-988e-b351153cbb26'), UUID('940fe78c-35ea-479a-b33f-fee352a9728c'), '4c306ef1-1637-46e3-82d2-b0c3b5cdf6e9', datetime.datetime(2026, 9, 20, 16, 40, 41, 282661), datetime.datetime(2026, 9, 13, 16, 40, 41, 288128))
2026-09-13 22:10:41,299 INFO sqlalchemy.engine.Engine COMMIT
2026-09-13 22:10:41,309 INFO sqlalchemy.engine.Engine INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at) VALUES ($1::UUID, $2::UUID, $3::VARCHAR, $4::TIMESTAMP WITHOUT TIME ZONE, $5::TIMESTAMP WITHOUT TIME ZONE)
2026-09-13 22:10:41,309 INFO sqlalchemy.engine.Engine [cached since 0.02169s ago] (UUID('496f810a-ba90-46e0-8028-942fb7a06e2d'), UUID('940fe78c-35ea-479a-b33f-fee352a9728c'), '17ac2d39-0073-44e2-9864-8a505c1a66e9', datetime.datetime(2026, 9, 20, 16, 40, 41, 307700), datetime.datetime(2026, 9, 13, 16, 40, 41, 308910))
INFO:     127.0.0.1:56259 - "POST /api/auth/refresh HTTP/1.1" 200 OK
2026-09-13 22:10:41,315 INFO sqlalchemy.engine.Engine COMMIT
INFO:     127.0.0.1:49672 - "POST /api/auth/refresh HTTP/1.1" 200 OK
2026-09-13 22:10:41,620 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:10:41,625 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-13 22:10:41,626 INFO sqlalchemy.engine.Engine [generated in 0.00095s] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'))
2026-09-13 22:10:41,657 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-13 22:10:41,658 INFO sqlalchemy.engine.Engine [generated in 0.00084s] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'),)
2026-09-13 22:10:41,710 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
 LIMIT $3::INTEGER
2026-09-13 22:10:41,711 INFO sqlalchemy.engine.Engine [generated in 0.00099s] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 'ACTIVE', 1)
INFO:     127.0.0.1:49672 - "GET /api/admin/clients/02a1e84a-2d11-48c9-9209-f6d7de1fa502/agents/09a2ba03-fcf4-4459-82ea-3f0fd9204762 HTTP/1.1" 200 OK
2026-09-13 22:10:41,762 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:10:41,771 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:10:41,773 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-13 22:10:41,773 INFO sqlalchemy.engine.Engine [cached since 0.148s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'))
2026-09-13 22:10:41,782 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:10:41,783 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-13 22:10:41,784 INFO sqlalchemy.engine.Engine [cached since 0.1587s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'))
2026-09-13 22:10:41,788 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-13 22:10:41,789 INFO sqlalchemy.engine.Engine [cached since 0.132s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'),)
2026-09-13 22:10:41,799 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
 LIMIT $3::INTEGER
2026-09-13 22:10:41,800 INFO sqlalchemy.engine.Engine [cached since 0.09009s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 'ACTIVE', 1)
INFO:     127.0.0.1:49672 - "GET /api/admin/clients/02a1e84a-2d11-48c9-9209-f6d7de1fa502/agents/09a2ba03-fcf4-4459-82ea-3f0fd9204762/checklist HTTP/1.1" 200 OK
2026-09-13 22:10:41,807 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:10:41,813 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-13 22:10:41,814 INFO sqlalchemy.engine.Engine [cached since 0.1573s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'),)
2026-09-13 22:10:41,839 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
 LIMIT $3::INTEGER
2026-09-13 22:10:41,840 INFO sqlalchemy.engine.Engine [cached since 0.1299s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 'ACTIVE', 1)
INFO:     127.0.0.1:56259 - "GET /api/admin/clients/02a1e84a-2d11-48c9-9209-f6d7de1fa502/agents/09a2ba03-fcf4-4459-82ea-3f0fd9204762 HTTP/1.1" 200 OK
2026-09-13 22:10:41,896 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:10:41,978 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:10:41,980 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-13 22:10:41,981 INFO sqlalchemy.engine.Engine [cached since 0.3553s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'))
2026-09-13 22:10:41,986 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-13 22:10:41,987 INFO sqlalchemy.engine.Engine [cached since 0.3304s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'),)
2026-09-13 22:10:41,998 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
 LIMIT $3::INTEGER
2026-09-13 22:10:41,999 INFO sqlalchemy.engine.Engine [cached since 0.2895s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 'ACTIVE', 1)
INFO:     127.0.0.1:56259 - "GET /api/admin/clients/02a1e84a-2d11-48c9-9209-f6d7de1fa502/agents/09a2ba03-fcf4-4459-82ea-3f0fd9204762/checklist HTTP/1.1" 200 OK
2026-09-13 22:10:42,011 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:10:45,015 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:10:45,027 INFO sqlalchemy.engine.Engine SELECT count(*) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-13 22:10:45,028 INFO sqlalchemy.engine.Engine [generated in 0.00220s] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'))
2026-09-13 22:10:45,071 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
 LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-13 22:10:45,071 INFO sqlalchemy.engine.Engine [generated in 0.00094s] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 15, 0)
INFO:     127.0.0.1:56259 - "GET /api/client/calls?limit=15&agentId=09a2ba03-fcf4-4459-82ea-3f0fd9204762&tenantId=02a1e84a-2d11-48c9-9209-f6d7de1fa502 HTTP/1.1" 200 OK
2026-09-13 22:10:45,765 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:10:45,792 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:10:45,794 INFO sqlalchemy.engine.Engine SELECT count(*) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-13 22:10:45,794 INFO sqlalchemy.engine.Engine [cached since 0.7682s ago] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'))
2026-09-13 22:10:45,810 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
 LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-13 22:10:45,810 INFO sqlalchemy.engine.Engine [generated in 0.00096s] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 15, 0)
INFO:     127.0.0.1:49672 - "GET /api/client/calls?limit=15&agentId=09a2ba03-fcf4-4459-82ea-3f0fd9204762&tenantId=02a1e84a-2d11-48c9-9209-f6d7de1fa502 HTTP/1.1" 200 OK
2026-09-13 22:10:46,457 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:10:56,103 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:10:56,106 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-13 22:10:56,106 INFO sqlalchemy.engine.Engine [cached since 14.48s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'))
2026-09-13 22:10:56,113 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-13 22:10:56,114 INFO sqlalchemy.engine.Engine [cached since 14.46s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'),)
2026-09-13 22:10:56,131 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
 LIMIT $3::INTEGER
2026-09-13 22:10:56,131 INFO sqlalchemy.engine.Engine [cached since 14.42s ago] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 'ACTIVE', 1)
2026-09-13 22:10:56,140 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.tenant_id = $2::UUID AND deployments.status = $3 ORDER BY deployments.created_at DESC
 LIMIT $4::INTEGER
2026-09-13 22:10:56,141 INFO sqlalchemy.engine.Engine [generated in 0.00085s] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), 'ACTIVE', 1)
2026-09-13 22:10:56.145 | INFO     | app.services.telephony_service:create_outbound_phone_call:58 - [TelephonyService] Calling Plivo to dial +919657954641 with answer URL: https://dandelion-gigantic-challenge.ngrok-free.dev/plivo/test-xml?deploymentId=0ebf17f6-1bc2-429a-8ddf-5224930694b3
2026-09-13 22:10:59.007 | INFO     | app.services.telephony_service:create_outbound_phone_call:74 - [TelephonyService] Plivo call initiated successfully: {'api_id': 'ade56b15-852e-435b-8136-4ec4c6e18b77', 'message': 'call queued', 'request_uuid': '0ed27603-2207-4f6a-8aae-05987fcac3f8'}
INFO:     127.0.0.1:59656 - "POST /api/admin/clients/02a1e84a-2d11-48c9-9209-f6d7de1fa502/agents/09a2ba03-fcf4-4459-82ea-3f0fd9204762/phone-test HTTP/1.1" 200 OK
2026-09-13 22:10:59,012 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:10:59,036 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:10:59,037 INFO sqlalchemy.engine.Engine SELECT count(*) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-13 22:10:59,038 INFO sqlalchemy.engine.Engine [cached since 14.01s ago] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'))
2026-09-13 22:10:59,054 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
 LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-13 22:10:59,055 INFO sqlalchemy.engine.Engine [cached since 13.25s ago] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 5, 0)
INFO:     127.0.0.1:59656 - "GET /api/client/calls?limit=5&agentId=09a2ba03-fcf4-4459-82ea-3f0fd9204762&tenantId=02a1e84a-2d11-48c9-9209-f6d7de1fa502 HTTP/1.1" 200 OK
2026-09-13 22:10:59,396 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:10:59,446 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:10:59,448 INFO sqlalchemy.engine.Engine SELECT count(*) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-13 22:10:59,448 INFO sqlalchemy.engine.Engine [cached since 14.42s ago] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'))
2026-09-13 22:10:59,452 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
 LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-13 22:10:59,453 INFO sqlalchemy.engine.Engine [cached since 13.64s ago] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 15, 0)
INFO:     127.0.0.1:59656 - "GET /api/client/calls?limit=15&agentId=09a2ba03-fcf4-4459-82ea-3f0fd9204762&tenantId=02a1e84a-2d11-48c9-9209-f6d7de1fa502 HTTP/1.1" 200 OK
2026-09-13 22:11:00,094 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:11:08,975 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:11:08,978 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.id = $1::UUID
2026-09-13 22:11:08,979 INFO sqlalchemy.engine.Engine [generated in 0.00082s] (UUID('0ebf17f6-1bc2-429a-8ddf-5224930694b3'),)
2026-09-13 22:11:08,985 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID
2026-09-13 22:11:08,985 INFO sqlalchemy.engine.Engine [generated in 0.00065s] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'),)
2026-09-13 22:11:08,992 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.id = $1::UUID
2026-09-13 22:11:08,993 INFO sqlalchemy.engine.Engine [generated in 0.00117s] (UUID('fab673c9-d331-42d0-8df7-08e628f5e967'),)
2026-09-13 22:11:09,015 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
 LIMIT $2::INTEGER
2026-09-13 22:11:09,016 INFO sqlalchemy.engine.Engine [generated in 0.00073s] (UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 1)
2026-09-13 22:11:09,025 INFO sqlalchemy.engine.Engine SELECT agent_templates.id, agent_templates.name, agent_templates.description, agent_templates.industry, agent_templates.default_configuration, agent_templates.is_system, agent_templates.created_at
FROM agent_templates
WHERE agent_templates.id = $1::UUID
2026-09-13 22:11:09,026 INFO sqlalchemy.engine.Engine [generated in 0.00092s] (UUID('fc7ff805-84e7-4d21-b83b-0a08d9baa53c'),)
INFO:     127.0.0.1:59667 - "GET /api/internal/runtime-config/0ebf17f6-1bc2-429a-8ddf-5224930694b3 HTTP/1.1" 200 OK
2026-09-13 22:11:09,070 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:11:09,152 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:11:09,158 INFO sqlalchemy.engine.Engine INSERT INTO call_sessions (id, tenant_id, agent_id, deployment_id, room_name, caller_number, direction, status, duration_seconds, primary_language, started_at, ended_at, transcript_text, turns_json, tools_used, metrics_json, created_at) VALUES ($1::UUID, $2::UUID, $3::UUID, $4::UUID, $5::VARCHAR, $6::VARCHAR, $7, $8, $9::INTEGER, $10::VARCHAR, $11::TIMESTAMP WITHOUT TIME ZONE, $12::TIMESTAMP WITHOUT TIME ZONE, $13::VARCHAR, $14::JSONB, $15::JSONB, $16::JSONB, $17::TIMESTAMP WITHOUT TIME ZONE)
2026-09-13 22:11:09,159 INFO sqlalchemy.engine.Engine [generated in 0.00178s] (UUID('7a463289-be6a-4ee3-9df0-2ebc6da2167c'), UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), UUID('0ebf17f6-1bc2-429a-8ddf-5224930694b3'), '2dc3cdba-af13-4f4c-bf38-e62b283608b7', None, 'INBOUND', 'ACTIVE', 0, 'mr-IN', datetime.datetime(2026, 9, 13, 16, 41, 9, 151131), None, None, '[]', '[]', '{}', datetime.datetime(2026, 9, 13, 16, 41, 9, 151131))
2026-09-13 22:11:09,181 INFO sqlalchemy.engine.Engine COMMIT
INFO:     127.0.0.1:59667 - "POST /api/internal/call-sessions HTTP/1.1" 201 Created
2026-09-13 22:12:21,042 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:12:21,043 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.id = $1::UUID
2026-09-13 22:12:21,043 INFO sqlalchemy.engine.Engine [cached since 72.07s ago] (UUID('0ebf17f6-1bc2-429a-8ddf-5224930694b3'),)
2026-09-13 22:12:21,051 INFO sqlalchemy.engine.Engine SELECT tenant_appointment_counters.tenant_id, tenant_appointment_counters.last_number, tenant_appointment_counters.updated_at
FROM tenant_appointment_counters
WHERE tenant_appointment_counters.tenant_id = $1::UUID FOR UPDATE
2026-09-13 22:12:21,051 INFO sqlalchemy.engine.Engine [generated in 0.00043s] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'),)
2026-09-13 22:12:21,097 INFO sqlalchemy.engine.Engine UPDATE tenant_appointment_counters SET last_number=$1::INTEGER, updated_at=$2::TIMESTAMP WITHOUT TIME ZONE WHERE tenant_appointment_counters.tenant_id = $3::UUID
2026-09-13 22:12:21,098 INFO sqlalchemy.engine.Engine [generated in 0.00054s] (44, datetime.datetime(2026, 9, 13, 16, 42, 21, 97822), UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'))
2026-09-13 22:12:21,106 INFO sqlalchemy.engine.Engine INSERT INTO appointments (id, tenant_id, agent_id, call_session_id, appointment_number, customer_name, customer_phone, title, resource_name, booking_date, booking_time, status, notes, metadata, created_at, updated_at) VALUES ($1::UUID, $2::UUID, $3::UUID, $4::UUID, $5::VARCHAR, $6::VARCHAR, $7::VARCHAR, $8::VARCHAR, $9::VARCHAR, $10::VARCHAR, $11::VARCHAR, $12, $13::VARCHAR, $14::JSONB, $15::TIMESTAMP WITHOUT TIME ZONE, $16::TIMESTAMP WITHOUT TIME ZONE)
2026-09-13 22:12:21,107 INFO sqlalchemy.engine.Engine [generated in 0.00052s] (UUID('e7364353-5baf-434f-87fd-2db6a13aa191'), UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), UUID('7a463289-be6a-4ee3-9df0-2ebc6da2167c'), 'APT-44', 'Om Parkhi', '+910000000000', 'Dr. Mohan Sharma', None, '2026-09-14', '11:00 AM', 'REQUESTED', 'Age: 22; Place: Reshimbagh', '{"age": "22", "place": "Reshimbagh", "location": "Reshimbagh"}', datetime.datetime(2026, 9, 13, 16, 42, 21, 106556), datetime.datetime(2026, 9, 13, 16, 42, 21, 106560))
2026-09-13 22:12:21,163 INFO sqlalchemy.engine.Engine COMMIT
INFO:     127.0.0.1:56643 - "POST /api/internal/appointments HTTP/1.1" 201 Created
2026-09-13 22:13:07,781 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:13:07,795 INFO sqlalchemy.engine.Engine UPDATE call_sessions SET status=$1, duration_seconds=$2::INTEGER, ended_at=$3::TIMESTAMP WITHOUT TIME ZONE, transcript_text=$4::VARCHAR, turns_json=$5::JSONB, tools_used=$6::JSONB, metrics_json=$7::JSONB WHERE call_sessions.id = $8::UUID RETURNING call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
2026-09-13 22:13:07,796 INFO sqlalchemy.engine.Engine [generated in 0.00506s] ('COMPLETED', 119, datetime.datetime(2026, 9, 13, 16, 43, 7, 775172), 'Assistant: नमस्कार! Medicare Multi-Specialty Clinic मध्ये आपले स्वागत आहे. मी आपली काय मदत करू शकतो?', '[{"turnId": 1, "startTime": "2026-09-13T16:41:09.133566+00:00", "tools": [{"toolName": "book_appointment", "callId": "call_d0cd64c5bb9f4d08ac0a3924", ... (606 characters truncated) ... ", "activeLanguage": "mr-IN", "interrupted": false, "timestamp": "2026-09-13T16:41:09.133566+00:00"}, "endTime": "2026-09-13T16:41:09.133566+00:00"}]', '["book_appointment"]', '{"callDurationMs": 118848, "callStartedAt": "2026-09-13T16:41:08.621911+00:00", "callEndedAt": "2026-09-13T16:43:07.470332+00:00", "totalTurns": 0, " ... (196410 characters truncated) ... 16:43:07.467090+00:00", "monotonicTimestamp": 48459.557625, "elapsedFromCallStartMs": 118845}], "phoneTraces": [], "toolsUsed": ["book_appointment"]}', UUID('7a463289-be6a-4ee3-9df0-2ebc6da2167c'))
2026-09-13 22:13:08,076 INFO sqlalchemy.engine.Engine COMMIT
INFO:     127.0.0.1:59788 - "PATCH /api/internal/call-sessions/7a463289-be6a-4ee3-9df0-2ebc6da2167c HTTP/1.1" 200 OK
INFO:     127.0.0.1:54100 - "OPTIONS /api/client/calls/8a8e1f76-e9c8-4ab1-ad9b-404af3075dab?tenantId=02a1e84a-2d11-48c9-9209-f6d7de1fa502 HTTP/1.1" 200 OK
2026-09-13 22:14:01,069 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:14:01,095 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.id = $1::UUID AND call_sessions.tenant_id = $2::UUID
2026-09-13 22:14:01,097 INFO sqlalchemy.engine.Engine [generated in 0.00383s] (UUID('8a8e1f76-e9c8-4ab1-ad9b-404af3075dab'), UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'))
INFO:     127.0.0.1:53906 - "GET /api/client/calls/8a8e1f76-e9c8-4ab1-ad9b-404af3075dab?tenantId=02a1e84a-2d11-48c9-9209-f6d7de1fa502 HTTP/1.1" 200 OK
2026-09-13 22:14:01,183 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:14:01,230 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:14:01,238 INFO sqlalchemy.engine.Engine SELECT count(*) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-13 22:14:01,240 INFO sqlalchemy.engine.Engine [cached since 196.2s ago] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'))
2026-09-13 22:14:01,271 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
 LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-13 22:14:01,273 INFO sqlalchemy.engine.Engine [cached since 195.5s ago] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 15, 0)
INFO:     127.0.0.1:53906 - "GET /api/client/calls?limit=15&agentId=09a2ba03-fcf4-4459-82ea-3f0fd9204762&tenantId=02a1e84a-2d11-48c9-9209-f6d7de1fa502 HTTP/1.1" 200 OK
2026-09-13 22:14:02,211 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:14:05,096 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:14:05,097 INFO sqlalchemy.engine.Engine SELECT count(*) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-13 22:14:05,098 INFO sqlalchemy.engine.Engine [cached since 200.1s ago] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'))
2026-09-13 22:14:05,107 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
 LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-13 22:14:05,109 INFO sqlalchemy.engine.Engine [cached since 199.3s ago] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 15, 0)
INFO:     127.0.0.1:53906 - "GET /api/client/calls?limit=15&agentId=09a2ba03-fcf4-4459-82ea-3f0fd9204762&tenantId=02a1e84a-2d11-48c9-9209-f6d7de1fa502 HTTP/1.1" 200 OK
2026-09-13 22:14:05,858 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-13 22:14:05,898 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-13 22:14:05,901 INFO sqlalchemy.engine.Engine SELECT count(*) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-13 22:14:05,901 INFO sqlalchemy.engine.Engine [cached since 200.9s ago] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'))
2026-09-13 22:14:05,908 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
 LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-13 22:14:05,908 INFO sqlalchemy.engine.Engine [cached since 200.1s ago] (UUID('02a1e84a-2d11-48c9-9209-f6d7de1fa502'), UUID('09a2ba03-fcf4-4459-82ea-3f0fd9204762'), 15, 0)
INFO:     127.0.0.1:53906 - "GET /api/client/calls?limit=15&agentId=09a2ba03-fcf4-4459-82ea-3f0fd9204762&tenantId=02a1e84a-2d11-48c9-9209-f6d7de1fa502 HTTP/1.1" 200 OK
2026-09-13 22:14:06,637 INFO sqlalchemy.engine.Engine ROLLBACK