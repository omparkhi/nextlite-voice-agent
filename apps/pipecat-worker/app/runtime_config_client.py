"""NextLite Voice V3 — Pipecat Runtime Configuration Client.

Async HTTP client for requesting authoritative RuntimeAgentConfig from the
NextLite Control Plane API (GET /api/internal/runtime-config/:deploymentId).

This client enforces the strict architectural boundary between the Control Plane
(which owns DB, versioning, prompt compilation, and multi-tenant isolation)
and the Pipecat Voice Worker (which is purely an audio and turn execution engine).
"""

from typing import Any, Dict, List, Literal, Optional
from urllib.parse import quote

import httpx
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.config import settings


# ==============================================================================
# 1. Pydantic Models for RuntimeAgentConfig Contract
# Mirrors packages/shared/src/runtimeConfig.ts
# ==============================================================================

class BaseContractModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class RuntimeTenantConfig(BaseContractModel):
    tenant_id: str = Field(..., alias="tenantId")


class RuntimeAgentMetadata(BaseContractModel):
    agent_id: str = Field(..., alias="agentId")
    agent_name: str = Field(..., alias="agentName")
    status: str = Field(default="active")


class RuntimeDeploymentMetadata(BaseContractModel):
    deployment_id: str = Field(..., alias="deploymentId")
    version_id: str = Field(..., alias="versionId")
    version_number: Optional[int] = Field(default=None, alias="versionNumber")


class RuntimePromptConfig(BaseContractModel):
    compiled_system_prompt: str = Field(..., alias="compiledSystemPrompt")
    greeting: Optional[str] = None
    timezone: Optional[str] = None


class RuntimeVoiceConfig(BaseContractModel):
    provider: str = Field(default="sarvam")
    stt_model: Optional[str] = Field(default=None, alias="sttModel")
    tts_model: Optional[str] = Field(default=None, alias="ttsModel")
    voice_id: str = Field(..., alias="voiceId")
    gender: Optional[Literal["male", "female", "neutral"]] = None
    speaking_speed: Optional[float] = Field(default=None, alias="speakingSpeed")
    pitch: Optional[float] = None


class RuntimeLanguageConfig(BaseContractModel):
    primary: str = Field(default="en-IN")
    supported_languages: List[str] = Field(default_factory=lambda: ["en-IN"], alias="supportedLanguages")
    auto_detect_enabled: Optional[bool] = Field(default=None, alias="autoDetectEnabled")
    language_switching_enabled: Optional[bool] = Field(default=None, alias="languageSwitchingEnabled")


class RuntimeBehaviorConfig(BaseContractModel):
    model_provider: Optional[str] = Field(default=None, alias="modelProvider")
    llm_model: Optional[str] = Field(default=None, alias="llmModel")
    tool_llm_model: Optional[str] = Field(default=None, alias="toolLlmModel")
    tool_max_tokens: Optional[int] = Field(default=128, alias="toolMaxTokens")
    post_tool_max_tokens: Optional[int] = Field(default=80, alias="postToolMaxTokens")
    tool_reasoning_mode: Optional[str] = Field(default=None, alias="toolReasoningMode")
    enable_early_tool_ack: bool = Field(default=True, alias="enableEarlyToolAck")
    temperature: Optional[float] = None
    interruption_mode: Optional[str] = Field(default=None, alias="interruptionMode")
    preemptive_generation_enabled: Optional[bool] = Field(default=None, alias="preemptiveGenerationEnabled")
    response_eagerness: Optional[str] = Field(default=None, alias="responseEagerness")
    noise_cancellation_model: Optional[str] = Field(default=None, alias="noiseCancellationModel")
    expressive_mode_enabled: Optional[bool] = Field(default=None, alias="expressiveModeEnabled")
    max_call_duration_seconds: Optional[int] = Field(default=None, alias="maxCallDurationSeconds")



class RuntimeKnowledgeRetrievalConfig(BaseContractModel):
    top_k: int = Field(default=5, alias="topK")
    score_threshold: Optional[float] = Field(default=None, alias="scoreThreshold")


class RuntimeKnowledgeConfig(BaseContractModel):
    enabled: bool = Field(default=False)
    retrieval_config: Optional[RuntimeKnowledgeRetrievalConfig] = Field(default=None, alias="retrievalConfig")


class RuntimeToolDefinition(BaseContractModel):
    tool_id: Optional[str] = Field(default=None, alias="toolId")
    name: str
    description: str
    parameters: Optional[Dict[str, Any]] = None
    enabled: bool = Field(default=True)
    confirmation_required: Optional[bool] = Field(default=None, alias="confirmationRequired")


class RuntimeToolConfig(BaseContractModel):
    enabled: bool = Field(default=False)
    tools: List[RuntimeToolDefinition] = Field(default_factory=list)


class RuntimeVariableDefinition(BaseContractModel):
    key: str
    label: Optional[str] = None
    type: str = Field(default="string")
    required: bool = Field(default=False)
    default_value: Optional[Any] = Field(default=None, alias="defaultValue")
    scope: Optional[str] = None


class RuntimeVariableConfig(BaseContractModel):
    input_variables: List[RuntimeVariableDefinition] = Field(default_factory=list, alias="inputVariables")
    output_variables: List[RuntimeVariableDefinition] = Field(default_factory=list, alias="outputVariables")
    runtime_context: Optional[Dict[str, str]] = Field(default=None, alias="runtimeContext")


class RuntimeAgentConfig(BaseContractModel):
    tenant: RuntimeTenantConfig
    agent: RuntimeAgentMetadata
    deployment: RuntimeDeploymentMetadata
    prompt: RuntimePromptConfig
    voice: RuntimeVoiceConfig
    language: RuntimeLanguageConfig
    runtime: RuntimeBehaviorConfig
    knowledge: RuntimeKnowledgeConfig
    tools: RuntimeToolConfig
    variables: RuntimeVariableConfig


class KnowledgeRetrieveResultItem(BaseContractModel):
    content: str
    score: float
    source_id: Optional[str] = Field(default=None, alias="sourceId")


class KnowledgeRetrieveResponse(BaseContractModel):
    results: List[KnowledgeRetrieveResultItem] = Field(default_factory=list)


# ==============================================================================
# 2. Custom Exception Class
# ==============================================================================

class RuntimeConfigClientError(Exception):
    """Exception raised when runtime configuration resolution fails."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        error_code: Optional[str] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.cause = cause

    def __repr__(self) -> str:
        return f"RuntimeConfigClientError(message={self.message!r}, status_code={self.status_code}, error_code={self.error_code!r})"


# ==============================================================================
# 3. Deployment ID Extraction Helper
# ==============================================================================

def extract_deployment_id(
    query_params: Optional[Dict[str, Any]] = None,
    start_payload: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Safely extracts deploymentId from connection query parameters or Plivo start payload.
    
    Checks in order of priority:
    1. query_params['deploymentId'] or query_params['deployment_id']
    2. start_payload['deploymentId'] or start_payload['deployment_id']
    3. start_payload['customHeaders']['X-PH-deploymentId'] or start_payload['customHeaders']['deploymentId']
    4. start_payload['extraHeaders']['deploymentId']
    5. start_payload['params']['deploymentId']
    
    Returns the stripped deployment ID string if non-empty, otherwise None.
    """
    if query_params:
        dep_id = query_params.get("deploymentId") or query_params.get("deployment_id")
        if isinstance(dep_id, str) and dep_id.strip():
            return dep_id.strip()

    if start_payload:
        # Direct key in start payload
        dep_id = start_payload.get("deploymentId") or start_payload.get("deployment_id")
        if isinstance(dep_id, str) and dep_id.strip():
            return dep_id.strip()

        # Custom headers dict
        custom_headers = start_payload.get("customHeaders")
        if isinstance(custom_headers, dict):
            dep_id = (
                custom_headers.get("X-PH-deploymentId")
                or custom_headers.get("deploymentId")
                or custom_headers.get("deployment_id")
            )
            if isinstance(dep_id, str) and dep_id.strip():
                return dep_id.strip()

        # Extra headers dict
        extra_headers = start_payload.get("extraHeaders")
        if isinstance(extra_headers, dict):
            dep_id = extra_headers.get("deploymentId") or extra_headers.get("deployment_id")
            if isinstance(dep_id, str) and dep_id.strip():
                return dep_id.strip()

        # Params dict
        params = start_payload.get("params")
        if isinstance(params, dict):
            dep_id = params.get("deploymentId") or params.get("deployment_id")
            if isinstance(dep_id, str) and dep_id.strip():
                return dep_id.strip()

    return None


# ==============================================================================
# 4. RuntimeConfigClient Implementation
# ==============================================================================

class RuntimeConfigClient:
    """Async client communicating with NextLite Control Plane to resolve RuntimeAgentConfig."""

    def __init__(
        self,
        api_url: Optional[str] = None,
        worker_secret: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ):
        self._api_url = (
            api_url
            or getattr(settings, "NEXTLITE_API_URL", "http://localhost:3001")
        ).rstrip("/")
        self._worker_secret = (
            worker_secret
            or getattr(settings, "WORKER_API_SECRET", "dev-livekit-worker-secret-v3")
        )
        self._timeout_seconds = (
            timeout_seconds
            or getattr(settings, "RUNTIME_CONFIG_TIMEOUT_SECONDS", 8.0)
        )
        self._http_client = http_client

    async def get_runtime_agent_config(self, deployment_id: str) -> RuntimeAgentConfig:
        """Fetches and validates the authoritative RuntimeAgentConfig for a deployment.
        
        Args:
            deployment_id: The unique deployment ID string (UUID).
            
        Returns:
            RuntimeAgentConfig parsed and validated Pydantic model.
            
        Raises:
            RuntimeConfigClientError: If the deployment is missing, inactive, unauthorized, or malformed.
        """
        if not deployment_id or not isinstance(deployment_id, str) or not deployment_id.strip():
            raise RuntimeConfigClientError(
                "Deployment ID is required and must be a non-empty string",
                status_code=400,
                error_code="INVALID_INPUT",
            )

        clean_deployment_id = deployment_id.strip()
        encoded_deployment_id = quote(clean_deployment_id, safe="")
        url = f"{self._api_url}/api/internal/runtime-config/{encoded_deployment_id}"

        headers = {
            "Authorization": f"Bearer {self._worker_secret}",
            "x-worker-secret": self._worker_secret,
            "Accept": "application/json",
        }

        logger.debug(f"Requesting RuntimeAgentConfig for deploymentId={clean_deployment_id}")

        try:
            if self._http_client:
                response = await self._http_client.get(
                    url,
                    headers=headers,
                    timeout=self._timeout_seconds,
                )
            else:
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        url,
                        headers=headers,
                        timeout=self._timeout_seconds,
                    )
        except httpx.TimeoutException as te:
            logger.warning(f"Request to NextLite runtime config API timed out for deploymentId={clean_deployment_id}")
            raise RuntimeConfigClientError(
                "Request to NextLite runtime config API timed out",
                status_code=504,
                error_code="SERVICE_UNAVAILABLE",
                cause=te,
            ) from te
        except (httpx.ConnectError, httpx.RequestError) as re:
            logger.error(f"Failed to connect to NextLite runtime config API: {re}")
            raise RuntimeConfigClientError(
                "Failed to connect to NextLite runtime config API",
                status_code=503,
                error_code="SERVICE_UNAVAILABLE",
                cause=re,
            ) from re

        # Handle HTTP Status Codes
        if response.status_code != 200:
            error_body = None
            try:
                error_body = response.json()
            except Exception:
                pass

            api_code = error_body.get("code") if isinstance(error_body, dict) else None
            api_message = error_body.get("error") if isinstance(error_body, dict) else None

            if response.status_code == 401:
                logger.warning("Worker authentication failed against NextLite API (401)")
                raise RuntimeConfigClientError(
                    "Worker authentication failed",
                    status_code=401,
                    error_code=api_code or "UNAUTHORIZED",
                )

            if response.status_code == 403:
                logger.warning("Worker authorization forbidden against NextLite API (403)")
                raise RuntimeConfigClientError(
                    "Worker access forbidden",
                    status_code=403,
                    error_code=api_code or "FORBIDDEN",
                )

            if response.status_code == 404:
                logger.warning(f"Deployment not found: {clean_deployment_id} (404)")
                raise RuntimeConfigClientError(
                    api_message or "Deployment not found",
                    status_code=404,
                    error_code=api_code or "RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND",
                )

            if response.status_code == 409:
                logger.warning(f"Deployment inactive or agent invalid: {clean_deployment_id} (409)")
                raise RuntimeConfigClientError(
                    api_message or "Deployment is inactive or unavailable",
                    status_code=409,
                    error_code=api_code or "RUNTIME_CONFIG_DEPLOYMENT_INACTIVE",
                )

            if response.status_code == 400:
                logger.error(f"Invalid runtime configuration request: {clean_deployment_id} (400)")
                raise RuntimeConfigClientError(
                    api_message or "Invalid runtime configuration request",
                    status_code=400,
                    error_code=api_code or "RUNTIME_CONFIG_CONFIG_INVALID",
                )

            logger.error(f"NextLite API returned unexpected status {response.status_code}")
            raise RuntimeConfigClientError(
                api_message or f"NextLite API error (status {response.status_code})",
                status_code=response.status_code,
                error_code=api_code or "SERVER_ERROR",
            )

        # Parse JSON
        try:
            raw_json = response.json()
        except Exception as pe:
            logger.error("Failed to parse JSON response from NextLite runtime config API")
            raise RuntimeConfigClientError(
                "Invalid JSON response from NextLite API",
                status_code=500,
                error_code="INVALID_JSON",
                cause=pe,
            ) from pe

        # Validate against Pydantic RuntimeAgentConfig model
        try:
            config = RuntimeAgentConfig.model_validate(raw_json)
        except ValidationError as ve:
            logger.error(f"Response from NextLite API failed schema validation: {ve}")
            raise RuntimeConfigClientError(
                "Response from NextLite API does not match RuntimeAgentConfig contract",
                status_code=500,
                error_code="SCHEMA_VALIDATION_FAILED",
                cause=ve,
            ) from ve

        logger.info(
            f"Successfully resolved RuntimeAgentConfig | tenantId={config.tenant.tenant_id} | "
            f"agentId={config.agent.agent_id} | deploymentId={config.deployment.deployment_id} | "
            f"versionNumber={config.deployment.version_number}"
        )
        return config

    async def retrieve_knowledge(
        self,
        deployment_id: str,
        query: str,
        top_k: Optional[int] = None,
    ) -> KnowledgeRetrieveResponse:
        """Fetches knowledge retrieval results from the NextLite Control Plane API."""
        if not deployment_id or not isinstance(deployment_id, str) or not deployment_id.strip():
            raise RuntimeConfigClientError(
                "Deployment ID is required and must be a non-empty string",
                status_code=400,
                error_code="INVALID_INPUT",
            )
            
        if not query or not isinstance(query, str) or not query.strip():
            raise RuntimeConfigClientError(
                "Query is required and must be a non-empty string",
                status_code=400,
                error_code="INVALID_INPUT",
            )

        clean_deployment_id = deployment_id.strip()
        clean_query = query.strip()
        url = f"{self._api_url}/api/internal/knowledge/retrieve"

        headers = {
            "Authorization": f"Bearer {self._worker_secret}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        
        request_body: Dict[str, Any] = {
            "deploymentId": clean_deployment_id,
            "query": clean_query,
        }
        if top_k is not None and top_k > 0:
            request_body["topK"] = int(top_k)

        logger.debug(f"Requesting knowledge retrieval for deploymentId={clean_deployment_id} query='{clean_query}'")

        try:
            if self._http_client:
                response = await self._http_client.post(
                    url,
                    headers=headers,
                    json=request_body,
                    timeout=self._timeout_seconds,
                )
            else:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        url,
                        headers=headers,
                        json=request_body,
                        timeout=self._timeout_seconds,
                    )
        except httpx.TimeoutException as te:
            logger.warning(f"Request to knowledge API timed out for deploymentId={clean_deployment_id}")
            raise RuntimeConfigClientError(
                "Request to NextLite knowledge retrieval API timed out",
                status_code=504,
                error_code="SERVICE_UNAVAILABLE",
                cause=te,
            ) from te
        except (httpx.ConnectError, httpx.RequestError) as re:
            logger.error(f"Failed to connect to knowledge API: {re}")
            raise RuntimeConfigClientError(
                "Failed to connect to NextLite knowledge retrieval API",
                status_code=503,
                error_code="SERVICE_UNAVAILABLE",
                cause=re,
            ) from re

        if response.status_code != 200:
            error_body = None
            try:
                error_body = response.json()
            except Exception:
                pass

            api_code = error_body.get("code") if isinstance(error_body, dict) else None
            api_message = error_body.get("error") or error_body.get("message") if isinstance(error_body, dict) else None

            if response.status_code == 401:
                raise RuntimeConfigClientError(
                    "Worker authentication failed",
                    status_code=401,
                    error_code=api_code or "UNAUTHORIZED",
                )
            if response.status_code == 404:
                raise RuntimeConfigClientError(
                    api_message or "Deployment not found for knowledge retrieval",
                    status_code=404,
                    error_code=api_code or "DEPLOYMENT_NOT_FOUND",
                )
            if response.status_code == 409:
                raise RuntimeConfigClientError(
                    api_message or "Deployment is inactive or unavailable",
                    status_code=409,
                    error_code=api_code or "DEPLOYMENT_INACTIVE",
                )
            if response.status_code == 400:
                raise RuntimeConfigClientError(
                    api_message or "Invalid knowledge retrieval request",
                    status_code=400,
                    error_code=api_code or "INVALID_REQUEST",
                )
            raise RuntimeConfigClientError(
                api_message or f"NextLite knowledge API error (status {response.status_code})",
                status_code=response.status_code,
                error_code=api_code or "SERVER_ERROR",
            )

        try:
            raw_json = response.json()
        except Exception as pe:
            raise RuntimeConfigClientError(
                "Invalid JSON response from NextLite knowledge retrieval API",
                status_code=500,
                error_code="INVALID_JSON",
                cause=pe,
            ) from pe

        try:
            result = KnowledgeRetrieveResponse.model_validate(raw_json)
        except ValidationError as ve:
            raise RuntimeConfigClientError(
                "Response from NextLite API does not match knowledge retrieval schema",
                status_code=500,
                error_code="SCHEMA_VALIDATION_FAILED",
                cause=ve,
            ) from ve

        return result
