from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
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
        pool_size=20,
        max_overflow=10,
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
    from sqlalchemy import text
    statements = [
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booked_by VARCHAR(50) DEFAULT 'AGENT';",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booked_by_name VARCHAR(255);",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS age VARCHAR(20);",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS place VARCHAR(255);",
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS walk_in BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"
    ]
    try:
        async with engine.begin() as conn:
            for stmt in statements:
                await conn.execute(text(stmt))
    except Exception as e:
        logger.warning(f"init_db migration warning: {e}")

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

