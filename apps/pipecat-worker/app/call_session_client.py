"""Control Plane Call Session Client for NextLite Pipecat Worker.

Provides typed async operations for call session persistence:
- POST /api/internal/call-sessions (create ACTIVE session)
- PATCH /api/internal/call-sessions/:id (update session on completion/failure)

Pipecat NEVER connects to PostgreSQL directly. All persistence is managed
via NextLite Control Plane internal APIs.
"""

from typing import Any, Dict, List, Optional
import httpx
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from app.config import settings


class CallSessionClientError(Exception):
    """Structured exception for CallSessionClient operations."""

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
        return f"CallSessionClientError(message={self.message!r}, status_code={self.status_code}, error_code={self.error_code!r})"


class CreateCallSessionRequest(BaseModel):
    """Payload for creating a new CallSession record."""

    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str = Field(..., alias="tenantId")
    agent_id: str = Field(..., alias="agentId")
    deployment_id: str = Field(..., alias="deploymentId")
    room_name: str = Field(..., alias="roomName")
    caller_number: Optional[str] = Field(default=None, alias="callerNumber")
    direction: Optional[str] = Field(default="INBOUND", alias="direction")
    status: Optional[str] = Field(default="ACTIVE", alias="status")
    duration_seconds: Optional[int] = Field(default=0, alias="durationSeconds")
    primary_language: Optional[str] = Field(default="en-IN", alias="primaryLanguage")
    started_at: Optional[str] = Field(default=None, alias="startedAt")
    ended_at: Optional[str] = Field(default=None, alias="endedAt")
    transcript_text: Optional[str] = Field(default=None, alias="transcriptText")
    turns_json: Optional[Any] = Field(default=None, alias="turnsJson")
    tools_used: Optional[Any] = Field(default=None, alias="toolsUsed")
    metrics_json: Optional[Any] = Field(default=None, alias="metricsJson")


class UpdateCallSessionRequest(BaseModel):
    """Payload for updating an existing CallSession record."""

    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str = Field(..., alias="tenantId")
    status: Optional[str] = Field(default=None, alias="status")
    duration_seconds: Optional[int] = Field(default=None, alias="durationSeconds")
    primary_language: Optional[str] = Field(default=None, alias="primaryLanguage")
    ended_at: Optional[str] = Field(default=None, alias="endedAt")
    transcript_text: Optional[str] = Field(default=None, alias="transcriptText")
    turns_json: Optional[Any] = Field(default=None, alias="turnsJson")
    tools_used: Optional[Any] = Field(default=None, alias="toolsUsed")
    metrics_json: Optional[Any] = Field(default=None, alias="metricsJson")


class CallSessionResponse(BaseModel):
    """Authoritative CallSession object returned by Control Plane API."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str
    tenant_id: str = Field(..., alias="tenantId")
    agent_id: str = Field(..., alias="agentId")
    deployment_id: str = Field(..., alias="deploymentId")
    room_name: str = Field(..., alias="roomName")
    caller_number: Optional[str] = Field(default=None, alias="callerNumber")
    direction: str = "INBOUND"
    status: str = "ACTIVE"
    duration_seconds: int = Field(default=0, alias="durationSeconds")
    primary_language: Optional[str] = Field(default=None, alias="primaryLanguage")
    started_at: str = Field(..., alias="startedAt")
    ended_at: Optional[str] = Field(default=None, alias="endedAt")
    transcript_text: Optional[str] = Field(default=None, alias="transcriptText")
    turns_json: Optional[Any] = Field(default=None, alias="turnsJson")
    tools_used: Optional[Any] = Field(default=None, alias="toolsUsed")
    metrics_json: Optional[Any] = Field(default=None, alias="metricsJson")
    created_at: Optional[str] = Field(default=None, alias="createdAt")


class CallSessionClient:
    """HTTP Client for NextLite Control Plane Call Session Persistence APIs."""

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
            or getattr(settings, "WORKER_API_SECRET", "dev-worker-api-secret")
        )
        self._timeout_seconds = timeout_seconds or 4.0
        self._http_client = http_client

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self._worker_secret}",
            "x-worker-secret": self._worker_secret,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def create_call_session(self, data: CreateCallSessionRequest) -> CallSessionResponse:
        """Create an ACTIVE CallSession record in Control Plane.
        
        Endpoint: POST /api/internal/call-sessions
        """
        url = f"{self._api_url}/api/internal/call-sessions"
        payload = data.model_dump(by_alias=True, exclude_none=True)

        try:
            if self._http_client:
                response = await self._http_client.post(
                    url,
                    headers=self._get_headers(),
                    json=payload,
                )
            else:
                async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                    response = await client.post(
                        url,
                        headers=self._get_headers(),
                        json=payload,
                    )

            if response.status_code == 201 or response.status_code == 200:
                try:
                    resp_json = response.json()
                    return CallSessionResponse.model_validate(resp_json)
                except Exception as e:
                    raise CallSessionClientError(
                        "Invalid JSON response from call-sessions API",
                        status_code=500,
                        error_code="INVALID_JSON",
                        cause=e,
                    )

            # Error responses
            error_body = None
            try:
                error_body = response.json()
            except Exception:
                pass

            api_code = error_body.get("code") if isinstance(error_body, dict) else None
            api_msg = error_body.get("error") or error_body.get("message") if isinstance(error_body, dict) else None

            if response.status_code == 401:
                raise CallSessionClientError(
                    "Worker authentication failed for call-sessions creation",
                    status_code=401,
                    error_code=api_code or "UNAUTHORIZED",
                )
            if response.status_code == 403:
                raise CallSessionClientError(
                    "Worker forbidden to create call session",
                    status_code=403,
                    error_code=api_code or "FORBIDDEN",
                )
            if response.status_code == 404:
                raise CallSessionClientError(
                    api_msg or "Deployment or Agent not found for call session",
                    status_code=404,
                    error_code=api_code or "NOT_FOUND",
                )
            if response.status_code == 409:
                raise CallSessionClientError(
                    api_msg or "Conflict creating call session",
                    status_code=409,
                    error_code=api_code or "CONFLICT",
                )
            if response.status_code == 400:
                raise CallSessionClientError(
                    api_msg or "Invalid call session create payload",
                    status_code=400,
                    error_code=api_code or "INVALID_REQUEST",
                )

            raise CallSessionClientError(
                api_msg or f"Failed to create call session (status {response.status_code})",
                status_code=response.status_code,
                error_code=api_code or "SERVER_ERROR",
            )

        except CallSessionClientError:
            raise
        except httpx.TimeoutException as e:
            raise CallSessionClientError(
                "Request to create call session timed out",
                status_code=504,
                error_code="SERVICE_UNAVAILABLE",
                cause=e,
            )
        except httpx.RequestError as e:
            raise CallSessionClientError(
                "Failed to connect to call sessions API",
                status_code=503,
                error_code="SERVICE_UNAVAILABLE",
                cause=e,
            )

    async def update_call_session(
        self,
        session_id: str,
        data: UpdateCallSessionRequest,
    ) -> CallSessionResponse:
        """Update an existing CallSession record in Control Plane.
        
        Endpoint: PATCH /api/internal/call-sessions/:id
        """
        if not session_id or not isinstance(session_id, str) or not session_id.strip():
            raise CallSessionClientError(
                "Session ID is required to update call session",
                status_code=400,
                error_code="INVALID_INPUT",
            )

        clean_session_id = session_id.strip()
        url = f"{self._api_url}/api/internal/call-sessions/{clean_session_id}"
        payload = data.model_dump(by_alias=True, exclude_none=True)

        try:
            if self._http_client:
                response = await self._http_client.patch(
                    url,
                    headers=self._get_headers(),
                    json=payload,
                )
            else:
                async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                    response = await client.patch(
                        url,
                        headers=self._get_headers(),
                        json=payload,
                    )

            if response.status_code == 200:
                try:
                    resp_json = response.json()
                    return CallSessionResponse.model_validate(resp_json)
                except Exception as e:
                    raise CallSessionClientError(
                        "Invalid JSON response from call-sessions update API",
                        status_code=500,
                        error_code="INVALID_JSON",
                        cause=e,
                    )

            # Error responses
            error_body = None
            try:
                error_body = response.json()
            except Exception:
                pass

            api_code = error_body.get("code") if isinstance(error_body, dict) else None
            api_msg = error_body.get("error") or error_body.get("message") if isinstance(error_body, dict) else None

            if response.status_code == 401:
                raise CallSessionClientError(
                    "Worker authentication failed for call-sessions update",
                    status_code=401,
                    error_code=api_code or "UNAUTHORIZED",
                )
            if response.status_code == 403:
                raise CallSessionClientError(
                    "Worker forbidden to update call session",
                    status_code=403,
                    error_code=api_code or "FORBIDDEN",
                )
            if response.status_code == 404:
                raise CallSessionClientError(
                    api_msg or f"Call session {clean_session_id} not found",
                    status_code=404,
                    error_code=api_code or "NOT_FOUND",
                )
            if response.status_code == 409:
                raise CallSessionClientError(
                    api_msg or "Conflict updating call session",
                    status_code=409,
                    error_code=api_code or "CONFLICT",
                )
            if response.status_code == 400:
                raise CallSessionClientError(
                    api_msg or "Invalid call session update payload",
                    status_code=400,
                    error_code=api_code or "INVALID_REQUEST",
                )

            raise CallSessionClientError(
                api_msg or f"Failed to update call session (status {response.status_code})",
                status_code=response.status_code,
                error_code=api_code or "SERVER_ERROR",
            )

        except CallSessionClientError:
            raise
        except httpx.TimeoutException as e:
            raise CallSessionClientError(
                "Request to update call session timed out",
                status_code=504,
                error_code="SERVICE_UNAVAILABLE",
                cause=e,
            )
        except httpx.RequestError as e:
            raise CallSessionClientError(
                "Failed to connect to call sessions API",
                status_code=503,
                error_code="SERVICE_UNAVAILABLE",
                cause=e,
            )
