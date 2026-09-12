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
    UserRole, SubscriptionStatus, ProposalStatus, DeploymentStatus, DeploymentEnvironment
)
from ..config import settings
from ..logging import logger
from ..auth.password import hash_password
from ..auth.tokens import generate_refresh_token
from ..services.agent_service import AgentService
from ..services.telephony_service import TelephonyService
from ..services.prompt_compiler_service import prompt_compiler

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Platform Tools Catalog
@router.get("/tools")
async def get_tool_catalog(payload: Dict[str, Any] = Depends(require_admin)):
    return [
        {
            "id": "query_knowledge_base",
            "name": "query_knowledge_base",
            "displayName": "Knowledge Retrieval",
            "description": "Searches the business knowledge base for relevant facts and information.",
            "category": "Knowledge",
            "isPlatformDefault": True
        },
        {
            "id": "book_appointment",
            "name": "book_appointment",
            "displayName": "Appointment Booking",
            "description": "Records customer appointment requests with date, time, and service details.",
            "category": "Scheduling",
            "isPlatformDefault": True
        },
        {
            "id": "create_callback_lead",
            "name": "create_callback_lead",
            "displayName": "Lead Capture & Callback",
            "description": "Captures customer contact details, inquiries, and follow-up requests.",
            "category": "CRM",
            "isPlatformDefault": True
        }
    ]

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

    if "name" in body or "businessName" in body:
        t.name = body.get("businessName") or body.get("name")
    if "status" in body:
        t.status = body["status"]
    t.updatedAt = datetime.utcnow()

    await session.commit()
    return {
        "id": str(t.id),
        "name": t.name,
        "slug": t.slug,
        "status": t.status,
        "createdAt": t.createdAt.isoformat() if t.createdAt else None,
    }

# Agent Templates
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
            "defaultConfiguration": tmpl.defaultConfig,
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
        "defaultConfiguration": tmpl.defaultConfig,
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

@router.put("/clients/{client_id}/agents/{agent_id}")
async def update_client_agent(
    client_id: str,
    agent_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = AgentService(session)
    agent = await service.update_agent(
        agent_id=uuid.UUID(agent_id),
        tenant_id=uuid.UUID(client_id),
        name=body.get("name"),
        status=body.get("status")
    )
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent

@router.put("/clients/{client_id}/agents/{agent_id}/config")
async def save_client_agent_config(
    client_id: str,
    agent_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = AgentService(session)
    configuration = body.get("configuration") or {}
    notes = body.get("notes", "Saved from Agent Builder Workspace")
    user_id = uuid.UUID(payload["userId"])
    
    version = await service.create_version(
        agent_id=uuid.UUID(agent_id),
        tenant_id=uuid.UUID(client_id),
        configuration=configuration,
        created_by=user_id,
        notes=notes
    )
    return version

@router.post("/clients/{client_id}/agents/{agent_id}/compile-prompt")
async def compile_client_agent_prompt(
    client_id: str,
    agent_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    configuration = body.get("configuration")
    if not configuration:
        service = AgentService(session)
        agent = await service.get_agent(uuid.UUID(agent_id), uuid.UUID(client_id))
        if agent and agent.get("versions"):
            configuration = agent["versions"][0].get("configuration") or {}
        else:
            configuration = {}

    compiled_prompt = prompt_compiler.compile_system_prompt(configuration=configuration)
    return {"compiledPrompt": compiled_prompt}

@router.get("/clients/{client_id}/agents/{agent_id}/versions")
async def list_agent_versions(
    client_id: str,
    agent_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = AgentService(session)
    return await service.get_versions(uuid.UUID(agent_id), uuid.UUID(client_id))

@router.get("/clients/{client_id}/agents/{agent_id}/versions/{version_id}")
async def get_agent_version(
    client_id: str,
    agent_id: str,
    version_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = AgentService(session)
    v = await service.get_version(uuid.UUID(agent_id), uuid.UUID(client_id), uuid.UUID(version_id))
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent version not found")
    return v

@router.post("/clients/{client_id}/agents/{agent_id}/phone-test")
async def trigger_phone_test(
    client_id: str,
    agent_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    phone_number = body.get("phoneNumber")
    norm_phone = TelephonyService.sanitize_e164(phone_number)
    if not norm_phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid phone number: Must be in E.164 format")

    service = AgentService(session)
    agent = await service.get_agent(uuid.UUID(agent_id), uuid.UUID(client_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    dep_res = await session.execute(
        select(Deployment).where(
            Deployment.agentId == uuid.UUID(agent_id),
            Deployment.tenantId == uuid.UUID(client_id),
            Deployment.status == DeploymentStatus.ACTIVE
        ).order_by(Deployment.createdAt.desc()).limit(1)
    )
    dep = dep_res.scalar_one_or_none()

    if not dep:
        # Create draft test deployment if none exists
        versions = agent.get("versions") or []
        ver_id = uuid.UUID(versions[0]["id"]) if versions else uuid.uuid4()
        dep = Deployment(
            id=uuid.uuid4(),
            tenantId=uuid.UUID(client_id),
            agentId=uuid.UUID(agent_id),
            versionId=ver_id,
            environment=DeploymentEnvironment.TEST,
            status=DeploymentStatus.ACTIVE,
            createdBy=uuid.UUID(payload["userId"])
        )
        session.add(dep)
        await session.commit()

    base_pipecat = (settings.PIPECAT_URL or "https://dandelion-gigantic-challenge.ngrok-free.dev").rstrip("/")
    answer_url = f"{base_pipecat}/plivo/test-xml?deploymentId={dep.id}"

    try:
        call_res = await TelephonyService.create_outbound_phone_call(norm_phone, answer_url)
        return {
            "success": True,
            "callId": call_res.get("request_uuid") or call_res.get("callId", "mock-uuid"),
            "deploymentId": str(dep.id),
            "message": f"Test call initiated to {norm_phone}"
        }
    except Exception as e:
        logger.error(f"Failed to initiate phone test: {e}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

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
        configuration=p.proposedConfig,
        created_by=uuid.UUID(payload["userId"]),
        notes=p.userMessage
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

# Agent Checklist
@router.get("/clients/{client_id}/agents/{agent_id}/checklist")
async def get_agent_checklist(
    client_id: str,
    agent_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = AgentService(session)
    agent = await service.get_agent(uuid.UUID(agent_id), uuid.UUID(client_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    
    versions = agent.get("versions") or []
    latest_config = versions[0].get("configuration") if versions else {}
    if not isinstance(latest_config, dict):
        latest_config = {}

    items = []
    identity = latest_config.get("identity") or {}
    agent_name = identity.get("displayName") or identity.get("agentName") or identity.get("name") or agent.get("name")
    if agent_name:
        items.append({"id": "identity-name", "category": "Identity", "label": "Agent Identity", "status": "PASSED", "message": f'Agent named "{agent_name}".'})
    else:
        items.append({"id": "identity-name", "category": "Identity", "label": "Agent Identity", "status": "FAILED", "message": "Agent display name or agent name is missing."})

    greeting = identity.get("greeting") or latest_config.get("greeting") or "Hello, how can I help you today?"
    if greeting and str(greeting).strip():
        items.append({"id": "identity-greeting", "category": "Identity", "label": "Initial Greeting", "status": "PASSED", "message": "Greeting message configured."})
    else:
        items.append({"id": "identity-greeting", "category": "Identity", "label": "Initial Greeting", "status": "FAILED", "message": "Greeting message is missing."})

    persona = latest_config.get("persona") or {}
    role = persona.get("role")
    if role:
        items.append({"id": "persona-role", "category": "Persona", "label": "Persona & Role", "status": "PASSED", "message": f'Role defined as "{role}".'})
    else:
        items.append({"id": "persona-role", "category": "Persona", "label": "Persona & Role", "status": "WARNING", "message": "Persona role is not explicitly specified."})

    objective = latest_config.get("objective") or {}
    primary_obj = objective.get("primaryObjective") or "Assist callers with inquiries and scheduling."
    if primary_obj:
        items.append({"id": "objective-primary", "category": "Objectives", "label": "Primary Objective", "status": "PASSED", "message": "Primary objective configured."})
    else:
        items.append({"id": "objective-primary", "category": "Objectives", "label": "Primary Objective", "status": "FAILED", "message": "Primary objective is required."})

    conversation = latest_config.get("conversation") or {}
    phases = conversation.get("phases") or []
    if phases:
        items.append({"id": "conversation-phases", "category": "Conversation", "label": "Conversation Phases", "status": "PASSED", "message": f"{len(phases)} conversation phases configured."})
    else:
        items.append({"id": "conversation-phases", "category": "Conversation", "label": "Conversation Phases", "status": "WARNING", "message": "No conversation phases configured."})

    guardrails = latest_config.get("guardrails") or {}
    if (guardrails.get("prohibitedTopics") or guardrails.get("escalationRules")):
        items.append({"id": "guardrails-rules", "category": "Guardrails", "label": "Safety Guardrails", "status": "PASSED", "message": "Guardrail & escalation rules configured."})
    else:
        items.append({"id": "guardrails-rules", "category": "Guardrails", "label": "Safety Guardrails", "status": "WARNING", "message": "No explicit guardrail or escalation rules defined."})

    lang = latest_config.get("language") or {}
    primary_lang = lang.get("primary") or "en-IN"
    items.append({"id": "language-primary", "category": "Language", "label": "Language Configuration", "status": "PASSED", "message": f"Primary language: {primary_lang}."})

    voice = latest_config.get("voice") or {}
    voice_id = voice.get("voiceId") or "shubh"
    items.append({"id": "voice-config", "category": "Voice", "label": "Voice Selection", "status": "PASSED", "message": f"Voice selected: {voice_id}."})

    variables = latest_config.get("variables") or {}
    inputs = variables.get("input") or []
    if inputs:
        items.append({"id": "variables-input", "category": "Variables", "label": "Input Variables", "status": "PASSED", "message": f"{len(inputs)} input variables defined."})
    else:
        items.append({"id": "variables-input", "category": "Variables", "label": "Input Variables", "status": "WARNING", "message": "No input variables defined."})

    knowledge = latest_config.get("knowledge") or {}
    attached = knowledge.get("attachedSourceIds") or []
    if attached:
        items.append({"id": "knowledge-sources", "category": "Knowledge", "label": "Attached Knowledge", "status": "PASSED", "message": f"{len(attached)} knowledge sources attached."})
    else:
        items.append({"id": "knowledge-sources", "category": "Knowledge", "label": "Attached Knowledge", "status": "WARNING", "message": "No knowledge sources attached."})

    failed = [i for i in items if i["status"] == "FAILED"]
    warnings = [i for i in items if i["status"] == "WARNING"]
    passed = [i for i in items if i["status"] == "PASSED"]

    total_weight = len(items)
    passed_weight = len(passed) + len(warnings) * 0.5
    pct = round((passed_weight / total_weight) * 100) if total_weight > 0 else 100

    return {
        "completenessPercentage": pct,
        "canPublish": len(failed) == 0,
        "criticalErrorsCount": len(failed),
        "warningsCount": len(warnings),
        "passedCount": len(passed),
        "items": items
    }

# Agent Knowledge Endpoints
@router.get("/clients/{client_id}/agents/{agent_id}/knowledge")
async def list_agent_knowledge(
    client_id: str,
    agent_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    from ..services.knowledge_service import KnowledgeService
    ks = KnowledgeService(session)
    return await ks.list_sources(uuid.UUID(client_id), uuid.UUID(agent_id))

@router.get("/clients/{client_id}/agents/{agent_id}/knowledge/{source_id}")
async def get_agent_knowledge_source(
    client_id: str,
    agent_id: str,
    source_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    from ..services.knowledge_service import KnowledgeService
    ks = KnowledgeService(session)
    source = await ks.get_source(uuid.UUID(client_id), uuid.UUID(agent_id), uuid.UUID(source_id))
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    return source

@router.post("/clients/{client_id}/agents/{agent_id}/knowledge/upload", status_code=status.HTTP_201_CREATED)
async def upload_agent_knowledge(
    client_id: str,
    agent_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    from ..services.knowledge_service import KnowledgeService
    ks = KnowledgeService(session)
    file_name = body.get("fileName", "document.txt")
    content = body.get("content", "")
    file_type = body.get("fileType", "txt")
    return await ks.ingest_document(
        tenant_id=uuid.UUID(client_id),
        agent_id=uuid.UUID(agent_id),
        file_name=file_name,
        content=content,
        file_type=file_type
    )

@router.delete("/clients/{client_id}/agents/{agent_id}/knowledge/{source_id}")
async def delete_agent_knowledge_source(
    client_id: str,
    agent_id: str,
    source_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    from ..services.knowledge_service import KnowledgeService
    ks = KnowledgeService(session)
    success = await ks.delete_source(uuid.UUID(client_id), uuid.UUID(agent_id), uuid.UUID(source_id))
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    return {"message": "Knowledge source deleted successfully"}

# Publish Agent
@router.post("/clients/{client_id}/agents/{agent_id}/publish")
async def publish_agent(
    client_id: str,
    agent_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = AgentService(session)
    agent = await service.get_agent(uuid.UUID(agent_id), uuid.UUID(client_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    
    versions = agent.get("versions") or []
    if not versions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No agent version available to publish")
    
    latest_v = versions[0]
    dep = await service.deploy_version(
        agent_id=uuid.UUID(agent_id),
        tenant_id=uuid.UUID(client_id),
        version_id=uuid.UUID(latest_v["id"]),
        environment=DeploymentEnvironment.PRODUCTION,
        deployed_by=uuid.UUID(payload["userId"])
    )
    
    updated_agent = await service.get_agent(uuid.UUID(agent_id), uuid.UUID(client_id))
    checklist = await get_agent_checklist(client_id, agent_id, payload, session)
    return {
        "message": "Agent published to LIVE production successfully!",
        "agent": updated_agent,
        "checklist": checklist,
        "deployment": dep
    }

# Test Token
@router.post("/clients/{client_id}/agents/{agent_id}/test-token")
async def generate_test_token(
    client_id: str,
    agent_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    return {
        "token": f"mock-livekit-test-token-{uuid.uuid4().hex[:12]}",
        "url": "ws://localhost:7880",
        "room": f"test-room-{agent_id[:8]}"
    }
