import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, desc
from ..models import (
    Agent, AgentVersion, Deployment, AgentTemplate, AgentTool,
    AgentStatus, VersionStatus, DeploymentStatus, DeploymentEnvironment
)
from ..logging import logger

class AgentService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_agents(self, tenant_id: uuid.UUID) -> List[Dict[str, Any]]:
        stmt = select(Agent).where(Agent.tenantId == tenant_id).order_by(desc(Agent.updatedAt))
        res = await self.session.execute(stmt)
        agents_list = res.scalars().all()

        results = []
        for a in agents_list:
            # fetch latest version
            v_stmt = select(AgentVersion).where(AgentVersion.agentId == a.id).order_by(desc(AgentVersion.versionNumber)).limit(1)
            v_res = await self.session.execute(v_stmt)
            latest_v = v_res.scalar_one_or_none()

            results.append({
                "id": str(a.id),
                "name": a.name,
                "status": a.status.value,
                "createdAt": a.createdAt.isoformat() if a.createdAt else None,
                "updatedAt": a.updatedAt.isoformat() if a.updatedAt else None,
                "latestVersion": latest_v.versionNumber if latest_v else 1
            })
        return results

    async def get_agent(self, agent_id: uuid.UUID, tenant_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        stmt = select(Agent).where(Agent.id == agent_id, Agent.tenantId == tenant_id)
        res = await self.session.execute(stmt)
        agent = res.scalar_one_or_none()
        if not agent:
            return None

        # fetch versions
        v_stmt = select(AgentVersion).where(AgentVersion.agentId == agent.id).order_by(desc(AgentVersion.versionNumber))
        v_res = await self.session.execute(v_stmt)
        versions = v_res.scalars().all()

        # fetch active deployment
        d_stmt = select(Deployment).where(
            Deployment.agentId == agent.id,
            Deployment.status == DeploymentStatus.ACTIVE
        ).order_by(desc(Deployment.createdAt)).limit(1)
        d_res = await self.session.execute(d_stmt)
        active_dep = d_res.scalar_one_or_none()

        return {
            "id": str(agent.id),
            "tenantId": str(agent.tenantId),
            "name": agent.name,
            "status": agent.status.value,
            "createdAt": agent.createdAt.isoformat() if agent.createdAt else None,
            "updatedAt": agent.updatedAt.isoformat() if agent.updatedAt else None,
            "activeDeployment": {
                "id": str(active_dep.id),
                "versionId": str(active_dep.versionId),
                "environment": active_dep.environment.value,
                "status": active_dep.status.value
            } if active_dep else None,
            "versions": [
                {
                    "id": str(v.id),
                    "versionNumber": v.versionNumber,
                    "status": v.status.value,
                    "configuration": v.configuration,
                    "notes": v.notes,
                    "createdAt": v.createdAt.isoformat() if v.createdAt else None
                }
                for v in versions
            ]
        }

    async def create_agent(
        self,
        tenant_id: uuid.UUID,
        name: str,
        template_id: Optional[uuid.UUID] = None,
        created_by: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        agent = Agent(
            tenantId=tenant_id,
            templateId=template_id,
            name=name,
            status=AgentStatus.READY
        )
        self.session.add(agent)
        await self.session.flush()

        # Initial Version (v1)
        default_config = {
            "systemPrompt": "You are a professional voice receptionist. Keep responses concise and conversational.",
            "voice": {"provider": "sarvam", "voiceId": "priya"},
            "language": {"primary": "en-IN", "supportedLanguages": ["en-IN", "hi-IN"]},
            "tools": {"enabled": True, "tools": []}
        }
        version = AgentVersion(
            agentId=agent.id,
            versionNumber=1,
            status=VersionStatus.PUBLISHED,
            configuration=default_config,
            createdBy=created_by or uuid.uuid4(),
            notes="Initial configuration"
        )
        self.session.add(version)
        await self.session.flush()

        # Initial Active Deployment (PRODUCTION + TEST)
        dep = Deployment(
            tenantId=tenant_id,
            agentId=agent.id,
            versionId=version.id,
            environment=DeploymentEnvironment.PRODUCTION,
            status=DeploymentStatus.ACTIVE,
            createdBy=created_by or uuid.uuid4()
        )
        self.session.add(dep)
        await self.session.commit()

        logger.info(f"Created agent {agent.id} with version {version.id} and deployment {dep.id}")
        return await self.get_agent(agent.id, tenant_id)

    async def create_version(
        self,
        agent_id: uuid.UUID,
        tenant_id: uuid.UUID,
        configuration: Dict[str, Any],
        created_by: uuid.UUID,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        stmt = select(Agent).where(Agent.id == agent_id, Agent.tenantId == tenant_id)
        res = await self.session.execute(stmt)
        agent = res.scalar_one_or_none()
        if not agent:
            raise ValueError("Agent not found")

        v_stmt = select(AgentVersion).where(AgentVersion.agentId == agent_id).order_by(desc(AgentVersion.versionNumber)).limit(1)
        v_res = await self.session.execute(v_stmt)
        latest_v = v_res.scalar_one_or_none()
        next_version_num = (latest_v.versionNumber + 1) if latest_v else 1

        version = AgentVersion(
            agentId=agent_id,
            versionNumber=next_version_num,
            status=VersionStatus.PUBLISHED,
            configuration=configuration,
            createdBy=created_by,
            notes=notes
        )
        self.session.add(version)
        await self.session.commit()
        return {
            "id": str(version.id),
            "agentId": str(version.agentId),
            "versionNumber": version.versionNumber,
            "status": version.status.value,
            "configuration": version.configuration,
            "notes": version.notes
        }

    async def deploy_version(
        self,
        agent_id: uuid.UUID,
        tenant_id: uuid.UUID,
        version_id: uuid.UUID,
        environment: DeploymentEnvironment = DeploymentEnvironment.PRODUCTION,
        deployed_by: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        deact_stmt = (
            update(Deployment)
            .where(
                Deployment.agentId == agent_id,
                Deployment.environment == environment,
                Deployment.status == DeploymentStatus.ACTIVE
            )
            .values(status=DeploymentStatus.INACTIVE)
        )
        await self.session.execute(deact_stmt)

        dep = Deployment(
            tenantId=tenant_id,
            agentId=agent_id,
            versionId=version_id,
            environment=environment,
            status=DeploymentStatus.ACTIVE,
            createdBy=deployed_by or uuid.uuid4()
        )
        self.session.add(dep)
        await self.session.commit()
        return {
            "id": str(dep.id),
            "agentId": str(dep.agentId),
            "versionId": str(dep.versionId),
            "environment": dep.environment.value,
            "status": dep.status.value
        }
