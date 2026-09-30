from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
import redis.asyncio as redis
from .config import settings
from .logging import logger

Base = declarative_base()

import sys
from sqlalchemy.pool import NullPool

# Async PostgreSQL Engine
if settings.NODE_ENV in ["test", "testing"] or "pytest" in sys.modules:
    engine = create_async_engine(
        settings.get_normalized_database_url(),
        poolclass=NullPool,
        echo=(settings.LOG_LEVEL == "debug")
    )
else:
    engine = create_async_engine(
        settings.get_normalized_database_url(),
        pool_size=10,
        max_overflow=5,
        pool_recycle=3600,
        echo=(settings.LOG_LEVEL == "debug")
    )

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# Redis Async Connection
redis_client = redis.from_url(
    settings.REDIS_URL,
    decode_responses=True
)

async def get_redis() -> redis.Redis:
    return redis_client

async def init_db():
    """Idempotent database schema initialization and migrations."""
    from . import models

    # 1. Ensure pgvector extension is enabled (required before vector columns are referenced)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            logger.info("Verified pgvector extension is active.")
    except Exception as e:
        logger.warning(f"init_db pgvector extension notice: {e}")

    # 2. Bootstrap base schema tables if starting on a clean database
    try:
        async with engine.begin() as conn:
            await conn.run_sync(models.Base.metadata.create_all)
            logger.info("Verified base database schema tables exist.")
    except Exception as e:
        logger.warning(f"init_db Base.metadata.create_all notice: {e}")

    # 3. Apply incremental / backward-compatible column migrations
    statements = [
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booked_by VARCHAR(50) DEFAULT 'AGENT';",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booked_by_name VARCHAR(255);",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS age VARCHAR(20);",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS place VARCHAR(255);",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS walk_in BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE call_sessions ALTER COLUMN agent_id DROP NOT NULL;",
        "ALTER TABLE call_sessions ALTER COLUMN deployment_id DROP NOT NULL;",
        "ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS plivo_call_uuid VARCHAR(100);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_call_sessions_plivo_call_uuid ON call_sessions (plivo_call_uuid) WHERE plivo_call_uuid IS NOT NULL;",
        """CREATE TABLE IF NOT EXISTS call_recordings (
            id UUID PRIMARY KEY,
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            call_session_id UUID REFERENCES call_sessions(id) ON DELETE SET NULL,
            plivo_call_uuid VARCHAR(100) NOT NULL,
            plivo_recording_id VARCHAR(100) NOT NULL,
            recording_url TEXT NOT NULL,
            recording_format VARCHAR(20) NOT NULL DEFAULT 'mp3',
            duration_seconds INTEGER NOT NULL DEFAULT 0,
            status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
        );""",
        "CREATE INDEX IF NOT EXISTS idx_call_recordings_plivo_call_uuid ON call_recordings (plivo_call_uuid);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_call_recordings_plivo_recording_id ON call_recordings (plivo_recording_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_call_recordings_call_session_id ON call_recordings (call_session_id) WHERE call_session_id IS NOT NULL;",
        "CREATE INDEX IF NOT EXISTS idx_call_recordings_tenant_id ON call_recordings (tenant_id);"
    ]
    try:
        async with engine.begin() as conn:
            for stmt in statements:
                await conn.execute(text(stmt))
    except Exception as e:
        logger.warning(f"init_db incremental column migrations notice: {e}")

    try:
        async with engine.connect() as conn:
            await conn.execute(text("COMMIT;"))
            await conn.execute(text("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'CLIENT_RECEPTIONIST';"))
    except Exception as e:
        logger.debug(f"init_db enum migration: {e}")

async def close_db():
    await engine.dispose()
    try:
        await redis_client.aclose()
    except Exception:
        pass
