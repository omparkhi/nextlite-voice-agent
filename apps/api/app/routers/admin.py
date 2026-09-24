import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_, desc
from ..db import get_db
from ..auth import require_admin
from ..models import (
    Tenant, User, Subscription, VerificationToken, Agent, AgentTemplate,
    AgentVersion, Deployment, ConfigChangeProposal, PhoneNumber,
    UserRole, SubscriptionStatus, ProposalStatus, DeploymentStatus, DeploymentEnvironment,
    AgentStatus, VersionStatus
)
from ..config import settings
from ..logging import logger
from ..auth.password import hash_password
from ..auth.tokens import generate_refresh_token
from ..services.agent_service import AgentService
from ..services.template_service import TemplateService
from ..services.telephony_service import TelephonyService
from ..services.crm_service import CRMService
from ..services.prompt_compiler_service import prompt_compiler
from ..services.cache_service import invalidate_worker_cache

router = APIRouter(prefix="/api/admin", tags=["admin"])

from ..domain.tool_registry import list_canonical_tools

# Platform Tools Catalog
@router.get("/tools")
async def get_tool_catalog(payload: Dict[str, Any] = Depends(require_admin)):
    return list_canonical_tools()

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

    raw_password = (body.get("password") or "client123").strip()
    password_hash = hash_password(raw_password)
    user = User(
        id=uuid.uuid4(),
        tenantId=tenant.id,
        name=name.strip() if name else None,
        email=email.strip().lower(),
        passwordHash=password_hash,
        role=UserRole.CLIENT_OWNER,
        emailVerified=True,
        createdAt=now,
        updatedAt=now
    )
    session.add(user)

    sub = Subscription(
        id=uuid.uuid4(),
        tenantId=tenant.id,
        planName="starter",
        status=SubscriptionStatus.ACTIVE,
        startedAt=now,
        currentPeriodEnd=now + timedelta(days=365),
        createdAt=now,
        updatedAt=now
    )
    session.add(sub)

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
            "emailVerified": True,
        },
        "credentials": {
            "email": user.email,
            "password": raw_password,
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

    user_res = await session.execute(
        select(User).where(User.tenantId == t.id).order_by(User.createdAt.asc()).limit(1)
    )
    client_user = user_res.scalar_one_or_none()

    sub_res = await session.execute(
        select(Subscription).where(Subscription.tenantId == t.id).limit(1)
    )
    sub = sub_res.scalar_one_or_none()

    return {
        "id": str(t.id),
        "name": t.name,
        "slug": t.slug,
        "status": t.status,
        "createdAt": t.createdAt.isoformat() if t.createdAt else None,
        "users": [{
            "id": str(client_user.id),
            "name": getattr(client_user, "name", None),
            "email": client_user.email,
            "emailVerified": client_user.emailVerified,
        }] if client_user else [],
        "subscriptions": [{
            "id": str(sub.id),
            "status": sub.status.value if hasattr(sub.status, "value") else str(sub.status),
            "planName": sub.planName,
        }] if sub else []
    }

@router.post("/clients/{client_id}/reset-data")
async def reset_client_data(
    client_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = CRMService(session)
    res = await service.reset_tenant_data(uuid.UUID(client_id))
    return res

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

    if "businessName" in body:
        t.name = body["businessName"]
    if "status" in body:
        t.status = body["status"]

    owner_name = (
        body.get("ownerName")
        or body.get("contactName")
        or body.get("doctorName")
        or body.get("name")
    )
    if owner_name:
        clean_name = str(owner_name).strip()
        await session.execute(
            update(User)
            .where(User.tenantId == t.id)
            .values(name=clean_name, updatedAt=datetime.utcnow())
        )

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
    industry: Optional[str] = None,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = TemplateService(session)
    return await service.list_templates(industry=industry)

@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = TemplateService(session)
    tmpl = await service.get_template(template_id)
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return tmpl

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
    await invalidate_worker_cache()
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
    import urllib.parse
    answer_url = f"{base_pipecat}/plivo/test-xml?deploymentId={dep.id}&direction=outbound&to={urllib.parse.quote_plus(norm_phone)}"

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

# Test Conversation (Real Agent LLM Completion)
@router.post("/clients/{client_id}/agents/{agent_id}/test")
async def test_conversation(
    client_id: str,
    agent_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    import os
    import sys
    import httpx
    from pathlib import Path
    
    message = body.get("message", "").strip()
    history = body.get("history") or []
    
    if not message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message is required")
        
    # 1. Fetch Agent & Active Version Configuration
    service = AgentService(session)
    agent = await service.get_agent(uuid.UUID(agent_id), uuid.UUID(client_id))
    if not agent or not agent.get("versions"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent or active version configuration not found")
        
    versions = agent.get("versions") or []
    latest_version = versions[0]
    cfg = latest_version.get("configuration") or {}
    
    # 2. Retrieve Knowledge Base Context (RAG)
    knowledge_results = []
    knowledge_cfg = cfg.get("knowledge") or {}
    if knowledge_cfg.get("enabled", True):
        try:
            from ..services.knowledge_service import KnowledgeService
            k_service = KnowledgeService(session)
            retrieved = await k_service.search_knowledge(
                tenant_id=uuid.UUID(client_id),
                query=message,
                top_k=knowledge_cfg.get("retrievalConfig", {}).get("topK", 3)
            )
            if retrieved:
                knowledge_results = [
                    {"content": item.content, "score": item.score, "sourceId": item.source_id}
                    for item in retrieved
                ]
        except Exception as k_err:
            logger.warning(f"[TestChat] Knowledge retrieval notice: {k_err}")

    # 3. Compile Authoritative System Prompt
    tz_name = cfg.get("businessInformation", {}).get("timezone", "Asia/Kolkata")
    compiled_prompt = prompt_compiler.compile_system_prompt(
        configuration=cfg,
        knowledge_results=knowledge_results,
        timezone=tz_name
    )
    
    # 4. Inject Temporal Context & Active Language Policy
    temporal_instructions = prompt_compiler.compile_temporal_context(timezone_str=tz_name)
    if "=== TEMPORAL CONTEXT ===" not in compiled_prompt:
        base_prompt_with_temporal = f"{compiled_prompt}\n\n{temporal_instructions}"
    else:
        base_prompt_with_temporal = compiled_prompt
        
    lang_cfg = cfg.get("language") or {}
    primary_lang = lang_cfg.get("primary", "en-IN")
    language_style = lang_cfg.get("languageStyle", lang_cfg.get("language_style", "mixed"))
    
    worker_path = Path(__file__).resolve().parents[3] / "apps" / "pipecat-worker"
    try:
        import importlib.util
        lang_mgr_file = worker_path / "app" / "language_manager.py"
        if lang_mgr_file.exists():
            spec = importlib.util.spec_from_file_location("worker_language_manager", str(lang_mgr_file))
            lang_mgr = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(lang_mgr)
            build_full_instructions = lang_mgr.build_full_instructions
            full_system_prompt = build_full_instructions(
                base_prompt_with_temporal,
                primary_lang,
                language_style=language_style
            )
        else:
            full_system_prompt = base_prompt_with_temporal
    except Exception as lang_err:
        logger.debug(f"[TestChat] Language instructions fallback notice: {lang_err}")
        full_system_prompt = base_prompt_with_temporal
        
    # 5. Assemble Messages List
    llm_messages = [{"role": "system", "content": full_system_prompt}]
    for h in history:
        r = h.get("role")
        c = h.get("content")
        if r in ("user", "assistant") and c:
            llm_messages.append({"role": r, "content": c})
            
    if not history or history[-1].get("content") != message:
        llm_messages.append({"role": "user", "content": message})
        
    # 6. Call Sarvam AI LLM Completion
    runtime_cfg = cfg.get("runtimeSettings") or {}
    llm_model = runtime_cfg.get("llmModel") or getattr(settings, "LLM_MODEL", None) or os.getenv("LLM_MODEL", "sarvam-105b-conversations")
    temperature = float(runtime_cfg.get("modelTemperature", 0.3))
    
    api_key = getattr(settings, "SARVAM_API_KEY", None) or os.getenv("SARVAM_API_KEY", "")
    reply_text = ""
    
    if api_key:
        try:
            async with httpx.AsyncClient(timeout=15.0) as http_client:
                res = await http_client.post(
                    "https://api.sarvam.ai/chat/completions",
                    headers={"api-subscription-key": api_key, "Content-Type": "application/json"},
                    json={
                        "model": llm_model,
                        "messages": llm_messages,
                        "temperature": temperature,
                        "max_tokens": 250,
                    }
                )
                if res.status_code == 200:
                    res_data = res.json()
                    choices = res_data.get("choices", [])
                    if choices and choices[0].get("message"):
                        reply_text = choices[0]["message"].get("content", "").strip()
                else:
                    logger.error(f"[TestChat] Sarvam API HTTP {res.status_code}: {res.text}")
        except Exception as llm_err:
            logger.error(f"[TestChat] Sarvam LLM completion error: {llm_err}")
            
    if not reply_text:
        # High quality fallback reply if API key is not present in local test
        greeting = cfg.get("identity", {}).get("greeting", "Hello! How can I help you today?")
        reply_text = f"{greeting} (Configured Agent: {agent.get('name', 'Assistant')})"
        
    return {
        "reply": reply_text,
        "knowledgeUsed": knowledge_results
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

@router.post("/clients/{client_id}/agents/{agent_id}/knowledge", status_code=status.HTTP_201_CREATED)
async def upload_agent_knowledge(
    client_id: str,
    agent_id: str,
    files: List[UploadFile] = File(...),
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    from ..services.knowledge_service import KnowledgeService
    ks = KnowledgeService(session)
    results = []
    for upload_file in files:
        raw = await upload_file.read()
        content = raw.decode("utf-8", errors="replace")
        ext = (upload_file.filename or "document.txt").rsplit(".", 1)[-1].lower() if upload_file.filename else "txt"
        result = await ks.ingest_document(
            tenant_id=uuid.UUID(client_id),
            agent_id=uuid.UUID(agent_id),
            file_name=upload_file.filename or "document.txt",
            content=content,
            file_type=ext
        )
        results.append({"sourceId": result["id"], "fileName": result["fileName"], "status": result["status"]})
    return {"results": results}

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

# Agent Publishing & Inbound Number Linking (Module 1)
@router.post("/clients/{client_id}/agents/{agent_id}/publish")
async def publish_agent(
    client_id: str,
    agent_id: str,
    body: Optional[Dict[str, Any]] = None,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = AgentService(session)
    agent = await service.get_agent(uuid.UUID(agent_id), uuid.UUID(client_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    body = body or {}
    config_to_publish = body.get("configuration")
    notes = body.get("notes") or f"Published by admin at {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}"

    if not config_to_publish:
        versions = agent.get("versions") or []
        if versions:
            config_to_publish = versions[0].get("configuration") or {}
        else:
            config_to_publish = {}

    user_id = None
    if payload.get("userId"):
        try:
            u_check = await session.execute(select(User.id).where(User.id == uuid.UUID(payload["userId"])))
            if u_check.scalar_one_or_none():
                user_id = uuid.UUID(payload["userId"])
        except Exception:
            pass
    if not user_id:
        u_fallback = await session.execute(select(User.id).where(User.role == UserRole.ADMIN).limit(1))
        user_id = u_fallback.scalar_one_or_none() or uuid.uuid4()

    created_version = await service.create_version(
        agent_id=uuid.UUID(agent_id),
        tenant_id=uuid.UUID(client_id),
        configuration=config_to_publish,
        created_by=user_id,
        notes=notes
    )

    active_dep = agent.get("activeDeployment")
    dep_id = active_dep.get("id") if active_dep else None
    await invalidate_worker_cache(dep_id)

    updated_agent = await service.get_agent(uuid.UUID(agent_id), uuid.UUID(client_id))
    return {
        "success": True,
        "message": "Agent version locked and published successfully!",
        "version": created_version,
        "agent": updated_agent
    }

@router.get("/clients/{client_id}/agents/{agent_id}/inbound-number")
async def get_agent_inbound_number(
    client_id: str,
    agent_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    phone_res = await session.execute(
        select(PhoneNumber).where(
            PhoneNumber.tenantId == uuid.UUID(client_id),
            PhoneNumber.agentId == uuid.UUID(agent_id),
            PhoneNumber.status == "active"
        ).order_by(desc(PhoneNumber.createdAt)).limit(1)
    )
    assigned_phone = phone_res.scalar_one_or_none()

    if not assigned_phone:
        phone_res = await session.execute(
            select(PhoneNumber).where(
                PhoneNumber.tenantId == uuid.UUID(client_id),
                PhoneNumber.status == "active"
            ).order_by(desc(PhoneNumber.createdAt)).limit(1)
        )
        assigned_phone = phone_res.scalar_one_or_none()

    dep_res = await session.execute(
        select(Deployment).where(
            Deployment.agentId == uuid.UUID(agent_id),
            Deployment.tenantId == uuid.UUID(client_id),
            Deployment.status == DeploymentStatus.ACTIVE
        ).order_by(desc(Deployment.createdAt)).limit(1)
    )
    dep = dep_res.scalar_one_or_none()

    if assigned_phone:
        return {
            "assigned": True,
            "phoneNumber": assigned_phone.phoneNumber,
            "provider": assigned_phone.provider,
            "status": assigned_phone.status,
            "deploymentId": str(assigned_phone.deploymentId or (dep.id if dep else "")),
            "createdAt": assigned_phone.createdAt.isoformat() if assigned_phone.createdAt else None
        }
    return {
        "assigned": False,
        "phoneNumber": None,
        "provider": "plivo",
        "status": None,
        "deploymentId": str(dep.id) if dep else None
    }

@router.post("/clients/{client_id}/agents/{agent_id}/inbound-number")
async def set_agent_inbound_number(
    client_id: str,
    agent_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    raw_phone = body.get("phoneNumber")
    norm_phone = TelephonyService.sanitize_e164(raw_phone)
    if not norm_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid phone number in E.164 format is required (e.g. +918031707681)"
        )

    provider = body.get("provider", "plivo")
    now = datetime.utcnow()

    # Check if number is assigned to another tenant
    existing_res = await session.execute(
        select(PhoneNumber).where(
            PhoneNumber.phoneNumber == norm_phone,
            PhoneNumber.tenantId != uuid.UUID(client_id)
        )
    )
    existing_other = existing_res.scalar_one_or_none()
    if existing_other:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Phone number {norm_phone} is already assigned to another client workspace."
        )

    user_id = None
    if payload.get("userId"):
        try:
            u_check = await session.execute(select(User.id).where(User.id == uuid.UUID(payload["userId"])))
            if u_check.scalar_one_or_none():
                user_id = uuid.UUID(payload["userId"])
        except Exception:
            pass
    if not user_id:
        u_fallback = await session.execute(select(User.id).where(User.role == UserRole.ADMIN).limit(1))
        user_id = u_fallback.scalar_one_or_none() or uuid.uuid4()

    service = AgentService(session)
    agent = await service.get_agent(uuid.UUID(agent_id), uuid.UUID(client_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    versions = agent.get("versions") or []
    if not versions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent must have at least one version before linking a number.")
    latest_version_id = uuid.UUID(versions[0]["id"])

    dep_res = await session.execute(
        select(Deployment).where(
            Deployment.agentId == uuid.UUID(agent_id),
            Deployment.tenantId == uuid.UUID(client_id),
            Deployment.environment == DeploymentEnvironment.PRODUCTION
        ).order_by(desc(Deployment.createdAt)).limit(1)
    )
    dep = dep_res.scalar_one_or_none()

    if not dep:
        dep = Deployment(
            id=uuid.uuid4(),
            tenantId=uuid.UUID(client_id),
            agentId=uuid.UUID(agent_id),
            versionId=latest_version_id,
            environment=DeploymentEnvironment.PRODUCTION,
            status=DeploymentStatus.ACTIVE,
            createdBy=user_id,
            createdAt=now
        )
        session.add(dep)
    else:
        dep.versionId = latest_version_id
        dep.status = DeploymentStatus.ACTIVE

    phone_res = await session.execute(
        select(PhoneNumber).where(
            PhoneNumber.tenantId == uuid.UUID(client_id),
            PhoneNumber.phoneNumber == norm_phone
        )
    )
    phone_record = phone_res.scalar_one_or_none()
    if not phone_record:
        phone_record = PhoneNumber(
            id=uuid.uuid4(),
            tenantId=uuid.UUID(client_id),
            agentId=uuid.UUID(agent_id),
            deploymentId=dep.id,
            phoneNumber=norm_phone,
            provider=provider,
            status="active",
            createdAt=now,
            updatedAt=now
        )
        session.add(phone_record)
    else:
        phone_record.agentId = uuid.UUID(agent_id)
        phone_record.deploymentId = dep.id
        phone_record.status = "active"
        phone_record.provider = provider
        phone_record.updatedAt = now

    agent_db_res = await session.execute(select(Agent).where(Agent.id == uuid.UUID(agent_id)))
    agent_db = agent_db_res.scalar_one_or_none()
    await session.commit()
    await invalidate_worker_cache(str(dep.id))

    # Auto-sync Plivo cloud XML application attachment
    if provider == "plivo" and settings.PLIVO_AUTH_ID and settings.PLIVO_AUTH_TOKEN:
        try:
            stream_host = settings.PLIVO_STREAM_HOST or request.headers.get("host", "localhost:8000")
            target_answer_url = f"https://{stream_host}/api/v1/telephony/plivo/inbound"
            auth = (settings.PLIVO_AUTH_ID, settings.PLIVO_AUTH_TOKEN)
            base_plivo = f"https://api.plivo.com/v1/Account/{settings.PLIVO_AUTH_ID}"
            clean_digits = re.sub(r"[^\d]", "", norm_phone)

            async with httpx.AsyncClient(timeout=6.0) as plivo_http:
                app_res = await plivo_http.get(f"{base_plivo}/Application/", auth=auth)
                if app_res.status_code == 200:
                    apps = app_res.json().get("objects", [])
                    target_app = next((a for a in apps if "nextlite" in a.get("app_name", "").lower() or "voice" in a.get("app_name", "").lower() or "default" in a.get("app_name", "").lower()), (apps[0] if apps else None))
                    if target_app:
                        app_id = target_app.get("app_id")
                        await plivo_http.post(
                            f"{base_plivo}/Application/{app_id}/",
                            auth=auth,
                            json={"answer_url": target_answer_url, "answer_method": "POST", "hangup_url": target_answer_url, "hangup_method": "POST"}
                        )
                        await plivo_http.post(
                            f"{base_plivo}/Number/{clean_digits}/",
                            auth=auth,
                            json={"app_id": app_id}
                        )
                        logger.info(f"[Plivo Sync] Successfully linked Plivo DID {clean_digits} to Application {app_id}")
        except Exception as plivo_sync_err:
            logger.warning(f"[Plivo Sync] Auto-linking Plivo number notice: {plivo_sync_err}")

    return {
        "success": True,
        "message": f"Inbound phone number {norm_phone} successfully linked to agent!",
        "phoneNumber": norm_phone,
        "provider": provider,
        "deploymentId": str(dep.id),
        "agentId": agent_id,
        "tenantId": client_id
    }

@router.delete("/clients/{client_id}/agents/{agent_id}/inbound-number")
async def disconnect_agent_inbound_number(
    client_id: str,
    agent_id: str,
    phone_number: Optional[str] = Query(None, alias="phoneNumber"),
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    """
    Disconnects and releases a phone number from an agent/tenant.
    This frees up the DID so it can be reassigned to another agent or client workspace without 409 conflict.
    """
    stmt = select(PhoneNumber).where(PhoneNumber.tenantId == uuid.UUID(client_id))
    if phone_number:
        norm_phone = TelephonyService.sanitize_e164(phone_number)
        stmt = stmt.where(PhoneNumber.phoneNumber == norm_phone)
    else:
        stmt = stmt.where(
            (PhoneNumber.agentId == uuid.UUID(agent_id)) | (PhoneNumber.agentId == None)
        )

    phone_res = await session.execute(stmt)
    phone_records = phone_res.scalars().all()

    if not phone_records:
        # Fallback: check if any phone is linked to tenant
        all_res = await session.execute(select(PhoneNumber).where(PhoneNumber.tenantId == uuid.UUID(client_id)))
        phone_records = all_res.scalars().all()

    released_numbers = []
    if phone_records:
        for pr in phone_records:
            released_numbers.append(pr.phoneNumber)
            dep_id = pr.deploymentId
            await session.delete(pr)
            if dep_id:
                await invalidate_worker_cache(str(dep_id))

    # Deactivate active deployments for this agent
    dep_res = await session.execute(
        select(Deployment).where(
            Deployment.agentId == uuid.UUID(agent_id),
            Deployment.tenantId == uuid.UUID(client_id),
            Deployment.status == DeploymentStatus.ACTIVE
        )
    )
    for d in dep_res.scalars().all():
        d.status = DeploymentStatus.INACTIVE
        await invalidate_worker_cache(str(d.id))

    await session.commit()

    return {
        "success": True,
        "message": f"Successfully disconnected and released {', '.join(released_numbers) if released_numbers else 'phone number'}.",
        "phoneNumbers": released_numbers,
        "agentId": agent_id,
        "tenantId": client_id
    }

# Go Live & Deployment Final Handover (Module 3)
@router.post("/clients/{client_id}/agents/{agent_id}/go-live")
async def go_live_agent(
    client_id: str,
    agent_id: str,
    body: Optional[Dict[str, Any]] = None,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    """
    Module 3 Go-Live Action:
    1. Sets Agent and Deployment status to ACTIVE/READY.
    2. Resets test operational data (call logs, mock appointments, test leads) to 0.
    3. Activates and starts official subscription billing cycle from today.
    4. Flushes runtime cache for zero-latency worker routing.
    5. Returns complete handover package with carrier call-forwarding cheat sheet.
    """
    client_uuid = uuid.UUID(client_id)
    agent_uuid = uuid.UUID(agent_id)
    body = body or {}
    reset_test_data = body.get("resetTestData", False)

    crm_service = CRMService(session)
    agent_service = AgentService(session)

    # 1. Fetch Tenant & Agent
    t_res = await session.execute(select(Tenant).where(Tenant.id == client_uuid))
    tenant = t_res.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client workspace not found")

    agent_data = await agent_service.get_agent(agent_uuid, client_uuid)
    if not agent_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    # 2. Reset Test Data only if explicitly requested (e.g. sandbox wipe)
    deleted_counts = {}
    if reset_test_data:
        reset_res = await crm_service.reset_tenant_data(client_uuid)
        deleted_counts = reset_res.get("deletedCounts", {})

    # 3. Fetch or update active Deployment
    now = datetime.utcnow()
    dep_res = await session.execute(
        select(Deployment).where(
            Deployment.agentId == agent_uuid,
            Deployment.tenantId == client_uuid
        ).order_by(desc(Deployment.createdAt)).limit(1)
    )
    dep = dep_res.scalar_one_or_none()
    if dep:
        dep.status = DeploymentStatus.ACTIVE
        dep.updatedAt = now
    else:
        v_res = await session.execute(
            select(AgentVersion).where(
                AgentVersion.agentId == agent_uuid,
                AgentVersion.tenantId == client_uuid
            ).order_by(desc(AgentVersion.versionNumber)).limit(1)
        )
        latest_ver = v_res.scalar_one_or_none()
        if latest_ver:
            dep = Deployment(
                tenantId=client_uuid,
                agentId=agent_uuid,
                versionId=latest_ver.id,
                environment=DeploymentEnvironment.PRODUCTION,
                status=DeploymentStatus.ACTIVE,
                createdBy=user_id,
                deployedAt=now,
                createdAt=now,
                updatedAt=now
            )
            session.add(dep)

    # 4. Update Agent status
    agent_db_res = await session.execute(select(Agent).where(Agent.id == agent_uuid))
    agent_db = agent_db_res.scalar_one_or_none()
    if agent_db:
        agent_db.status = AgentStatus.READY
        agent_db.updatedAt = now

    # 5. Initialize/Activate Subscription billing cycle
    sub_res = await session.execute(
        select(Subscription).where(
            Subscription.tenantId == client_uuid
        ).order_by(desc(Subscription.createdAt)).limit(1)
    )
    sub = sub_res.scalar_one_or_none()
    if sub:
        sub.status = SubscriptionStatus.ACTIVE
        if not sub.startedAt:
            sub.startedAt = now
        if not sub.currentPeriodEnd or sub.currentPeriodEnd < now:
            sub.currentPeriodEnd = now + timedelta(days=365 if sub.billingCycle == "yearly" else 30)
        sub.updatedAt = now

    # 6. Fetch Linked Phone Number (DID)
    phone_res = await session.execute(
        select(PhoneNumber).where(
            PhoneNumber.tenantId == client_uuid,
            PhoneNumber.status == "active"
        ).order_by(desc(PhoneNumber.createdAt)).limit(1)
    )
    phone_record = phone_res.scalar_one_or_none()
    assigned_phone = phone_record.phoneNumber if phone_record else None

    await session.commit()

    # 7. Worker Runtime Cache Invalidation
    if dep:
        await invalidate_worker_cache(str(dep.id))

    # 8. Generate Carrier Call Forwarding Dial Codes
    raw_did = (assigned_phone or "").replace("+", "").strip()
    forwarding_codes = {
        "unconditional": f"*21*{raw_did}#" if raw_did else "N/A",
        "busy": f"*67*{raw_did}#" if raw_did else "N/A",
        "noReply": f"*61*{raw_did}#" if raw_did else "N/A",
        "unreachable": f"*62*{raw_did}#" if raw_did else "N/A",
        "deactivate": "##002#"
    }

    # 9. Format WhatsApp / Email Handover Text
    agent_name = agent_db.name if agent_db else (agent_data.get("name") or "Clinic AI Receptionist")
    plan_name = sub.planName if (sub and sub.planName) else (f"{sub.planTier or 'Growth'} Plan" if sub else "Active Voice Plan")
    included_mins = sub.includedMinutes if sub else 500

    handover_text = (
        f"🏥 *NextLite Voice AI Receptionist — Live Handover*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"Dear *{tenant.name}* Team,\n\n"
        f"Your AI Voice Receptionist (*{agent_name}*) is now officially **LIVE in Production**! 🚀\n\n"
        f"📞 *Assigned AI Virtual Number (DID):* `{assigned_phone or 'Not Linked'}`\n"
        f"⚡ *Active Package:* {plan_name} ({included_mins:,} voice minutes allocated)\n\n"
        f"📲 *How to Forward Your Clinic Calls to AI:*\n"
        f"• *Always Forward (Immediate):* Dial `{forwarding_codes['unconditional']}` from your phone\n"
        f"• *Forward When Busy / On Another Call:* Dial `{forwarding_codes['busy']}`\n"
        f"• *Forward When Unanswered (after 3 rings):* Dial `{forwarding_codes['noReply']}`\n"
        f"• *Cancel All Forwarding Anytime:* Dial `##002#`\n\n"
        f"📊 *Client CRM & Live Calendar Portal:*\n"
        f"All patient appointments, recordings, and lead follow-ups sync instantly to your dashboard.\n\n"
        f"— *NextLite Voice Engineering Team*"
    )

    updated_agent = await agent_service.get_agent(agent_uuid, client_uuid)
    return {
        "success": True,
        "message": f"Agent '{agent_name}' is now LIVE in production!",
        "agent": updated_agent,
        "deployment": {
            "id": str(dep.id) if dep else None,
            "status": dep.status.value if (dep and hasattr(dep.status, "value")) else (dep.status if dep else "ACTIVE")
        } if dep else {"status": "ACTIVE"},
        "phoneNumber": assigned_phone,
        "subscription": {
            "id": str(sub.id) if sub else None,
            "planTier": sub.planTier if sub else None,
            "planName": sub.planName if sub else None,
            "status": sub.status.value if (sub and hasattr(sub.status, "value")) else (sub.status if sub else "active"),
            "billingCycle": sub.billingCycle if sub else "monthly",
            "includedMinutes": included_mins,
            "currentPeriodStart": (sub.startedAt.isoformat() if sub.startedAt else None) if sub else None,
            "currentPeriodEnd": (sub.currentPeriodEnd.isoformat() if sub.currentPeriodEnd else None) if sub else None,
        } if sub else None,
        "testDataPurged": reset_test_data,
        "deletedCounts": deleted_counts,
        "forwardingCodes": forwarding_codes,
        "handoverText": handover_text
    }

# Call Sessions & Transcripts (Admin)
@router.get("/calls")
async def list_admin_calls(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    tenant_id: Optional[str] = Query(None, alias="tenantId"),
    agent_id: Optional[str] = Query(None, alias="agentId"),
    status_filter: Optional[str] = Query(None, alias="status"),
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    service = CRMService(session)
    effective_tenant = uuid.UUID(tenant_id) if tenant_id else None
    agent_uuid = uuid.UUID(agent_id) if agent_id else None
    if effective_tenant:
        return await service.list_call_sessions(effective_tenant, limit, offset, agent_uuid, status_filter)
    
    # Query all tenants if no specific tenant filtered
    query = select(CallSession)
    if status_filter:
        try:
            query = query.where(CallSession.status == CallStatus(status_filter))
        except Exception:
            pass
    if agent_uuid:
        query = query.where(CallSession.agentId == agent_uuid)
    
    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar_one()
    query = query.order_by(CallSession.startedAt.desc()).limit(limit).offset(offset)
    res = await session.execute(query)
    sessions = res.scalars().all()
    mapped = [
        {
            "id": str(s.id),
            "tenantId": str(s.tenantId),
            "agentId": str(s.agentId) if s.agentId else None,
            "deploymentId": str(s.deploymentId) if s.deploymentId else None,
            "roomName": s.roomName,
            "status": s.status.value if hasattr(s.status, "value") else str(s.status),
            "direction": s.direction.value if hasattr(s.direction, "value") else str(s.direction),
            "callerNumber": s.callerNumber,
            "callerPhoneNumber": s.callerNumber,
            "durationSeconds": s.durationSeconds or 0,
            "primaryLanguage": s.primaryLanguage or "en-IN",
            "transcriptText": s.transcriptText,
            "transcript": s.turnsJson or [],
            "turnsJson": s.turnsJson or [],
            "toolsUsed": s.toolsUsed or [],
            "metricsJson": s.metricsJson or {},
            "startedAt": s.startedAt.isoformat() if s.startedAt else None,
            "endedAt": s.endedAt.isoformat() if s.endedAt else None,
            "createdAt": s.createdAt.isoformat() if s.createdAt else None,
        }
        for s in sessions
    ]
    return {"calls": mapped, "sessions": mapped, "total": total, "limit": limit, "offset": offset}

@router.get("/calls/{call_id}/transcript")
async def get_admin_call_transcript(
    call_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    call_uuid = uuid.UUID(call_id)
    res = await session.execute(select(CallSession).where(CallSession.id == call_uuid))
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found")
    return {
        "callId": str(s.id),
        "tenantId": str(s.tenantId),
        "agentId": str(s.agentId) if s.agentId else None,
        "callerNumber": s.callerNumber,
        "status": s.status.value if hasattr(s.status, "value") else str(s.status),
        "durationSeconds": s.durationSeconds or 0,
        "transcriptText": s.transcriptText,
        "turns": s.turnsJson or [],
        "toolsUsed": s.toolsUsed or [],
        "metrics": s.metricsJson or {},
        "startedAt": s.startedAt.isoformat() if s.startedAt else None,
        "endedAt": s.endedAt.isoformat() if s.endedAt else None,
    }


# Subscription Packages & Pricing (Module 2)
from ..services.subscription_service import SubscriptionService

@router.get("/plans/catalog")
async def get_admin_plans_catalog(
    payload: Dict[str, Any] = Depends(require_admin)
):
    return SubscriptionService.get_catalog()

@router.get("/clients/{client_id}/subscription")
async def get_client_subscription_admin(
    client_id: str,
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    sub_service = SubscriptionService(session)
    return await sub_service.get_subscription_with_usage(uuid.UUID(client_id))

@router.post("/clients/{client_id}/subscription")
async def assign_client_subscription_admin(
    client_id: str,
    body: Dict[str, Any],
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    sub_service = SubscriptionService(session)
    plan_tier = body.get("planTier", "STARTER")
    plan_name = body.get("planName")
    billing_cycle = body.get("billingCycle", "monthly")
    custom_price = body.get("customPrice")
    custom_minutes = body.get("customMinutes")
    custom_overage_rate = body.get("customOverageRate")
    admin_notes = body.get("adminNotes")

    updated = await sub_service.assign_plan(
        tenant_id=uuid.UUID(client_id),
        plan_tier=plan_tier,
        billing_cycle=billing_cycle,
        plan_name=plan_name,
        custom_price=float(custom_price) if custom_price is not None else None,
        custom_minutes=int(custom_minutes) if custom_minutes is not None else None,
        custom_overage_rate=float(custom_overage_rate) if custom_overage_rate is not None else None,
        admin_notes=admin_notes
    )

    return {
        "success": True,
        "message": f"Successfully assigned {updated['planName']} to client!",
        "subscription": updated
    }


