import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth import get_current_user_payload, require_admin
from ..schemas import (
    CreateAgentRequest, UpdateAgentRequest, CreateVersionRequest,
    DeployAgentRequest
)
from ..services.agent_service import AgentService
from ..models import DeploymentEnvironment

router = APIRouter(prefix="/api/admin/agents", tags=["agents"])

@router.get("")
async def list_agents(
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = uuid.UUID(payload["tenantId"])
    service = AgentService(session)
    return await service.list_agents(tenant_id)

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_agent(
    req: CreateAgentRequest,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = uuid.UUID(payload["tenantId"])
    user_id = uuid.UUID(payload["userId"])
    template_id = uuid.UUID(req.template_id) if req.template_id else None
    service = AgentService(session)

    agent = await service.create_agent(
        tenant_id=tenant_id,
        name=req.name,
        description=req.description,
        template_id=template_id,
        created_by=user_id
    )
    return agent

@router.get("/{agent_id}")
async def get_agent(
    agent_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = uuid.UUID(payload["tenantId"])
    service = AgentService(session)
    agent = await service.get_agent(uuid.UUID(agent_id), tenant_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent

@router.post("/{agent_id}/versions", status_code=status.HTTP_201_CREATED)
async def create_version(
    agent_id: str,
    req: CreateVersionRequest,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = uuid.UUID(payload["tenantId"])
    service = AgentService(session)
    try:
        ver = await service.create_version(
            agent_id=uuid.UUID(agent_id),
            tenant_id=tenant_id,
            system_prompt=req.system_prompt,
            config=req.config,
            change_summary=req.change_summary
        )
        return ver
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post("/{agent_id}/deploy")
async def deploy_version(
    agent_id: str,
    req: DeployAgentRequest,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = uuid.UUID(payload["tenantId"])
    user_id = uuid.UUID(payload["userId"])
    service = AgentService(session)
    env_enum = DeploymentEnvironment(req.environment)
    dep = await service.deploy_version(
        agent_id=uuid.UUID(agent_id),
        tenant_id=tenant_id,
        version_id=uuid.UUID(req.version_id),
        environment=env_enum,
        deployed_by=user_id
    )
    return dep
