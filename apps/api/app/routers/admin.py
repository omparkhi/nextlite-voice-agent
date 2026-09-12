import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_, desc
from ..db import get_db
from ..auth import require_admin
from ..models import (
    Tenant, User, Subscription, VerificationToken, Agent, AgentTemplate,
    AgentVersion, Deployment, ConfigChangeProposal,
    UserRole, SubscriptionStatus, ProposalStatus
)
from ..auth.password import hash_password
from ..auth.tokens import generate_refresh_token
from ..services.agent_service import AgentService
from ..services.telephony_service import TelephonyService

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Clients (Tenants)
@router.post("/clients", status_code=status.HTTP_201_CREATED)
async def create_client(
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    name = body["name"]
    email = body["email"]
    business_name = body["businessName"]

    # Check user existence
    user_res = await session.execute(select(User).where(User.email == email))
    if user_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User with this email already exists")

    base_slug = "".join(c if c.isalnum() else "-" for c in business_name.lower()).strip("-") or "tenant"
    slug = base_slug
    counter = 1
    while (await session.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none():
        slug = f"{base_slug}-{counter}"
        counter += 1

    now = datetime.utcnow()
    tenant = Tenant(
        id=uuid.uuid4(),
        name=business_name,
        slug=slug,
        status="active",
        createdAt=now,
        updatedAt=now
    )
    session.add(tenant)
    await session.flush()

    placeholder_hash = hash_password("placeholder-password-change-me")
    user = User(
        id=uuid.uuid4(),
        tenantId=tenant.id,
        email=email,
        passwordHash=placeholder_hash,
        role=UserRole.CLIENT_OWNER,
        emailVerified=False,
        createdAt=now,
        updatedAt=now
    )
    session.add(user)

    sub = Subscription(
        id=uuid.uuid4(),
        tenantId=tenant.id,
        planName="starter",
        status=SubscriptionStatus.PENDING,
        startedAt=now,
        currentPeriodEnd=now + timedelta(days=30),
        createdAt=now,
        updatedAt=now
    )
    session.add(sub)



    ver_token = VerificationToken(
        id=uuid.uuid4(),
        userId=user.id,
        token=generate_refresh_token(),
        type="email_verification",
        expiresAt=now + timedelta(days=1),
        createdAt=now
    )


    session.add(ver_token)

    await session.commit()

    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "slug": tenant.slug,
        "status": tenant.status,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        }
    }

@router.get("/clients")
async def list_clients(
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    res = await session.execute(select(Tenant).order_by(Tenant.createdAt.desc()))
    tenants = res.scalars().all()
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "slug": t.slug,
            "status": t.status,
            "createdAt": t.createdAt.isoformat() if t.createdAt else None,
        }
        for t in tenants
    ]

@router.get("/clients/{client_id}")
async def get_client(
    client_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    res = await session.execute(select(Tenant).where(Tenant.id == uuid.UUID(client_id)))
    t = res.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return {
        "id": str(t.id),
        "name": t.name,
        "slug": t.slug,
        "status": t.status,
        "createdAt": t.createdAt.isoformat() if t.createdAt else None,
    }

@router.put("/clients/{client_id}")
async def update_client(
    client_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    res = await session.execute(select(Tenant).where(Tenant.id == uuid.UUID(client_id)))
    t = res.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    if "businessName" in body and body["businessName"]:
        t.name = body["businessName"]
    if "status" in body and body["status"]:
        t.status = body["status"]
    t.updatedAt = datetime.utcnow()

    await session.commit()
    return {"message": "Client updated successfully"}

# Tools Catalog
@router.get("/tools")
async def list_tools(
    payload: Dict[str, Any] = Depends(require_admin)
):
    return [
        {
            "id": "query_knowledge_base",
            "name": "Query Knowledge Base",
            "description": "Searches the uploaded knowledge base documents using pgvector semantic search.",
            "category": "KNOWLEDGE",
            "enabled": True,
        },
        {
            "id": "book_appointment",
            "name": "Book Appointment",
            "description": "Books an appointment atomically and generates a secure customer-facing APT-XXXX number.",
            "category": "SCHEDULING",
            "enabled": True,
        },
        {
            "id": "create_callback_lead",
            "name": "Create Callback Lead",
            "description": "Records an inbound lead for a follow-up callback with requirement details.",
            "category": "CRM",
            "enabled": True,
        }
    ]

# Templates Catalog
@router.get("/templates")
async def list_templates(
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    res = await session.execute(select(AgentTemplate).order_by(AgentTemplate.createdAt.desc()))
    templates = res.scalars().all()
    return [
        {
            "id": str(tmpl.id),
            "name": tmpl.name,
            "industry": tmpl.industry,
            "description": tmpl.description,
            "systemPromptTemplate": tmpl.systemPromptTemplate,
            "defaultConfig": tmpl.defaultConfig,
            "createdAt": tmpl.createdAt.isoformat() if tmpl.createdAt else None,
        }
        for tmpl in templates
    ]

@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    res = await session.execute(select(AgentTemplate).where(AgentTemplate.id == uuid.UUID(template_id)))
    tmpl = res.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return {
        "id": str(tmpl.id),
        "name": tmpl.name,
        "industry": tmpl.industry,
        "description": tmpl.description,
        "systemPromptTemplate": tmpl.systemPromptTemplate,
        "defaultConfig": tmpl.defaultConfig,
        "createdAt": tmpl.createdAt.isoformat() if tmpl.createdAt else None,
    }

# Client-Scoped Agent Routes
@router.get("/clients/{client_id}/agents")
async def list_client_agents(
    client_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = AgentService(session)
    return await service.list_agents(uuid.UUID(client_id))

@router.post("/clients/{client_id}/agents", status_code=status.HTTP_201_CREATED)
async def create_client_agent(
    client_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = AgentService(session)
    agent = await service.create_agent(
        tenant_id=uuid.UUID(client_id),
        name=body["name"],
        description=body.get("description"),
        template_id=uuid.UUID(body["templateId"]) if body.get("templateId") else None,
        created_by=uuid.UUID(payload["userId"])
    )
    return agent

@router.get("/clients/{client_id}/agents/{agent_id}")
async def get_client_agent(
    client_id: str,
    agent_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = AgentService(session)
    agent = await service.get_agent(uuid.UUID(agent_id), uuid.UUID(client_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent

@router.post("/clients/{client_id}/agents/{agent_id}/phone-test")
async def trigger_phone_test(
    client_id: str,
    agent_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    phone_number = body["phoneNumber"]
    norm_phone = TelephonyService.sanitize_e164(phone_number)
    return {
        "success": True,
        "message": f"Test call initiated to {norm_phone}",
        "callId": f"mock-plivo-{uuid.uuid4().hex[:8]}"
    }

# Config Assistant Proposals
@router.post("/clients/{client_id}/agents/{agent_id}/config-assistant/propose", status_code=status.HTTP_201_CREATED)
async def propose_config_change(
    client_id: str,
    agent_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    user_message = body["message"]
    now = datetime.utcnow()
    proposal = ConfigChangeProposal(
        id=uuid.uuid4(),
        agentId=uuid.UUID(agent_id),
        tenantId=uuid.UUID(client_id),
        proposedBy=uuid.UUID(payload["userId"]),
        userMessage=user_message,
        currentConfig={},
        proposedConfig={"notes": f"Applied changes for: {user_message}"},
        diff={"applied": {"old": None, "new": user_message}},
        status=ProposalStatus.PENDING,
        createdAt=now
    )
    session.add(proposal)
    await session.commit()
    return {
        "id": str(proposal.id),
        "agentId": str(proposal.agentId),
        "userMessage": proposal.userMessage,
        "proposedConfig": proposal.proposedConfig,
        "diff": proposal.diff,
        "status": proposal.status.value if hasattr(proposal.status, "value") else str(proposal.status),
        "createdAt": proposal.createdAt.isoformat()
    }

@router.get("/clients/{client_id}/agents/{agent_id}/config-assistant/proposals")
async def list_config_proposals(
    client_id: str,
    agent_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    res = await session.execute(
        select(ConfigChangeProposal).where(
            and_(
                ConfigChangeProposal.agentId == uuid.UUID(agent_id),
                ConfigChangeProposal.tenantId == uuid.UUID(client_id)
            )
        ).order_by(ConfigChangeProposal.createdAt.desc())
    )
    proposals = res.scalars().all()
    return [
        {
            "id": str(p.id),
            "agentId": str(p.agentId),
            "userMessage": p.userMessage,
            "proposedConfig": p.proposedConfig,
            "diff": p.diff,
            "status": p.status.value if hasattr(p.status, "value") else str(p.status),
            "createdAt": p.createdAt.isoformat() if p.createdAt else None
        }
        for p in proposals
    ]

@router.post("/clients/{client_id}/agents/{agent_id}/config-assistant/proposals/{proposal_id}/approve")
async def approve_config_proposal(
    client_id: str,
    agent_id: str,
    proposal_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    res = await session.execute(
        select(ConfigChangeProposal).where(
            and_(
                ConfigChangeProposal.id == uuid.UUID(proposal_id),
                ConfigChangeProposal.tenantId == uuid.UUID(client_id)
            )
        )
    )
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")
    if p.status != ProposalStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Proposal already reviewed")

    p.status = ProposalStatus.APPROVED
    p.reviewedBy = uuid.UUID(payload["userId"])
    p.reviewedAt = datetime.utcnow()

    # Create new agent version
    service = AgentService(session)
    ver = await service.create_version(
        agent_id=uuid.UUID(agent_id),
        tenant_id=uuid.UUID(client_id),
        system_prompt="Updated from config assistant proposal",
        config=p.proposedConfig,
        change_summary=p.userMessage
    )
    await session.commit()
    return {"versionId": str(ver["id"]), "versionNumber": ver["versionNumber"]}

# Test Conversation
@router.post("/clients/{client_id}/agents/{agent_id}/test")
async def test_conversation(
    client_id: str,
    agent_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    message = body["message"]
    return {
        "reply": f"Antigravity assistant received: {message}",
        "knowledgeUsed": []
    }
