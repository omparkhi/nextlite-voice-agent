"""NextLite Pipecat Knowledge Tool (Registry Boundary).

Establishes the native Pipecat FunctionSchema and ToolFactory boundary for
query_knowledge_base.

Phase 7A Status:
- Registry boundary and native Pipecat FunctionSchema are defined and registered.
- Actual vector search / RAG retrieval execution is deferred to Phase 7B.
- No direct database access, embeddings, chunking, or local vector search.
"""

from typing import TYPE_CHECKING, Any, Dict, Optional
import httpx

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

from app.runtime_config_client import RuntimeConfigClient

if TYPE_CHECKING:
    from app.tools.tool_registry import ToolRuntimeContext

QUERY_KNOWLEDGE_BASE_TOOL_NAME = "query_knowledge_base"

KNOWLEDGE_TOOL_PROPERTIES: Dict[str, Any] = {
    "query": {
        "type": "string",
        "description": "Search query for business information",
    },
}

KNOWLEDGE_TOOL_REQUIRED = ["query"]


def create_knowledge_tool_factory(
    context: "ToolRuntimeContext",
    description_override: Optional[str] = None,
    top_k: int = 5,
    http_client: Optional[httpx.AsyncClient] = None,
) -> FunctionSchema:
    """Creates a native Pipecat FunctionSchema boundary for query_knowledge_base."""
    if not context.deployment_id or not context.deployment_id.strip():
        raise ValueError("[KnowledgeTool] deployment_id is required in ToolRuntimeContext")

    tool_description = (
        description_override.strip()
        if description_override and description_override.strip()
        else "Search the knowledge base for business facts, hours, services, staff, pricing, or policies."
    )

    async def handle_query_knowledge_base(params: FunctionCallParams) -> Dict[str, Any]:
        raw_args = params.arguments or {}
        raw_query = raw_args.get("query") if isinstance(raw_args, dict) else None

        if not raw_query or not isinstance(raw_query, str) or not raw_query.strip():
            failure_result = {
                "status": "error",
                "knowledge_found": False,
                "information": [],
                "results": [],
                "error": "Query parameter must not be empty.",
            }
            if params.result_callback:
                await params.result_callback(failure_result)
            return failure_result

        try:
            client = RuntimeConfigClient(
                api_url=context.api_url,
                worker_secret=context.worker_secret,
                timeout_seconds=3.0,
                http_client=http_client,
            )
            
            response = await client.retrieve_knowledge(
                deployment_id=context.deployment_id,
                query=raw_query,
                top_k=top_k,
            )
            
            if not response.results:
                result = {
                    "status": "success",
                    "knowledge_found": False,
                    "information": [],
                    "results": [],
                    "message": "No relevant information found in the knowledge base for this query.",
                }
            else:
                sanitized_results = []
                info_list = []
                for item in response.results:
                    sanitized_results.append({
                        "content": item.content,
                        "relevanceScore": round(item.score, 2),
                    })
                    info_list.append(item.content)
                
                result = {
                    "status": "success",
                    "knowledge_found": True,
                    "information": info_list,
                    "results": sanitized_results,
                }
                
        except Exception as e:
            # Safe fallback on retrieval API failure or timeout - do not crash voice agent
            error_msg = str(e)
            is_timeout = "time out" in error_msg.lower() or "timeout" in error_msg.lower() or "504" in error_msg
            is_unavailable = "503" in error_msg or "unavailable" in error_msg.lower()
            
            safe_error_message = (
                "Knowledge retrieval request timed out or service is temporarily unavailable."
                if is_timeout or is_unavailable
                else "Knowledge base retrieval is temporarily unavailable."
            )
            
            result = {
                "status": "error",
                "knowledge_found": False,
                "information": [],
                "results": [],
                "error": safe_error_message,
            }

        if params.result_callback:
            await params.result_callback(result)
        return result

    return FunctionSchema(
        name=QUERY_KNOWLEDGE_BASE_TOOL_NAME,
        description=tool_description,
        properties=KNOWLEDGE_TOOL_PROPERTIES,
        required=KNOWLEDGE_TOOL_REQUIRED,
        handler=handle_query_knowledge_base,
    )
