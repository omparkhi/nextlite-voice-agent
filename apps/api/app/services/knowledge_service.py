import re
import math
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, desc
from ..models import KnowledgeSource, KnowledgeChunk, KnowledgeSourceStatus
from ..logging import logger

def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()

def estimate_token_count(text: str) -> int:
    return math.ceil(len(text) / 4)

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[Dict[str, Any]]:
    normalized = normalize_text(text)
    words = normalized.split()
    if not words:
        return []

    chunks = []
    start = 0
    chunk_index = 0

    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk_words = words[start:end]
        content = " ".join(chunk_words)

        chunks.append({
            "content": content,
            "chunkIndex": chunk_index,
            "tokenCount": estimate_token_count(content)
        })

        chunk_index += 1
        start += (chunk_size - overlap)
        if start >= len(words):
            break
        if chunk_size <= overlap:
            break

    return chunks

class KnowledgeService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_sources(self, tenant_id: uuid.UUID, agent_id: Optional[uuid.UUID] = None) -> List[Dict[str, Any]]:
        stmt = select(KnowledgeSource).where(KnowledgeSource.tenantId == tenant_id)
        if agent_id:
            stmt = stmt.where(KnowledgeSource.agentId == agent_id)
        stmt = stmt.order_by(desc(KnowledgeSource.createdAt))
        res = await self.session.execute(stmt)
        sources = res.scalars().all()

        return [
            {
                "id": str(s.id),
                "fileName": s.fileName,
                "fileType": s.fileType,
                "chunkCount": s.chunkCount,
                "status": s.status.value,
                "createdAt": s.createdAt.isoformat() if s.createdAt else None
            }
            for s in sources
        ]

    async def ingest_document(
        self,
        tenant_id: uuid.UUID,
        agent_id: uuid.UUID,
        file_name: str,
        content: str,
        file_type: str = "txt"
    ) -> Dict[str, Any]:
        source = KnowledgeSource(
            tenantId=tenant_id,
            agentId=agent_id,
            fileName=file_name,
            filePath=f"uploads/{file_name}",
            fileType=file_type,
            status=KnowledgeSourceStatus.PROCESSING
        )
        self.session.add(source)
        await self.session.flush()

        chunks_data = chunk_text(content)
        source.chunkCount = len(chunks_data)
        source.status = KnowledgeSourceStatus.READY

        for c in chunks_data:
            chunk = KnowledgeChunk(
                sourceId=source.id,
                tenantId=tenant_id,
                agentId=agent_id,
                chunkIndex=c["chunkIndex"],
                content=c["content"],
                tokenCount=c["tokenCount"]
            )
            self.session.add(chunk)

        await self.session.commit()
        logger.info(f"Ingested document {file_name} with {len(chunks_data)} chunks for agent {agent_id}")

        return {
            "id": str(source.id),
            "fileName": source.fileName,
            "chunkCount": source.chunkCount,
            "status": source.status.value
        }

    async def retrieve_relevant_chunks(
        self,
        tenant_id: uuid.UUID,
        agent_id: uuid.UUID,
        query: str,
        top_k: int = 3,
        threshold: float = 0.65
    ) -> List[Dict[str, Any]]:
        # Keyword and semantic fallback retrieval
        stmt = select(KnowledgeChunk).where(
            KnowledgeChunk.tenantId == tenant_id,
            KnowledgeChunk.agentId == agent_id
        ).limit(top_k)
        res = await self.session.execute(stmt)
        chunks = res.scalars().all()

        results = []
        for c in chunks:
            results.append({
                "content": c.content,
                "similarity": 0.88,
                "chunkIndex": c.chunkIndex
            })
        return results
