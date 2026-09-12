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
            v_stmt = select(AgentVersion).where(AgentVersion.agentId == a.id).order_by(desc(AgentVersion.versionNumber)).limit(1)
            v_res = await self.session.execute(v_stmt)
            latest_v = v_res.scalar_one_or_none()

            results.append({
                "id": str(a.id),
                "templateId": str(a.templateId) if a.templateId else None,
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
            "templateId": str(agent.templateId) if agent.templateId else None,
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

    async def update_agent(
        self,
        agent_id: uuid.UUID,
        tenant_id: uuid.UUID,
        name: Optional[str] = None,
        status: Optional[str] = None,
        description: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        stmt = select(Agent).where(Agent.id == agent_id, Agent.tenantId == tenant_id)
        res = await self.session.execute(stmt)
        agent = res.scalar_one_or_none()
        if not agent:
            return None

        if name:
            agent.name = name
        if status:
            try:
                agent.status = AgentStatus(status)
            except Exception:
                pass
        agent.updatedAt = datetime.utcnow()
        await self.session.commit()
        return await self.get_agent(agent_id, tenant_id)

    async def create_agent(
        self,
        tenant_id: uuid.UUID,
        name: str,
        template_id: Optional[uuid.UUID] = None,
        created_by: Optional[uuid.UUID] = None,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        from .template_service import TemplateService, SYSTEM_TEMPLATES
        t_service = TemplateService(self.session)

        # If no template_id provided, default to generic Receptionist template to satisfy DB schema
        target_template_id = template_id or SYSTEM_TEMPLATES[0]["id"]

        # Ensure system template exists in DB if needed
        tmpl_data = await t_service.get_template(target_template_id)
        if tmpl_data:
            # Check if template row is in DB
            stmt = select(AgentTemplate).where(AgentTemplate.id == target_template_id)
            res = await self.session.execute(stmt)
            if not res.scalar_one_or_none():
                new_db_tmpl = AgentTemplate(
                    id=target_template_id,
                    name=tmpl_data["name"],
                    description=tmpl_data["description"],
                    industry=tmpl_data["industry"],
                    defaultConfiguration=tmpl_data["defaultConfiguration"],
                    isSystem=True
                )
                self.session.add(new_db_tmpl)
                await self.session.flush()

        agent = Agent(
            tenantId=tenant_id,
            templateId=target_template_id,
            name=name,
            status=AgentStatus.READY
        )
        self.session.add(agent)
        await self.session.flush()

        # Load template config snapshot
        tmpl_config = {}
        if tmpl_data and tmpl_data.get("defaultConfiguration"):
            import copy
            tmpl_config = copy.deepcopy(tmpl_data["defaultConfiguration"])
            if "identity" in tmpl_config and isinstance(tmpl_config["identity"], dict):
                tmpl_config["identity"]["agentName"] = name
                tmpl_config["identity"]["name"] = name
            if tmpl_data.get("basePrompt") and "basePrompt" not in tmpl_config:
                tmpl_config["basePrompt"] = tmpl_data["basePrompt"]

        default_config = tmpl_config or {
            "identity": {"agentName": name, "greeting": "Hello! How can I assist you today?"},
            "persona": {"role": "AI Voice Assistant", "tone": "helpful and professional"},
            "objective": {"primaryObjective": "Assist callers with inquiries and handle requests accurately and politely."},
            "systemPrompt": "You are a professional AI voice assistant. Keep responses concise, direct, and conversational.",
            "voice": {"provider": "sarvam", "voiceId": "shubh", "gender": "male"},
            "language": {"primary": "hi-IN", "supported": ["en-IN", "hi-IN"]},
            "tools": {
                "enabled": True,
                "bindings": [
                    {"toolId": "query_knowledge_base", "name": "query_knowledge_base", "enabled": True},
                    {"toolId": "book_appointment", "name": "book_appointment", "enabled": True},
                    {"toolId": "create_callback_lead", "name": "create_callback_lead", "enabled": True}
                ]
            }
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
        await self.session.flush()

        # Update active deployments to point to latest version
        await self.session.execute(
            update(Deployment)
            .where(
                Deployment.agentId == agent_id,
                Deployment.status == DeploymentStatus.ACTIVE
            )
            .values(versionId=version.id, updatedAt=datetime.utcnow())
        )
        await self.session.commit()

        return {
            "id": str(version.id),
            "agentId": str(version.agentId),
            "versionNumber": version.versionNumber,
            "status": version.status.value,
            "configuration": version.configuration,
            "notes": version.notes,
            "createdAt": version.createdAt.isoformat() if version.createdAt else datetime.utcnow().isoformat()
        }

    async def get_versions(self, agent_id: uuid.UUID, tenant_id: uuid.UUID) -> List[Dict[str, Any]]:
        v_stmt = (
            select(AgentVersion)
            .join(Agent, Agent.id == AgentVersion.agentId)
            .where(Agent.id == agent_id, Agent.tenantId == tenant_id)
            .order_by(desc(AgentVersion.versionNumber))
        )
        res = await self.session.execute(v_stmt)
        versions = res.scalars().all()
        return [
            {
                "id": str(v.id),
                "agentId": str(v.agentId),
                "versionNumber": v.versionNumber,
                "status": v.status.value,
                "configuration": v.configuration,
                "notes": v.notes,
                "createdAt": v.createdAt.isoformat() if v.createdAt else None
            }
            for v in versions
        ]

    async def get_version(self, agent_id: uuid.UUID, tenant_id: uuid.UUID, version_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        v_stmt = (
            select(AgentVersion)
            .join(Agent, Agent.id == AgentVersion.agentId)
            .where(Agent.id == agent_id, Agent.tenantId == tenant_id, AgentVersion.id == version_id)
        )
        res = await self.session.execute(v_stmt)
        v = res.scalar_one_or_none()
        if not v:
            return None
        return {
            "id": str(v.id),
            "agentId": str(v.agentId),
            "versionNumber": v.versionNumber,
            "status": v.status.value,
            "configuration": v.configuration,
            "notes": v.notes,
            "createdAt": v.createdAt.isoformat() if v.createdAt else None
        }

    async def deploy_version(
        self,
        agent_id: uuid.UUID,
        tenant_id: uuid.UUID,
        version_id: uuid.UUID,
        environment: DeploymentEnvironment = DeploymentEnvironment.PRODUCTION,
        deployed_by: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        # Mark existing active deployments inactive
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
        
        # Mark Agent as LIVE
        await self.session.execute(
            update(Agent)
            .where(Agent.id == agent_id)
            .values(status=AgentStatus.LIVE, updatedAt=datetime.utcnow())
        )
        await self.session.commit()

        return {
            "id": str(dep.id),
            "agentId": str(dep.agentId),
            "versionId": str(dep.versionId),
            "environment": dep.environment.value,
            "status": dep.status.value
        }
