"""NextLite Voice V3 — LLM Service Factory & Dual-Route Adapter.

Creates and initializes conversational LLM services:
1. Fast Conversational Route via OpenRouter (Gemma 4 31B / Llama 3.3 70B) for sub-200ms TTFT.
2. Specialized Tool & Validation Route via Sarvam 105B.
"""

from typing import Any, Dict, Optional
from loguru import logger
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.sarvam.llm import SarvamLLMService
from app.config import settings


class LLMServiceFactory:
    """Factory to create and configure low-latency LLM services for voice turn execution."""

    @staticmethod
    def create_conversational_llm(
        *,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 150,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Any:
        """Instantiates the primary conversational LLM service.
        
        If OpenRouter API key is configured and provider is 'openrouter', initializes
        OpenAILLMService pointing to OpenRouter with Gemma 4 31B. Otherwise, defaults
        to SarvamLLMService.
        """
        chosen_provider = (provider or settings.CONVERSATIONAL_LLM_PROVIDER or "openrouter").lower()
        openrouter_key = api_key or settings.OPENROUTER_API_KEY

        if chosen_provider == "openrouter" and openrouter_key and openrouter_key.strip():
            chosen_model = model or settings.CONVERSATIONAL_LLM_MODEL or "google/gemma-4-31b-it:free"
            chosen_base_url = (base_url or settings.OPENROUTER_BASE_URL or "https://openrouter.ai/api/v1").rstrip("/")

            headers = {
                "HTTP-Referer": getattr(settings, "OPENROUTER_HTTP_REFERER", "http://localhost:8000"),
                "X-Title": getattr(settings, "OPENROUTER_TITLE", "NextLite Voice Agent"),
            }
            if extra_headers:
                headers.update(extra_headers)

            logger.info(
                f"[FastLLMFactory] Initializing Fast Conversational LLM via OpenRouter | "
                f"model={chosen_model} | base_url={chosen_base_url} | max_tokens={max_tokens}"
            )

            input_settings = OpenAILLMService.Settings(
                model=chosen_model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            return OpenAILLMService(
                api_key=openrouter_key.strip(),
                base_url=chosen_base_url,
                default_headers=headers,
                settings=input_settings,
            )

        # Fallback to Sarvam 105B
        sarvam_key = settings.SARVAM_API_KEY
        sarvam_model = model or settings.LLM_MODEL or "sarvam-105b-conversations"

        logger.info(
            f"[FastLLMFactory] Initializing Conversational LLM via Sarvam AI | model={sarvam_model}"
        )

        return SarvamLLMService(
            api_key=sarvam_key,
            settings=SarvamLLMService.Settings(
                model=sarvam_model,
                temperature=temperature,
                max_tokens=max_tokens,
            ),
        )

    @staticmethod
    def create_tool_llm(
        *,
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 150,
    ) -> Any:
        """Instantiates the specialized tool & validation LLM service."""
        sarvam_key = settings.SARVAM_API_KEY
        sarvam_model = model or settings.TOOL_LLM_MODEL or "sarvam-105b-conversations"

        logger.info(
            f"[FastLLMFactory] Initializing Tool LLM via Sarvam AI | model={sarvam_model}"
        )

        return SarvamLLMService(
            api_key=sarvam_key,
            settings=SarvamLLMService.Settings(
                model=sarvam_model,
                temperature=temperature,
                max_tokens=max_tokens,
            ),
        )
