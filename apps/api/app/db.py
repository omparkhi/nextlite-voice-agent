from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
import redis.asyncio as redis
from .config import settings
from .logging import logger

Base = declarative_base()

# Async PostgreSQL Engine
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
