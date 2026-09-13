"""Configuration settings for NextLite Pipecat Worker.

Infrastructure configuration only. Dynamic business configuration (prompts, voices, tools)
is resolved dynamically from the NextLite Control Plane in later migration phases.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    LOG_LEVEL: str = "INFO"

    # NextLite Control Plane API configuration
    NEXTLITE_API_URL: str = "http://localhost:3001"
    WORKER_API_SECRET: str = "dev-livekit-worker-secret-v3"
    RUNTIME_CONFIG_TIMEOUT_SECONDS: float = 8.0

    # Sarvam AI API Credentials
    SARVAM_API_KEY: str = ""

    # Audio diagnostic logging flag (default: False to prevent log spam)
    PIPECAT_AUDIO_DEBUG: bool = False

    # Phase 2 & 4 technical test defaults (temporary pipeline verification only)
    STT_MODEL: str = "saaras:v3-realtime"
    TTS_MODEL: str = "bulbul:v3"
    LLM_MODEL: str = "sarvam-105b-conversations"
    PHASE2_TEST_VOICE_ID: str = "shubh"  # Scoped to telephony test loopback
    TEST_PROMPT: str = (
        "You are a helpful voice assistant. "
        "Reply naturally and briefly in 1-2 sentences. "
        "Answer the caller's question directly. "
        "Maintain conversation context. "
        "Do not claim to perform actions you did not perform."
    )

    # Infrastructure variables for Plivo POC / test endpoint
    PLIVO_AUTH_ID: str = ""
    PLIVO_AUTH_TOKEN: str = ""
    PLIVO_PHONE_NUMBER: str = ""

    # Optional simple security token for POC endpoint
    POC_SECRET_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=(".env", "apps/pipecat-worker/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
