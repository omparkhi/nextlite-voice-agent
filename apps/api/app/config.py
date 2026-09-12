import os
from typing import Optional, Literal
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, AliasChoices

class Settings(BaseSettings):
    PORT: int = 3001
    NODE_ENV: Literal["development", "production", "test"] = "development"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/nextlite"
    REDIS_URL: str = "redis://localhost:6379"

    JWT_SECRET: str = Field(default="dev-jwt-secret-at-least-32-chars-long-12345")
    JWT_REFRESH_SECRET: str = Field(default="dev-jwt-refresh-secret-at-least-32-chars-long-12345")
    JWT_EXPIRES_IN: str = "15m"
    JWT_REFRESH_EXPIRES_IN: str = "7d"

    CORS_ORIGIN: str = "http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:3000"

    RESEND_API_KEY: str = "re_mock_key_for_dev_or_test"
    EMAIL_FROM: str = "onboarding@resend.dev"

    LOG_LEVEL: Literal["debug", "info", "warn", "error"] = "info"

    EMBEDDING_PROVIDER: Literal["nvidia", "gemini"] = "nvidia"
    NVIDIA_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None

    STORAGE_PROVIDER: Literal["b2"] = "b2"
    B2_ENDPOINT: Optional[str] = None
    B2_REGION: Optional[str] = None
    B2_KEY_ID: Optional[str] = None
    B2_APPLICATION_KEY: Optional[str] = None
    B2_BUCKET_NAME: Optional[str] = None

    SARVAM_API_KEY: Optional[str] = None

    # Worker secret (accepts WORKER_API_SECRET or LIVEKIT_WORKER_SECRET)
    WORKER_API_SECRET: str = Field(
        default="dev-livekit-worker-secret-v3",
        validation_alias=AliasChoices("WORKER_API_SECRET", "LIVEKIT_WORKER_SECRET")
    )
    LIVEKIT_WORKER_SECRET: Optional[str] = None

    PIPECAT_URL: Optional[str] = None

    # Telephony
    TELEPHONY_PROVIDER: Literal["exotel", "plivo"] = "plivo"
    PLIVO_AUTH_ID: Optional[str] = None
    PLIVO_AUTH_TOKEN: Optional[str] = None
    PLIVO_CALLER_ID: Optional[str] = None

    EXOTEL_ACCOUNT_SID: Optional[str] = None
    EXOTEL_API_KEY: Optional[str] = None
    EXOTEL_API_TOKEN: Optional[str] = None
    EXOTEL_CALLER_ID: Optional[str] = None
    EXOTEL_BASE_URL: str = "https://api.in.exotel.com"

    model_config = SettingsConfigDict(
        env_file=(".env", "apps/api/.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def get_normalized_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

settings = Settings()
