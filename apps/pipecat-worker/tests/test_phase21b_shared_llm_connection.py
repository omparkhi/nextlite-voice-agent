#
# Copyright (c) 2026, NextLite Voice Agent Engineering.
# Phase 21B: Worker-Lifetime Shared LLM Connection Pool Test Suite.
#

import asyncio
from contextlib import asynccontextmanager
import httpx
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from pipecat.services.sarvam.llm import SarvamLLMSettings
from pipecat.processors.aggregators.llm_context import LLMContext

from app.main import InstrumentedSarvamLLMService, app, lifespan
from app.turn_timing import TurnTimingTracker


@pytest.mark.asyncio
async def test_shared_http_client_injection():
    """Verify that InstrumentedSarvamLLMService injects the worker-lifetime shared httpx client into AsyncOpenAI."""
    shared_client = httpx.AsyncClient()
    try:
        service = InstrumentedSarvamLLMService(
            api_key="test_sarvam_key",
            settings=SarvamLLMSettings(model="sarvam-105b-conversations"),
            http_client=shared_client,
        )
        assert service._shared_http_client is shared_client
        # Verify that the underlying AsyncOpenAI client received the shared httpx.AsyncClient
        assert service._client._client is shared_client
    finally:
        await shared_client.aclose()


@pytest.mark.asyncio
async def test_independent_client_fallback_when_none_provided():
    """Verify that when no shared http_client is passed, the service constructs its own default client."""
    service = InstrumentedSarvamLLMService(
        api_key="test_sarvam_key",
        settings=SarvamLLMSettings(model="sarvam-105b-conversations"),
        http_client=None,
    )
    assert service._shared_http_client is None
    assert service._client._client is not None
    # Ensure it is an httpx.AsyncClient instance
    assert isinstance(service._client._client, httpx.AsyncClient)
    await service._client._client.aclose()


@pytest.mark.asyncio
async def test_multi_tenant_context_isolation_with_shared_transport():
    """
    Verify strict isolation of prompts, messages, and state between multiple calls/tenants
    even when both calls execute across the identical underlying HTTP connection pool.
    """
    shared_client = httpx.AsyncClient()
    try:
        # Call 1: Tenant Apollo - Cardiology
        context_1 = LLMContext(
            messages=[
                {"role": "system", "content": "You are Apollo Hospital Receptionist for Cardiology."},
                {"role": "user", "content": "I need to see Dr. Sharma for chest pain."},
            ]
        )
        service_1 = InstrumentedSarvamLLMService(
            api_key="test_sarvam_key",
            settings=SarvamLLMSettings(model="sarvam-105b-conversations"),
            http_client=shared_client,
        )

        # Call 2: Tenant Fortis - Dental
        context_2 = LLMContext(
            messages=[
                {"role": "system", "content": "You are Fortis Dental Clinic Assistant."},
                {"role": "user", "content": "Can I get a dental cleaning tomorrow?"},
            ]
        )
        service_2 = InstrumentedSarvamLLMService(
            api_key="test_sarvam_key",
            settings=SarvamLLMSettings(model="sarvam-105b-conversations"),
            http_client=shared_client,
        )

        # Confirm shared transport
        assert service_1._client._client is shared_client
        assert service_2._client._client is shared_client

        # Verify context independence
        assert context_1.get_messages() != context_2.get_messages()
        assert "Cardiology" in context_1.get_messages()[0]["content"]
        assert "Dental" in context_2.get_messages()[0]["content"]

        # Mutate context 1 by adding an assistant response
        context_1.add_message({"role": "assistant", "content": "Dr. Sharma is available at 10 AM."})
        assert len(context_1.get_messages()) == 3
        assert len(context_2.get_messages()) == 2
        assert "Dr. Sharma" not in str(context_2.get_messages())

    finally:
        await shared_client.aclose()


@pytest.mark.asyncio
async def test_fastapi_lifespan_manages_sarvam_llm_pool():
    """Verify that FastAPI lifespan initializes and closes the worker-lifetime Sarvam LLM client."""
    test_app = MagicMock()
    test_app.state = MagicMock()

    async with lifespan(test_app):
        # Pool must be created and attached to app.state
        assert hasattr(test_app.state, "sarvam_llm_http_client")
        pool = test_app.state.sarvam_llm_http_client
        assert isinstance(pool, httpx.AsyncClient)
        assert not pool.is_closed

    # On lifespan exit, the pool must be cleanly closed
    assert pool.is_closed


@pytest.mark.asyncio
async def test_timing_tracker_records_http_and_stream_events():
    """Verify that InstrumentedSarvamLLMService accurately instruments HTTP request start and chunk streaming."""
    shared_client = httpx.AsyncClient()
    timing_tracker = TurnTimingTracker()

    try:
        service = InstrumentedSarvamLLMService(
            api_key="test_sarvam_key",
            settings=SarvamLLMSettings(model="sarvam-105b-conversations"),
            timing_tracker=timing_tracker,
            http_client=shared_client,
        )

        mock_stream = AsyncMock()
        mock_chunk = MagicMock()
        mock_chunk.choices = [MagicMock(delta=MagicMock(content="Hello", tool_calls=None))]
        mock_stream.__aiter__.return_value = [mock_chunk]

        with patch.object(service._client.chat.completions, "create", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_stream
            
            # Start a turn
            timing_tracker.start_new_turn()
            context = LLMContext(messages=[{"role": "user", "content": "Hi"}])
            
            stream = await service.get_chat_completions(context)
            assert stream is not None
            
            # Consume the stream
            chunks = []
            async for c in stream:
                chunks.append(c)

            assert len(chunks) == 1
            # Verify timing events were recorded
            assert timing_tracker.llm_request_created is not None
            assert timing_tracker.llm_request_start is not None
            assert timing_tracker.llm_first_provider_response is not None
            assert timing_tracker.first_llm_output is not None
            assert timing_tracker.llm_response_complete is not None
            event_names = [e["event"] for e in timing_tracker.active_turn_events]
            assert "llm_http_request_started" in event_names

    finally:
        await shared_client.aclose()
