import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.tools.knowledge_tool import (
    create_knowledge_tool_factory,
    global_knowledge_cache,
    KnowledgeQueryCache,
    QUERY_KNOWLEDGE_BASE_TOOL_NAME
)
from app.tools.tool_registry import ToolRuntimeContext
from pipecat.services.llm_service import FunctionCallParams

import sys
import os
import importlib.util
import types

api_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../api/app"))

# Register api_app package hierarchy to avoid colliding with worker's app package
api_app = types.ModuleType("api_app")
api_app.__path__ = [api_dir]
sys.modules["api_app"] = api_app

services_pkg = types.ModuleType("api_app.services")
services_pkg.__path__ = [os.path.join(api_dir, "services")]
sys.modules["api_app.services"] = services_pkg

models_spec = importlib.util.spec_from_file_location("api_app.models", os.path.join(api_dir, "models.py"))
models_mod = importlib.util.module_from_spec(models_spec)
sys.modules["api_app.models"] = models_mod
models_spec.loader.exec_module(models_mod)

logging_spec = importlib.util.spec_from_file_location("api_app.logging", os.path.join(api_dir, "logging.py"))
logging_mod = importlib.util.module_from_spec(logging_spec)
sys.modules["api_app.logging"] = logging_mod
logging_spec.loader.exec_module(logging_mod)

ks_spec = importlib.util.spec_from_file_location("api_app.services.knowledge_service", os.path.join(api_dir, "services/knowledge_service.py"))
ks_mod = importlib.util.module_from_spec(ks_spec)
sys.modules["api_app.services.knowledge_service"] = ks_mod
ks_spec.loader.exec_module(ks_mod)

KnowledgeService = ks_mod.KnowledgeService
expand_query_terms = ks_mod.expand_query_terms
MULTILINGUAL_STOPWORDS = ks_mod.MULTILINGUAL_STOPWORDS
CROSS_LINGUAL_CONCEPT_MAP = ks_mod.CROSS_LINGUAL_CONCEPT_MAP


from dataclasses import dataclass

@dataclass
class MockChunk:
    id: uuid.UUID
    sourceId: uuid.UUID
    tenantId: uuid.UUID
    agentId: uuid.UUID
    chunkIndex: int
    content: str
    tokenCount: int


def test_expand_query_terms_multilingual_marathi():
    """Verify stopword stripping and concept expansion for Marathi conversational query."""
    query = "कोणते कोणते ट्रीटमेंट आणि की सर्विस अवेलेबल आहे"
    content_tokens, expanded_terms, matched_concepts = expand_query_terms(query)
    
    # Non-content tokens stripped
    assert "कोणते" not in content_tokens
    assert "आणि" not in content_tokens
    assert "आहे" not in content_tokens
    
    # Core concepts identified
    assert "treatment" in matched_concepts or "service" in matched_concepts
    assert "treatment" in expanded_terms
    assert "उपचार" in expanded_terms
    assert "service" in expanded_terms


def test_expand_query_terms_all_domains():
    """Verify cross-lingual expansion across pricing, timings, doctors, address, hygiene, policies."""
    # 1. Pricing / Cost
    _, terms_cost, concepts_cost = expand_query_terms("रूट कॅनलचा खर्च किती आहे")
    assert "cost" in concepts_cost or "price" in concepts_cost or "root canal" in concepts_cost
    assert "खर्च" in terms_cost
    assert "price" in terms_cost or "cost" in terms_cost

    # 2. Timings / Hours
    _, terms_time, concepts_time = expand_query_terms("क्लिनिक कधी उघडतं आणि रविवारी चालू आहे का")
    assert "timing" in concepts_time or "open" in concepts_time or "holiday" in concepts_time
    assert "timing" in terms_time or "hours" in terms_time or "sunday" in terms_time

    # 3. Doctor / Dentist
    _, terms_doc, concepts_doc = expand_query_terms("डॉक्टर कोण आहेत आणि त्यांचे शिक्षण अनुभव काय")
    assert "doctor" in concepts_doc or "dentist" in concepts_doc
    assert "doctor" in terms_doc or "dentist" in terms_doc

    # 4. Address / Location
    _, terms_addr, concepts_addr = expand_query_terms("क्लिनिकचा पत्ता सांगा कुठे आहे")
    assert "address" in concepts_addr or "location" in concepts_addr
    assert "address" in terms_addr or "location" in terms_addr

    # 5. Hygiene / Safety
    _, terms_hyg, concepts_hyg = expand_query_terms("स्वच्छता आणि sterilization कसं असतं")
    assert "hygiene" in concepts_hyg
    assert "sterilization" in terms_hyg

    # 6. Appointments / Policy
    _, terms_apt, concepts_apt = expand_query_terms("अपॉइंटमेंट रद्द करण्याचे नियम काय आहेत")
    assert "appointment" in concepts_apt or "cancel" in concepts_apt or "policy" in concepts_apt


@pytest.mark.asyncio
async def test_knowledge_service_retrieval_marathi_treatments():
    """Simulate KnowledgeService retrieval with uploaded clinic document against Marathi query."""
    mock_session = AsyncMock()
    service = KnowledgeService(mock_session)
    
    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    source_id = uuid.uuid4()
    
    # Realistic uploaded clinic knowledge chunks in English
    chunks = [
        MockChunk(
            id=uuid.uuid4(),
            sourceId=source_id,
            tenantId=tenant_id,
            agentId=agent_id,
            chunkIndex=0,
            content="Welcome to Glaze Dental Clinic. We provide world-class dental care in Pune. Founder Dr. Amit Sharma (MDS Orthodontics) has 12 years of experience.",
            tokenCount=30
        ),
        MockChunk(
            id=uuid.uuid4(),
            sourceId=source_id,
            tenantId=tenant_id,
            agentId=agent_id,
            chunkIndex=1,
            content="Treatments & Services offered: Root Canal Treatment (RCT), Dental Implants, Teeth Whitening, Teeth Cleaning & Scaling, Braces & Aligners, Tooth Extraction, and Cavity Fillings.",
            tokenCount=35
        ),
        MockChunk(
            id=uuid.uuid4(),
            sourceId=source_id,
            tenantId=tenant_id,
            agentId=agent_id,
            chunkIndex=2,
            content="Pricing and Costs: Consultation fee is Rs 300. Root Canal starts at Rs 2500. Teeth Cleaning is Rs 1000. Dental Implants start at Rs 20000. EMI options available.",
            tokenCount=35
        ),
        MockChunk(
            id=uuid.uuid4(),
            sourceId=source_id,
            tenantId=tenant_id,
            agentId=agent_id,
            chunkIndex=3,
            content="Clinic Timings: Open Monday to Saturday 9:00 AM to 9:00 PM. Sunday 10:00 AM to 2:00 PM. Address: 2nd Floor, Phoenix Mall Road, Viman Nagar, Pune. Free parking available.",
            tokenCount=35
        )
    ]
    
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = chunks
    mock_session.execute.return_value = mock_result
    
    # 1. Query: "कोणते कोणते ट्रीटमेंट आणि की सर्विस अवेलेबल आहे"
    results = await service.retrieve_relevant_chunks(
        tenant_id=tenant_id,
        agent_id=agent_id,
        query="कोणते कोणते ट्रीटमेंट आणि की सर्विस अवेलेबल आहे",
        top_k=2
    )
    assert len(results) > 0
    # Must retrieve chunk index 1 (Treatments & Services)
    assert results[0]["chunkIndex"] == 1
    assert "Root Canal Treatment" in results[0]["content"]

    # 2. Query: "रूट कॅनलचा खर्च किती आहे"
    results_cost = await service.retrieve_relevant_chunks(
        tenant_id=tenant_id,
        agent_id=agent_id,
        query="रूट कॅनलचा खर्च किती आहे",
        top_k=2
    )
    assert len(results_cost) > 0
    assert results_cost[0]["chunkIndex"] in (1, 2)

    # 3. Query: "क्लिनिक कधी चालू असतं आणि पत्ता काय"
    results_time_addr = await service.retrieve_relevant_chunks(
        tenant_id=tenant_id,
        agent_id=agent_id,
        query="क्लिनिक कधी चालू असतं आणि पत्ता काय",
        top_k=2
    )
    assert len(results_time_addr) > 0
    assert results_time_addr[0]["chunkIndex"] == 3
    assert "Phoenix Mall Road" in results_time_addr[0]["content"]


@pytest.mark.asyncio
async def test_knowledge_service_overview_fallback():
    """Verify that broad/exploratory query gracefully falls back to Chunk 0 instead of returning empty."""
    mock_session = AsyncMock()
    service = KnowledgeService(mock_session)
    
    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    source_id = uuid.uuid4()
    
    chunks = [
        MockChunk(
            id=uuid.uuid4(),
            sourceId=source_id,
            tenantId=tenant_id,
            agentId=agent_id,
            chunkIndex=0,
            content="Glaze Dental Clinic is a premier clinic in Pune offering top dental treatments.",
            tokenCount=20
        )
    ]
    
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = chunks
    mock_session.execute.return_value = mock_result
    
    results = await service.retrieve_relevant_chunks(
        tenant_id=tenant_id,
        agent_id=agent_id,
        query="मला काहीतरी सांगा",
        top_k=1
    )
    assert len(results) == 1
    assert results[0]["chunkIndex"] == 0


class MockFunctionCallParams:
    def __init__(self, function_name="query_knowledge_base", tool_call_id="call_1", arguments=None, result_callback=None):
        self.function_name = function_name
        self.tool_call_id = tool_call_id
        self.arguments = arguments or {}
        self.result_callback = result_callback


@pytest.mark.asyncio
async def test_positive_only_cache_in_worker_tool():
    """Verify that query_knowledge_base only caches when knowledge is found, preventing negative poisoning."""
    cache = KnowledgeQueryCache()
    
    context = ToolRuntimeContext(
        deployment_id="dep-test-rag",
        tenant_id="tenant-123",
        agent_id="agent-123",
        api_url="http://mock-api:8000",
        worker_secret="secret",
    )
    
    with patch("app.tools.knowledge_tool.global_knowledge_cache", cache):
        with patch("app.tools.knowledge_tool.RuntimeConfigClient") as MockClient:
            mock_instance = AsyncMock()
            MockClient.return_value = mock_instance
            
            # 1. Negative response (no knowledge found)
            empty_resp = MagicMock()
            empty_resp.results = []
            mock_instance.retrieve_knowledge.return_value = empty_resp
            
            schema = create_knowledge_tool_factory(context)
            params = MockFunctionCallParams(
                function_name=QUERY_KNOWLEDGE_BASE_TOOL_NAME,
                arguments={"query": "random obscure question"},
                tool_call_id="call-1",
            )
            res = await schema.handler(params)
            assert res["knowledge_found"] is False
            
            # Cache MUST NOT contain this negative result
            assert cache.get("dep-test-rag", "random obscure question") is None
            
            # 2. Positive response
            found_item = MagicMock()
            found_item.content = "Root Canal Treatment available."
            found_item.score = 0.85
            positive_resp = MagicMock()
            positive_resp.results = [found_item]
            mock_instance.retrieve_knowledge.return_value = positive_resp
            
            params_pos = MockFunctionCallParams(
                function_name=QUERY_KNOWLEDGE_BASE_TOOL_NAME,
                arguments={"query": "treatment services"},
                tool_call_id="call-2",
            )
            res_pos = await schema.handler(params_pos)
            assert res_pos["knowledge_found"] is True
            assert len(res_pos["information"]) > 0
            
            # Cache MUST contain this positive result
            cached_val = cache.get("dep-test-rag", "treatment services")
            assert cached_val is not None
            assert cached_val["knowledge_found"] is True
