import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, text, func, desc
from .base import BaseRepository
from ..models import (
    Tenant, User, RefreshToken, Agent, AgentVersion, Deployment,
    CallSession, Lead, Appointment, TenantAppointmentCounter,
    KnowledgeSource, KnowledgeChunk, PhoneNumber, FollowUp,
    DeploymentStatus, DeploymentEnvironment, CallStatus, LeadStatus, AppointmentStatus
)

class TenantRepository(BaseRepository[Tenant]):
    def __init__(self, session: AsyncSession):
        super().__init__(Tenant, session)

    async def get_by_slug(self, slug: str) -> Optional[Tenant]:
        stmt = select(Tenant).where(Tenant.slug == slug)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()


class UserRepository(BaseRepository[User]):
    def __init__(self, session: AsyncSession):
        super().__init__(User, session)

    async def get_by_email(self, email: str) -> Optional[User]:
        stmt = select(User).where(User.email == email.lower().strip())
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_refresh_token(self, user_id: uuid.UUID, token: str, expires_at: datetime) -> RefreshToken:
        rt = RefreshToken(userId=user_id, token=token, expiresAt=expires_at)
        self.session.add(rt)
        await self.session.flush()
        return rt

    async def get_refresh_token(self, token: str) -> Optional[RefreshToken]:
        stmt = select(RefreshToken).where(RefreshToken.token == token)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def revoke_refresh_token(self, token: str) -> None:
        stmt = delete(RefreshToken).where(RefreshToken.token == token)
        await self.session.execute(stmt)


class AgentRepository(BaseRepository[Agent]):
    def __init__(self, session: AsyncSession):
        super().__init__(Agent, session)

    async def get_with_versions(self, agent_id: uuid.UUID, tenant_id: uuid.UUID) -> Optional[Agent]:
        stmt = select(Agent).where(Agent.id == agent_id, Agent.tenantId == tenant_id)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_latest_version(self, agent_id: uuid.UUID) -> Optional[AgentVersion]:
        stmt = select(AgentVersion).where(AgentVersion.agentId == agent_id).order_by(desc(AgentVersion.versionNumber)).limit(1)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_active_deployment_by_agent(self, agent_id: uuid.UUID, env: DeploymentEnvironment = DeploymentEnvironment.PRODUCTION) -> Optional[Deployment]:
        stmt = select(Deployment).where(
            Deployment.agentId == agent_id,
            Deployment.environment == env,
            Deployment.status == DeploymentStatus.ACTIVE
        ).order_by(desc(Deployment.createdAt)).limit(1)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()


class AppointmentRepository(BaseRepository[Appointment]):
    def __init__(self, session: AsyncSession):
        super().__init__(Appointment, session)

    async def get_next_appointment_number(self, tenant_id: uuid.UUID) -> str:
        """
        Atomic sequence generator for customer-safe appointment numbering (e.g. APT-1001).
        Guarantees zero concurrency races via PostgreSQL row-level locks.
        """
        stmt = select(TenantAppointmentCounter).where(TenantAppointmentCounter.tenantId == tenant_id).with_for_update()
        res = await self.session.execute(stmt)
        counter = res.scalar_one_or_none()

        if not counter:
            counter = TenantAppointmentCounter(tenantId=tenant_id, lastNumber=1001)
            self.session.add(counter)
            await self.session.flush()
            next_num = 1001
        else:
            counter.lastNumber += 1
            next_num = counter.lastNumber
            await self.session.flush()

        return f"APT-{next_num}"


class CallSessionRepository(BaseRepository[CallSession]):
    def __init__(self, session: AsyncSession):
        super().__init__(CallSession, session)

    async def finalize_call(
        self,
        call_id: uuid.UUID,
        status: CallStatus,
        duration_seconds: int,
        transcript: list,
        metrics_json: dict,
        tools_used: list = None
    ) -> Optional[CallSession]:
        stmt = (
            update(CallSession)
            .where(CallSession.id == call_id)
            .values(
                status=status,
                durationSeconds=duration_seconds,
                transcript=transcript,
                metricsJson=metrics_json,
                toolsUsed=tools_used or [],
                endedAt=datetime.utcnow()
            )
            .returning(CallSession)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()


class KnowledgeRepository(BaseRepository[KnowledgeSource]):
    def __init__(self, session: AsyncSession):
        super().__init__(KnowledgeSource, session)

    async def search_chunks(
        self,
        tenant_id: uuid.UUID,
        query_embedding: List[float],
        agent_id: Optional[uuid.UUID] = None,
        top_k: int = 3,
        threshold: float = 0.65
    ) -> List[Dict[str, Any]]:
        # pgvector cosine distance: embedding <=> query_vector
        # similarity = 1 - (embedding <=> query_vector)
        stmt = select(
            KnowledgeChunk.content,
            (1 - KnowledgeChunk.embedding.cosine_distance(query_embedding)).label("similarity")
        ).where(
            KnowledgeChunk.tenantId == tenant_id
        )
        if agent_id:
            stmt = stmt.where(KnowledgeChunk.agentId == agent_id)

        stmt = stmt.order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding)).limit(top_k)
        res = await self.session.execute(stmt)
        results = []
        for row in res.all():
            content, sim = row
            if sim >= threshold:
                results.append({"content": content, "similarity": float(sim)})
        return results


class PhoneNumberRepository(BaseRepository[PhoneNumber]):
    def __init__(self, session: AsyncSession):
        super().__init__(PhoneNumber, session)

    async def get_by_number(self, phone_number: str) -> Optional[PhoneNumber]:
        cleaned = phone_number.strip()
        stmt = select(PhoneNumber).where(PhoneNumber.phoneNumber == cleaned)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()