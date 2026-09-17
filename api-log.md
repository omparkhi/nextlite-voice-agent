PS E:\NextLite\nextlite-voice-engineering-spec> & ".\apps\pipecat-worker\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload --app-dir apps/api
INFO: Will watch for changes in these directories: ['E:\\NextLite\\nextlite-voice-engineering-spec']
INFO: Uvicorn running on http://0.0.0.0:3001 (Press CTRL+C to quit)
INFO: Started reloader process [27916] using WatchFiles
INFO: Started server process [11068]
INFO: Waiting for application startup.
2026-09-14 13:28:23.660 | INFO | app.main:lifespan:14 - Starting NextLite Python Control Plane...
2026-09-14 13:28:23.661 | INFO | app.main:lifespan:16 - PostgreSQL Database connection pool initialized.
INFO: Application startup complete.
2026-09-14 13:28:25.721 | INFO | app.main:lifespan:20 - Redis connection established.
2026-09-14 13:29:33,764 INFO sqlalchemy.engine.Engine select pg_catalog.version()
2026-09-14 13:29:33,765 INFO sqlalchemy.engine.Engine [raw sql] ()
2026-09-14 13:29:33,832 INFO sqlalchemy.engine.Engine select current_schema()
2026-09-14 13:29:33,833 INFO sqlalchemy.engine.Engine [raw sql] ()
2026-09-14 13:29:33,845 INFO sqlalchemy.engine.Engine show standard_conforming_strings
2026-09-14 13:29:33,846 INFO sqlalchemy.engine.Engine [raw sql] ()
2026-09-14 13:29:33,850 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:29:33,958 INFO sqlalchemy.engine.Engine SELECT refresh_tokens.id, refresh_tokens.user_id, refresh_tokens.token, refresh_tokens.expires_at, refresh_tokens.created_at
FROM refresh_tokens
WHERE refresh_tokens.token = $1::VARCHAR
2026-09-14 13:29:33,958 INFO sqlalchemy.engine.Engine [generated in 0.00115s] ('21a666cc-9d41-4aba-b43f-a739e7677d1e',)
2026-09-14 13:29:33,960 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:29:33,961 INFO sqlalchemy.engine.Engine SELECT refresh_tokens.id, refresh_tokens.user_id, refresh_tokens.token, refresh_tokens.expires_at, refresh_tokens.created_at
FROM refresh_tokens
WHERE refresh_tokens.token = $1::VARCHAR
2026-09-14 13:29:33,962 INFO sqlalchemy.engine.Engine [cached since 0.004377s ago] ('21a666cc-9d41-4aba-b43f-a739e7677d1e',)
2026-09-14 13:29:34,024 INFO sqlalchemy.engine.Engine SELECT users.id, users.tenant_id, users.email, users.password_hash, users.role, users.email_verified, users.created_at, users.updated_at
FROM users
WHERE users.id = $1::UUID
2026-09-14 13:29:34,026 INFO sqlalchemy.engine.Engine [generated in 0.00235s] (UUID('940fe78c-35ea-479a-b33f-fee352a9728c'),)
2026-09-14 13:29:34,029 INFO sqlalchemy.engine.Engine SELECT users.id, users.tenant_id, users.email, users.password_hash, users.role, users.email_verified, users.created_at, users.updated_at
FROM users
WHERE users.id = $1::UUID
2026-09-14 13:29:34,029 INFO sqlalchemy.engine.Engine [cached since 0.005792s ago] (UUID('940fe78c-35ea-479a-b33f-fee352a9728c'),)
2026-09-14 13:29:34,186 INFO sqlalchemy.engine.Engine DELETE FROM refresh_tokens WHERE refresh_tokens.token = $1::VARCHAR
2026-09-14 13:29:34,187 INFO sqlalchemy.engine.Engine [generated in 0.00092s] ('21a666cc-9d41-4aba-b43f-a739e7677d1e',)
2026-09-14 13:29:34,192 INFO sqlalchemy.engine.Engine DELETE FROM refresh_tokens WHERE refresh_tokens.token = $1::VARCHAR
2026-09-14 13:29:34,193 INFO sqlalchemy.engine.Engine [cached since 0.007063s ago] ('21a666cc-9d41-4aba-b43f-a739e7677d1e',)
2026-09-14 13:29:34,215 INFO sqlalchemy.engine.Engine INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at) VALUES ($1::UUID, $2::UUID, $3::VARCHAR, $4::TIMESTAMP WITHOUT TIME ZONE, $5::TIMESTAMP WITHOUT TIME ZONE)
2026-09-14 13:29:34,216 INFO sqlalchemy.engine.Engine [generated in 0.00108s] (UUID('8f73f37e-5a8f-4350-b797-c9e0d08b69e2'), UUID('940fe78c-35ea-479a-b33f-fee352a9728c'), '87dbb78c-c707-4f4b-8a2d-2bd8a15f2656', datetime.datetime(2026, 9, 21, 7, 59, 34, 209983), datetime.datetime(2026, 9, 14, 7, 59, 34, 215161))
2026-09-14 13:29:34,234 INFO sqlalchemy.engine.Engine COMMIT
2026-09-14 13:29:34,246 INFO sqlalchemy.engine.Engine INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at) VALUES ($1::UUID, $2::UUID, $3::VARCHAR, $4::TIMESTAMP WITHOUT TIME ZONE, $5::TIMESTAMP WITHOUT TIME ZONE)
2026-09-14 13:29:34,247 INFO sqlalchemy.engine.Engine [cached since 0.03211s ago] (UUID('2b87e4ee-7258-4406-a051-f62957638cdd'), UUID('940fe78c-35ea-479a-b33f-fee352a9728c'), 'bd0b1237-c2f9-47d6-a94b-e453ee2cc576', datetime.datetime(2026, 9, 21, 7, 59, 34, 244770), datetime.datetime(2026, 9, 14, 7, 59, 34, 246286))
INFO: 127.0.0.1:57371 - "POST /api/auth/refresh HTTP/1.1" 200 OK
2026-09-14 13:29:34,258 INFO sqlalchemy.engine.Engine COMMIT
INFO: 127.0.0.1:52306 - "POST /api/auth/refresh HTTP/1.1" 200 OK
2026-09-14 13:29:34,510 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:29:34,514 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-14 13:29:34,515 INFO sqlalchemy.engine.Engine [generated in 0.00106s] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'))
2026-09-14 13:29:34,557 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-14 13:29:34,560 INFO sqlalchemy.engine.Engine [generated in 0.00239s] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'),)
2026-09-14 13:29:34,601 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
LIMIT $3::INTEGER
2026-09-14 13:29:34,602 INFO sqlalchemy.engine.Engine [generated in 0.00075s] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 'ACTIVE', 1)
INFO: 127.0.0.1:52306 - "GET /api/admin/clients/6b4b6128-5b5f-4d2f-b5de-91511ab9b120/agents/d04b7889-223a-45c8-bde5-8717cc435302 HTTP/1.1" 200 OK
2026-09-14 13:29:34,677 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:29:34,686 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:29:34,687 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-14 13:29:34,688 INFO sqlalchemy.engine.Engine [cached since 0.1737s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'))
2026-09-14 13:29:34,700 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:29:34,701 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-14 13:29:34,701 INFO sqlalchemy.engine.Engine [cached since 0.1872s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'))
2026-09-14 13:29:34,706 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-14 13:29:34,707 INFO sqlalchemy.engine.Engine [cached since 0.1493s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'),)
2026-09-14 13:29:34,709 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-14 13:29:34,710 INFO sqlalchemy.engine.Engine [cached since 0.1526s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'),)
2026-09-14 13:29:34,719 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
LIMIT $3::INTEGER
2026-09-14 13:29:34,720 INFO sqlalchemy.engine.Engine [cached since 0.1187s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 'ACTIVE', 1)
INFO: 127.0.0.1:52306 - "GET /api/admin/clients/6b4b6128-5b5f-4d2f-b5de-91511ab9b120/agents/d04b7889-223a-45c8-bde5-8717cc435302/checklist HTTP/1.1" 200 OK
2026-09-14 13:29:34,728 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:29:34,775 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
LIMIT $3::INTEGER
2026-09-14 13:29:34,776 INFO sqlalchemy.engine.Engine [cached since 0.1746s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 'ACTIVE', 1)
INFO: 127.0.0.1:57371 - "GET /api/admin/clients/6b4b6128-5b5f-4d2f-b5de-91511ab9b120/agents/d04b7889-223a-45c8-bde5-8717cc435302 HTTP/1.1" 200 OK
2026-09-14 13:29:34,820 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:29:34,875 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:29:34,876 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-14 13:29:34,876 INFO sqlalchemy.engine.Engine [cached since 0.3625s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'))
2026-09-14 13:29:34,881 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-14 13:29:34,882 INFO sqlalchemy.engine.Engine [cached since 0.3247s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'),)
2026-09-14 13:29:34,890 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
LIMIT $3::INTEGER
2026-09-14 13:29:34,890 INFO sqlalchemy.engine.Engine [cached since 0.2894s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 'ACTIVE', 1)
INFO: 127.0.0.1:57371 - "GET /api/admin/clients/6b4b6128-5b5f-4d2f-b5de-91511ab9b120/agents/d04b7889-223a-45c8-bde5-8717cc435302/checklist HTTP/1.1" 200 OK
2026-09-14 13:29:34,895 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:29:39,486 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:29:39,496 INFO sqlalchemy.engine.Engine SELECT count(_) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-14 13:29:39,497 INFO sqlalchemy.engine.Engine [generated in 0.00076s] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'))
2026-09-14 13:29:39,520 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-14 13:29:39,521 INFO sqlalchemy.engine.Engine [generated in 0.00104s] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 15, 0)
INFO: 127.0.0.1:57371 - "GET /api/client/calls?limit=15&agentId=d04b7889-223a-45c8-bde5-8717cc435302&tenantId=6b4b6128-5b5f-4d2f-b5de-91511ab9b120 HTTP/1.1" 200 OK
2026-09-14 13:29:39,676 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:29:39,700 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:29:39,703 INFO sqlalchemy.engine.Engine SELECT count(_) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-14 13:29:39,704 INFO sqlalchemy.engine.Engine [cached since 0.2083s ago] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'))
2026-09-14 13:29:39,718 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-14 13:29:39,720 INFO sqlalchemy.engine.Engine [generated in 0.00152s] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 15, 0)
INFO: 127.0.0.1:52306 - "GET /api/client/calls?limit=15&agentId=d04b7889-223a-45c8-bde5-8717cc435302&tenantId=6b4b6128-5b5f-4d2f-b5de-91511ab9b120 HTTP/1.1" 200 OK
2026-09-14 13:29:39,892 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:30:15,788 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:15,790 INFO sqlalchemy.engine.Engine SELECT refresh_tokens.id, refresh_tokens.user_id, refresh_tokens.token, refresh_tokens.expires_at, refresh_tokens.created_at
FROM refresh_tokens
WHERE refresh_tokens.token = $1::VARCHAR
2026-09-14 13:30:15,791 INFO sqlalchemy.engine.Engine [cached since 41.83s ago] ('bd0b1237-c2f9-47d6-a94b-e453ee2cc576',)
2026-09-14 13:30:15,794 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:15,799 INFO sqlalchemy.engine.Engine SELECT refresh_tokens.id, refresh_tokens.user_id, refresh_tokens.token, refresh_tokens.expires_at, refresh_tokens.created_at
FROM refresh_tokens
WHERE refresh_tokens.token = $1::VARCHAR
2026-09-14 13:30:15,801 INFO sqlalchemy.engine.Engine [cached since 41.84s ago] ('bd0b1237-c2f9-47d6-a94b-e453ee2cc576',)
2026-09-14 13:30:15,808 INFO sqlalchemy.engine.Engine SELECT users.id, users.tenant_id, users.email, users.password_hash, users.role, users.email_verified, users.created_at, users.updated_at
FROM users
WHERE users.id = $1::UUID
2026-09-14 13:30:15,809 INFO sqlalchemy.engine.Engine [cached since 41.78s ago] (UUID('940fe78c-35ea-479a-b33f-fee352a9728c'),)
2026-09-14 13:30:15,818 INFO sqlalchemy.engine.Engine SELECT users.id, users.tenant_id, users.email, users.password_hash, users.role, users.email_verified, users.created_at, users.updated_at
FROM users
WHERE users.id = $1::UUID
2026-09-14 13:30:15,819 INFO sqlalchemy.engine.Engine [cached since 41.79s ago] (UUID('940fe78c-35ea-479a-b33f-fee352a9728c'),)
2026-09-14 13:30:15,824 INFO sqlalchemy.engine.Engine DELETE FROM refresh_tokens WHERE refresh_tokens.token = $1::VARCHAR
2026-09-14 13:30:15,824 INFO sqlalchemy.engine.Engine [cached since 41.63s ago] ('bd0b1237-c2f9-47d6-a94b-e453ee2cc576',)
2026-09-14 13:30:15,835 INFO sqlalchemy.engine.Engine INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at) VALUES ($1::UUID, $2::UUID, $3::VARCHAR, $4::TIMESTAMP WITHOUT TIME ZONE, $5::TIMESTAMP WITHOUT TIME ZONE)
2026-09-14 13:30:15,837 INFO sqlalchemy.engine.Engine [cached since 41.62s ago] (UUID('84077033-2891-48b0-9a9f-48e91cf75bc3'), UUID('940fe78c-35ea-479a-b33f-fee352a9728c'), 'd2c802a6-add3-4375-9b4f-585647657195', datetime.datetime(2026, 9, 21, 8, 0, 15, 833357), datetime.datetime(2026, 9, 14, 8, 0, 15, 835546))
2026-09-14 13:30:15,843 INFO sqlalchemy.engine.Engine DELETE FROM refresh_tokens WHERE refresh_tokens.token = $1::VARCHAR
2026-09-14 13:30:15,852 INFO sqlalchemy.engine.Engine [cached since 41.66s ago] ('bd0b1237-c2f9-47d6-a94b-e453ee2cc576',)
2026-09-14 13:30:15,857 INFO sqlalchemy.engine.Engine COMMIT
2026-09-14 13:30:15,885 INFO sqlalchemy.engine.Engine INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at) VALUES ($1::UUID, $2::UUID, $3::VARCHAR, $4::TIMESTAMP WITHOUT TIME ZONE, $5::TIMESTAMP WITHOUT TIME ZONE)
2026-09-14 13:30:15,891 INFO sqlalchemy.engine.Engine [cached since 41.67s ago] (UUID('9b3297f3-cb28-40b1-bbc0-54764b75fdc3'), UUID('940fe78c-35ea-479a-b33f-fee352a9728c'), '5d1af332-bf74-41ed-8b33-431bdc3bec16', datetime.datetime(2026, 9, 21, 8, 0, 15, 875844), datetime.datetime(2026, 9, 14, 8, 0, 15, 885670))
INFO: 127.0.0.1:61930 - "POST /api/auth/refresh HTTP/1.1" 200 OK
2026-09-14 13:30:15,925 INFO sqlalchemy.engine.Engine COMMIT
2026-09-14 13:30:15,953 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:15,954 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-14 13:30:15,955 INFO sqlalchemy.engine.Engine [cached since 41.43s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'))
INFO: 127.0.0.1:55716 - "POST /api/auth/refresh HTTP/1.1" 200 OK
2026-09-14 13:30:15,962 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-14 13:30:15,962 INFO sqlalchemy.engine.Engine [cached since 41.4s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'),)
2026-09-14 13:30:15,974 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
LIMIT $3::INTEGER
2026-09-14 13:30:15,974 INFO sqlalchemy.engine.Engine [cached since 41.37s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 'ACTIVE', 1)
INFO: 127.0.0.1:61930 - "GET /api/admin/clients/6b4b6128-5b5f-4d2f-b5de-91511ab9b120/agents/d04b7889-223a-45c8-bde5-8717cc435302 HTTP/1.1" 200 OK
2026-09-14 13:30:15,995 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:30:16,014 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:16,015 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-14 13:30:16,016 INFO sqlalchemy.engine.Engine [cached since 41.5s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'))
2026-09-14 13:30:16,023 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:16,023 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-14 13:30:16,024 INFO sqlalchemy.engine.Engine [cached since 41.5s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'))
2026-09-14 13:30:16,027 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-14 13:30:16,027 INFO sqlalchemy.engine.Engine [cached since 41.46s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'),)
2026-09-14 13:30:16,032 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-14 13:30:16,034 INFO sqlalchemy.engine.Engine [cached since 41.47s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'),)
2026-09-14 13:30:16,048 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
LIMIT $3::INTEGER
2026-09-14 13:30:16,049 INFO sqlalchemy.engine.Engine [cached since 41.44s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 'ACTIVE', 1)
2026-09-14 13:30:16,054 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
LIMIT $3::INTEGER
2026-09-14 13:30:16,055 INFO sqlalchemy.engine.Engine [cached since 41.45s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 'ACTIVE', 1)
INFO: 127.0.0.1:55716 - "GET /api/admin/clients/6b4b6128-5b5f-4d2f-b5de-91511ab9b120/agents/d04b7889-223a-45c8-bde5-8717cc435302 HTTP/1.1" 200 OK
2026-09-14 13:30:16,083 INFO sqlalchemy.engine.Engine ROLLBACK
INFO: 127.0.0.1:61930 - "GET /api/admin/clients/6b4b6128-5b5f-4d2f-b5de-91511ab9b120/agents/d04b7889-223a-45c8-bde5-8717cc435302/checklist HTTP/1.1" 200 OK
2026-09-14 13:30:16,091 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:30:16,103 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:16,104 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-14 13:30:16,105 INFO sqlalchemy.engine.Engine [cached since 41.58s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'))
2026-09-14 13:30:16,109 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-14 13:30:16,110 INFO sqlalchemy.engine.Engine [cached since 41.55s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'),)
2026-09-14 13:30:16,119 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
LIMIT $3::INTEGER
2026-09-14 13:30:16,119 INFO sqlalchemy.engine.Engine [cached since 41.51s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 'ACTIVE', 1)
INFO: 127.0.0.1:55716 - "GET /api/admin/clients/6b4b6128-5b5f-4d2f-b5de-91511ab9b120/agents/d04b7889-223a-45c8-bde5-8717cc435302/checklist HTTP/1.1" 200 OK
2026-09-14 13:30:16,125 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:30:19,975 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:19,977 INFO sqlalchemy.engine.Engine SELECT count(_) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-14 13:30:19,978 INFO sqlalchemy.engine.Engine [cached since 40.48s ago] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'))
2026-09-14 13:30:19,984 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-14 13:30:19,984 INFO sqlalchemy.engine.Engine [cached since 40.26s ago] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 15, 0)
INFO: 127.0.0.1:55716 - "GET /api/client/calls?limit=15&agentId=d04b7889-223a-45c8-bde5-8717cc435302&tenantId=6b4b6128-5b5f-4d2f-b5de-91511ab9b120 HTTP/1.1" 200 OK
2026-09-14 13:30:20,883 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:30:20,895 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:20,896 INFO sqlalchemy.engine.Engine SELECT count(_) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-14 13:30:20,896 INFO sqlalchemy.engine.Engine [cached since 41.39s ago] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'))
2026-09-14 13:30:20,900 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-14 13:30:20,901 INFO sqlalchemy.engine.Engine [cached since 41.18s ago] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 15, 0)
INFO: 127.0.0.1:61930 - "GET /api/client/calls?limit=15&agentId=d04b7889-223a-45c8-bde5-8717cc435302&tenantId=6b4b6128-5b5f-4d2f-b5de-91511ab9b120 HTTP/1.1" 200 OK
2026-09-14 13:30:21,021 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:30:31,242 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:31,243 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID AND agents.tenant_id = $2::UUID
2026-09-14 13:30:31,244 INFO sqlalchemy.engine.Engine [cached since 56.72s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'))
2026-09-14 13:30:31,250 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
2026-09-14 13:30:31,251 INFO sqlalchemy.engine.Engine [cached since 56.68s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'),)
2026-09-14 13:30:31,263 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.status = $2 ORDER BY deployments.created_at DESC
LIMIT $3::INTEGER
2026-09-14 13:30:31,264 INFO sqlalchemy.engine.Engine [cached since 56.65s ago] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 'ACTIVE', 1)
2026-09-14 13:30:31,272 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.agent_id = $1::UUID AND deployments.tenant_id = $2::UUID AND deployments.status = $3 ORDER BY deployments.created_at DESC
LIMIT $4::INTEGER
2026-09-14 13:30:31,273 INFO sqlalchemy.engine.Engine [generated in 0.00111s] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), 'ACTIVE', 1)
2026-09-14 13:30:31.278 | INFO | app.services.telephony_service:create_outbound_phone_call:58 - [TelephonyService] Calling Plivo to dial +919657954641 with answer URL: https://dandelion-gigantic-challenge.ngrok-free.dev/plivo/test-xml?deploymentId=d3860d97-176d-44f2-85cd-4319f26313b7
2026-09-14 13:30:34.669 | INFO | app.services.telephony_service:create_outbound_phone_call:74 - [TelephonyService] Plivo call initiated successfully: {'api_id': '8bd4efd6-1280-4377-b1ef-7223add35089', 'message': 'call queued', 'request_uuid': '8ef9ade2-6df7-4d19-ac1a-b24febed23e5'}
INFO: 127.0.0.1:49671 - "POST /api/admin/clients/6b4b6128-5b5f-4d2f-b5de-91511ab9b120/agents/d04b7889-223a-45c8-bde5-8717cc435302/phone-test HTTP/1.1" 200 OK
2026-09-14 13:30:34,685 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:30:34,706 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:34,708 INFO sqlalchemy.engine.Engine SELECT count(_) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-14 13:30:34,710 INFO sqlalchemy.engine.Engine [cached since 55.2s ago] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'))
2026-09-14 13:30:34,718 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-14 13:30:34,720 INFO sqlalchemy.engine.Engine [cached since 54.99s ago] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 5, 0)
INFO: 127.0.0.1:49671 - "GET /api/client/calls?limit=5&agentId=d04b7889-223a-45c8-bde5-8717cc435302&tenantId=6b4b6128-5b5f-4d2f-b5de-91511ab9b120 HTTP/1.1" 200 OK
2026-09-14 13:30:34,867 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:30:34,927 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:34,930 INFO sqlalchemy.engine.Engine SELECT count(_) AS count_1
FROM (SELECT call_sessions.id AS id, call_sessions.tenant_id AS tenant_id, call_sessions.agent_id AS agent_id, call_sessions.deployment_id AS deployment_id, call_sessions.room_name AS room_name, call_sessions.caller_number AS caller_number, call_sessions.direction AS direction, call_sessions.status AS status, call_sessions.duration_seconds AS duration_seconds, call_sessions.primary_language AS primary_language, call_sessions.started_at AS started_at, call_sessions.ended_at AS ended_at, call_sessions.transcript_text AS transcript_text, call_sessions.turns_json AS turns_json, call_sessions.tools_used AS tools_used, call_sessions.metrics_json AS metrics_json, call_sessions.created_at AS created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID) AS anon_1
2026-09-14 13:30:34,931 INFO sqlalchemy.engine.Engine [cached since 55.43s ago] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'))
2026-09-14 13:30:34,937 INFO sqlalchemy.engine.Engine SELECT call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
FROM call_sessions
WHERE call_sessions.tenant_id = $1::UUID AND call_sessions.agent_id = $2::UUID ORDER BY call_sessions.started_at DESC
LIMIT $3::INTEGER OFFSET $4::INTEGER
2026-09-14 13:30:34,941 INFO sqlalchemy.engine.Engine [cached since 55.21s ago] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 15, 0)
INFO: 127.0.0.1:49671 - "GET /api/client/calls?limit=15&agentId=d04b7889-223a-45c8-bde5-8717cc435302&tenantId=6b4b6128-5b5f-4d2f-b5de-91511ab9b120 HTTP/1.1" 200 OK
2026-09-14 13:30:35,097 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:30:47,519 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:47,522 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.id = $1::UUID
2026-09-14 13:30:47,522 INFO sqlalchemy.engine.Engine [generated in 0.00072s] (UUID('d3860d97-176d-44f2-85cd-4319f26313b7'),)
2026-09-14 13:30:47,528 INFO sqlalchemy.engine.Engine SELECT agents.id, agents.tenant_id, agents.template_id, agents.name, agents.status, agents.created_at, agents.updated_at
FROM agents
WHERE agents.id = $1::UUID
2026-09-14 13:30:47,529 INFO sqlalchemy.engine.Engine [generated in 0.00069s] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'),)
2026-09-14 13:30:47,534 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.id = $1::UUID
2026-09-14 13:30:47,535 INFO sqlalchemy.engine.Engine [generated in 0.00072s] (UUID('54f23732-7d70-4c15-b763-58ee9acaf6d4'),)
2026-09-14 13:30:47,542 INFO sqlalchemy.engine.Engine SELECT agent_versions.id, agent_versions.agent_id, agent_versions.version_number, agent_versions.configuration, agent_versions.status, agent_versions.created_by, agent_versions.notes, agent_versions.created_at
FROM agent_versions
WHERE agent_versions.agent_id = $1::UUID ORDER BY agent_versions.version_number DESC
LIMIT $2::INTEGER
2026-09-14 13:30:47,543 INFO sqlalchemy.engine.Engine [generated in 0.00086s] (UUID('d04b7889-223a-45c8-bde5-8717cc435302'), 1)
2026-09-14 13:30:47,552 INFO sqlalchemy.engine.Engine SELECT agent_templates.id, agent_templates.name, agent_templates.description, agent_templates.industry, agent_templates.default_configuration, agent_templates.is_system, agent_templates.created_at
FROM agent_templates
WHERE agent_templates.id = $1::UUID
2026-09-14 13:30:47,553 INFO sqlalchemy.engine.Engine [generated in 0.00076s] (UUID('a161d3e4-627d-4062-8f1d-3d4f83b45e5f'),)
INFO: 127.0.0.1:60859 - "GET /api/internal/runtime-config/d3860d97-176d-44f2-85cd-4319f26313b7 HTTP/1.1" 200 OK
2026-09-14 13:30:47,596 INFO sqlalchemy.engine.Engine ROLLBACK
2026-09-14 13:30:47,767 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:30:47,772 INFO sqlalchemy.engine.Engine INSERT INTO call_sessions (id, tenant_id, agent_id, deployment_id, room_name, caller_number, direction, status, duration_seconds, primary_language, started_at, ended_at, transcript_text, turns_json, tools_used, metrics_json, created_at) VALUES ($1::UUID, $2::UUID, $3::UUID, $4::UUID, $5::VARCHAR, $6::VARCHAR, $7, $8, $9::INTEGER, $10::VARCHAR, $11::TIMESTAMP WITHOUT TIME ZONE, $12::TIMESTAMP WITHOUT TIME ZONE, $13::VARCHAR, $14::JSONB, $15::JSONB, $16::JSONB, $17::TIMESTAMP WITHOUT TIME ZONE)
2026-09-14 13:30:47,773 INFO sqlalchemy.engine.Engine [generated in 0.00149s] (UUID('e99d5de2-ff9e-4378-90e6-f2f23e86eda7'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('d3860d97-176d-44f2-85cd-4319f26313b7'), 'dddc17ac-f7a6-4c54-98a0-0156fa362162', None, 'INBOUND', 'ACTIVE', 0, 'mr-IN', datetime.datetime(2026, 9, 14, 8, 0, 47, 765832), None, None, '[]', '[]', '{}', datetime.datetime(2026, 9, 14, 8, 0, 47, 765832))
2026-09-14 13:30:47,783 INFO sqlalchemy.engine.Engine COMMIT
INFO: 127.0.0.1:60859 - "POST /api/internal/call-sessions HTTP/1.1" 201 Created
2026-09-14 13:31:57,635 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:31:57,636 INFO sqlalchemy.engine.Engine SELECT deployments.id, deployments.tenant_id, deployments.agent_id, deployments.version_id, deployments.environment, deployments.status, deployments.created_by, deployments.deployed_at, deployments.created_at, deployments.updated_at
FROM deployments
WHERE deployments.id = $1::UUID
2026-09-14 13:31:57,637 INFO sqlalchemy.engine.Engine [cached since 70.1s ago] (UUID('d3860d97-176d-44f2-85cd-4319f26313b7'),)
2026-09-14 13:31:57,641 INFO sqlalchemy.engine.Engine SELECT tenant_appointment_counters.tenant_id, tenant_appointment_counters.last_number, tenant_appointment_counters.updated_at
FROM tenant_appointment_counters
WHERE tenant_appointment_counters.tenant_id = $1::UUID FOR UPDATE
2026-09-14 13:31:57,642 INFO sqlalchemy.engine.Engine [generated in 0.00052s] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'),)
2026-09-14 13:31:57,668 INFO sqlalchemy.engine.Engine INSERT INTO tenant_appointment_counters (tenant_id, last_number, updated_at) VALUES ($1::UUID, $2::INTEGER, $3::TIMESTAMP WITHOUT TIME ZONE)
2026-09-14 13:31:57,668 INFO sqlalchemy.engine.Engine [generated in 0.00063s] (UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), 1001, datetime.datetime(2026, 9, 14, 8, 1, 57, 668447))
2026-09-14 13:31:57,690 INFO sqlalchemy.engine.Engine INSERT INTO appointments (id, tenant_id, agent_id, call_session_id, appointment_number, customer_name, customer_phone, title, resource_name, booking_date, booking_time, status, notes, metadata, created_at, updated_at) VALUES ($1::UUID, $2::UUID, $3::UUID, $4::UUID, $5::VARCHAR, $6::VARCHAR, $7::VARCHAR, $8::VARCHAR, $9::VARCHAR, $10::VARCHAR, $11::VARCHAR, $12, $13::VARCHAR, $14::JSONB, $15::TIMESTAMP WITHOUT TIME ZONE, $16::TIMESTAMP WITHOUT TIME ZONE)
2026-09-14 13:31:57,690 INFO sqlalchemy.engine.Engine [generated in 0.00071s] (UUID('25395540-2bfb-49bd-bc11-3182ebdc041b'), UUID('6b4b6128-5b5f-4d2f-b5de-91511ab9b120'), UUID('d04b7889-223a-45c8-bde5-8717cc435302'), UUID('e99d5de2-ff9e-4378-90e6-f2f23e86eda7'), 'APT-1001', 'Omparki', '+910000000000', 'General Checkup', None, '2026-09-14', '2:00 PM', 'REQUESTED', 'Age: 22; Place: Nagpur', '{"age": "22", "place": "Nagpur", "location": "Nagpur"}', datetime.datetime(2026, 9, 14, 8, 1, 57, 690051), datetime.datetime(2026, 9, 14, 8, 1, 57, 690057))
2026-09-14 13:31:57,724 INFO sqlalchemy.engine.Engine COMMIT
INFO: 127.0.0.1:62156 - "POST /api/internal/appointments HTTP/1.1" 201 Created
2026-09-14 13:32:11,729 INFO sqlalchemy.engine.Engine BEGIN (implicit)
2026-09-14 13:32:11,739 INFO sqlalchemy.engine.Engine UPDATE call_sessions SET status=$1, duration_seconds=$2::INTEGER, ended_at=$3::TIMESTAMP WITHOUT TIME ZONE, transcript_text=$4::VARCHAR, turns_json=$5::JSONB, tools_used=$6::JSONB, metrics_json=$7::JSONB WHERE call_sessions.id = $8::UUID RETURNING call_sessions.id, call_sessions.tenant_id, call_sessions.agent_id, call_sessions.deployment_id, call_sessions.room_name, call_sessions.caller_number, call_sessions.direction, call_sessions.status, call_sessions.duration_seconds, call_sessions.primary_language, call_sessions.started_at, call_sessions.ended_at, call_sessions.transcript_text, call_sessions.turns_json, call_sessions.tools_used, call_sessions.metrics_json, call_sessions.created_at
2026-09-14 13:32:11,739 INFO sqlalchemy.engine.Engine [generated in 0.00264s] ('COMPLETED', 85, datetime.datetime(2026, 9, 14, 8, 2, 11, 698059), 'Assistant: नमस्कार! Glaze Dental Clinic मध्ये आपले स्वागत आहे. मी आपली काय मदत करू शकतो?', '[{"turnId": 1, "startTime": "2026-09-14T08:00:47.707316+00:00", "tools": [{"toolName": "book_appointment", "callId": "call_513ac205126442d0acff3fc6", ... (586 characters truncated) ... ", "activeLanguage": "mr-IN", "interrupted": false, "timestamp": "2026-09-14T08:00:47.707316+00:00"}, "endTime": "2026-09-14T08:00:47.707316+00:00"}]', '["book_appointment"]', '{"callDurationMs": 84597, "callStartedAt": "2026-09-14T08:00:46.819541+00:00", "callEndedAt": "2026-09-14T08:02:11.429359+00:00", "totalTurns": 0, "t ... (88893 characters truncated) ... 4T08:02:01.983962+00:00", "monotonicTimestamp": 103598.3931, "elapsedFromCallStartMs": 75153}], "phoneTraces": [], "toolsUsed": ["book_appointment"]}', UUID('e99d5de2-ff9e-4378-90e6-f2f23e86eda7'))
2026-09-14 13:32:11,851 INFO sqlalchemy.engine.Engine COMMIT
INFO: 127.0.0.1:62176 - "PATCH /api/internal/call-sessions/e99d5de2-ff9e-4378-90e6-f2f23e86eda7 HTTP/1.1" 200 OK
