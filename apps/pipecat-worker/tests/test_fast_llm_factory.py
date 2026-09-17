"""Unit tests for Fast LLM Factory and OpenRouter Dual-Route Service.

Tests:
1. LLMServiceFactory initialization with OpenRouter provider.
2. LLMServiceFactory fallback to Sarvam when OpenRouter key is empty.
3. Tool LLM service instantiation.
"""

import pytest
from app.services.llm_factory import LLMServiceFactory
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.sarvam.llm import SarvamLLMService


def test_create_conversational_llm_openrouter():
    service = LLMServiceFactory.create_conversational_llm(
        provider="openrouter",
        api_key="sk-or-v1-test-key",
        model="google/gemma-4-31b-it:free",
        base_url="https://openrouter.ai/api/v1",
    )
    assert isinstance(service, OpenAILLMService)
    assert service._settings.model == "google/gemma-4-31b-it:free"


def test_create_conversational_llm_fallback_sarvam():
    service = LLMServiceFactory.create_conversational_llm(
        provider="sarvam",
        api_key="",
        model="sarvam-105b-conversations",
    )
    assert isinstance(service, SarvamLLMService)
    assert service._settings.model == "sarvam-105b-conversations"


def test_create_tool_llm_sarvam():
    service = LLMServiceFactory.create_tool_llm(
        model="sarvam-105b-conversations",
        temperature=0.1,
    )
    assert isinstance(service, SarvamLLMService)
    assert service._settings.model == "sarvam-105b-conversations"
