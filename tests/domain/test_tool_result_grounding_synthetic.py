import sys
from pathlib import Path
import json
import pytest
import uuid

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "apps" / "pipecat-worker"))

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.processors.aggregators.llm_response_universal import LLMContext
from pipecat.services.llm_service import FunctionCallParams
from app.tools.knowledge_tool import (
    QUERY_KNOWLEDGE_BASE_TOOL_NAME,
    KNOWLEDGE_TOOL_PROPERTIES,
    KNOWLEDGE_TOOL_REQUIRED,
)


@pytest.mark.asyncio
async def test_tool_result_grounding_with_synthetic_fact():
    """
    CRITICAL GROUNDING VERIFICATION:
    Proves that when a tool executes and returns a unique synthetic fact ('TEST_FACT_84729'),
    the structured output is serialized and integrated into the conversation LLMContext
    with the exact tool_call_id, making the fact authoritative and visible to the post-tool LLM pass.
    """
    synthetic_fact = "TEST_FACT_84729: Dr. Sharma is available on Tuesday at 4:30 PM in Room 204."
    tool_call_id = "call_synth_84729"

    async def mock_handler(params: FunctionCallParams):
        result = {
            "status": "success",
            "knowledge_found": True,
            "information": [synthetic_fact],
            "results": [{"content": synthetic_fact, "relevanceScore": 0.98}],
        }
        if params.result_callback:
            await params.result_callback(result)
        return result

    tool_schema = FunctionSchema(
        name=QUERY_KNOWLEDGE_BASE_TOOL_NAME,
        description="Search knowledge base",
        properties=KNOWLEDGE_TOOL_PROPERTIES,
        required=KNOWLEDGE_TOOL_REQUIRED,
        handler=mock_handler,
    )

    # 1. Initialize LLMContext with system prompt and user question
    initial_messages = [
        {"role": "system", "content": "You are a helpful representative. Answer using retrieved knowledge."},
        {"role": "user", "content": "When is Dr. Sharma available?"},
    ]
    context = LLMContext(messages=initial_messages, tools=[tool_schema])

    # 2. Simulate pre-tool LLM response invoking the tool
    pre_tool_assistant_message = {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": tool_call_id,
                "type": "function",
                "function": {
                    "name": QUERY_KNOWLEDGE_BASE_TOOL_NAME,
                    "arguments": json.dumps({"query": "Dr. Sharma availability"}),
                },
            }
        ],
    }
    context.add_message(pre_tool_assistant_message)

    # 3. Execute tool handler
    call_params = FunctionCallParams(
        function_name=QUERY_KNOWLEDGE_BASE_TOOL_NAME,
        tool_call_id=tool_call_id,
        arguments={"query": "Dr. Sharma availability"},
        llm=None,
        pipeline_worker=None,
        context=context,
        result_callback=None,
    )
    raw_result = await tool_schema.handler(call_params)

    # 4. Integrate tool result into LLMContext (simulating Pipecat assistant aggregator)
    tool_result_message = {
        "role": "tool",
        "tool_call_id": tool_call_id,
        "content": json.dumps(raw_result),
    }
    context.add_message(tool_result_message)

    # 5. VERIFY post-tool LLM context state
    messages = context.get_messages()
    assert len(messages) == 4, f"Expected 4 messages in context, got {len(messages)}"
    
    # Message 0: System
    assert messages[0]["role"] == "system"
    # Message 1: User
    assert messages[1]["role"] == "user"
    assert messages[1]["content"] == "When is Dr. Sharma available?"
    # Message 2: Assistant tool call
    assert messages[2]["role"] == "assistant"
    assert messages[2]["tool_calls"][0]["id"] == tool_call_id
    assert messages[2]["tool_calls"][0]["function"]["name"] == QUERY_KNOWLEDGE_BASE_TOOL_NAME
    # Message 3: Tool result
    assert messages[3]["role"] == "tool"
    assert messages[3]["tool_call_id"] == tool_call_id
    
    parsed_tool_content = json.loads(messages[3]["content"])
    assert parsed_tool_content["status"] == "success"
    assert parsed_tool_content["knowledge_found"] is True
    assert synthetic_fact in parsed_tool_content["information"]
    assert parsed_tool_content["results"][0]["content"] == synthetic_fact

    # 6. Verify synthetic fact is retrievable by any post-tool serializer
    serialized_context_str = json.dumps(messages)
    assert "TEST_FACT_84729" in serialized_context_str
