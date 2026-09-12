import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth import require_admin
from ..services.knowledge_service import KnowledgeService

router = APIRouter(prefix="/api/admin/knowledge", tags=["knowledge"])

@router.get("/sources")
async def list_knowledge_sources(
    agent_id: Optional[str] = Query(None, alias="agentId"),
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = uuid.UUID(payload["tenantId"])
    agent_uuid = uuid.UUID(agent_id) if agent_id else None
    service = KnowledgeService(session)
    return await service.list_sources(tenant_id, agent_uuid)

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_knowledge(
    agent_id: str = Form(..., alias="agentId"),
    file: UploadFile = File(...),
    payload: Dict[str, Any] = Depends(require_admin),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = uuid.UUID(payload["tenantId"])
    agent_uuid = uuid.UUID(agent_id)
    service = KnowledgeService(session)

    content_bytes = await file.read()
    try:
        text_content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text_content = content_bytes.decode("latin-1", errors="ignore")

    res = await service.ingest_document(
        tenant_id=tenant_id,
        agent_id=agent_uuid,
        file_name=file.filename or "uploaded_doc.txt",
        content=text_content
    )
    return res
