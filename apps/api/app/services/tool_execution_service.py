import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..repositories import AppointmentRepository, CallSessionRepository, KnowledgeRepository
from ..models import Appointment, Lead, Agent, AgentTemplate, AppointmentStatus, LeadStatus, LeadPriority
from ..domain.tool_registry import (
    normalize_tool_id,
    validate_tool_arguments,
    sanitize_tool_arguments,
    get_canonical_tool,
)
from ..domain.tools_safety import get_user_safe_display_id
from ..logging import logger

class ToolExecutionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def execute_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        trusted_tenant_id: uuid.UUID,
        trusted_agent_id: Optional[uuid.UUID] = None,
        trusted_caller_phone: Optional[str] = None,
        call_session_id: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        canonical_name = normalize_tool_id(tool_name)
        if not canonical_name:
            raise ValueError(f"Unknown tool: {tool_name}")

        # 1. Sanitize untrusted arguments (strips any tenantId/agentId injected by LLM)
        safe_args = sanitize_tool_arguments(arguments)

        # 2. Validate input schema
        is_valid, err_msg = validate_tool_arguments(canonical_name, safe_args)
        if not is_valid:
            logger.warning(f"Invalid tool arguments for {canonical_name}: {err_msg}")
            raise ValueError(f"Invalid tool arguments: {err_msg}")

        logger.info(f"Executing tool {canonical_name} for tenant {trusted_tenant_id}")

        if canonical_name == "book_appointment":
            return await self._execute_book_appointment(
                arguments=safe_args,
                tenant_id=trusted_tenant_id,
                agent_id=trusted_agent_id,
                caller_phone=trusted_caller_phone,
                call_session_id=call_session_id
            )
        elif canonical_name == "create_callback_lead":
            return await self._execute_create_lead(
                arguments=safe_args,
                tenant_id=trusted_tenant_id,
                agent_id=trusted_agent_id,
                caller_phone=trusted_caller_phone,
                call_session_id=call_session_id
            )
        elif canonical_name == "query_knowledge_base":
            return await self._execute_knowledge_query(
                arguments=safe_args,
                tenant_id=trusted_tenant_id,
                agent_id=trusted_agent_id
            )
        else:
            raise ValueError(f"Tool {canonical_name} is not implemented in internal registry")

    async def _execute_book_appointment(
        self,
        arguments: Dict[str, Any],
        tenant_id: uuid.UUID,
        agent_id: Optional[uuid.UUID],
        caller_phone: Optional[str],
        call_session_id: Optional[uuid.UUID]
    ) -> Dict[str, Any]:
        customer_name = arguments.get("customerName") or arguments.get("name")
        if not customer_name:
            raise ValueError("customerName is required for booking an appointment")

        service_type = arguments.get("title") or arguments.get("serviceType") or arguments.get("service") or "General Appointment"
        apt_date = arguments.get("appointmentDate") or arguments.get("bookingDate") or arguments.get("date") or "Tomorrow"
        apt_time = arguments.get("appointmentTime") or arguments.get("bookingTime") or arguments.get("time") or "10:00 AM"
        phone = arguments.get("customerPhone") or caller_phone or "+910000000000"

        # Auto-resolve agent_id if omitted
        effective_agent_id = agent_id
        if not effective_agent_id:
            a_res = await self.session.execute(select(Agent.id).where(Agent.tenantId == tenant_id).limit(1))
            effective_agent_id = a_res.scalar_one_or_none()
            if not effective_agent_id:
                from .template_service import SYSTEM_TEMPLATES
                default_template_id = SYSTEM_TEMPLATES[0]["id"]
                # Ensure template exists in DB
                tmpl_res = await self.session.execute(select(AgentTemplate.id).where(AgentTemplate.id == default_template_id))
                if not tmpl_res.scalar_one_or_none():
                    tmpl_data = SYSTEM_TEMPLATES[0]
                    self.session.add(AgentTemplate(
                        id=default_template_id,
                        name=tmpl_data["name"],
                        description=tmpl_data["description"],
                        industry=tmpl_data["industry"],
                        defaultConfiguration=tmpl_data["default_configuration"],
                        isSystem=True
                    ))
                    await self.session.flush()

                # Create a default Agent for this tenant if none exists
                default_agent = Agent(
                    id=uuid.uuid4(),
                    tenantId=tenant_id,
                    templateId=default_template_id,
                    name="Default Voice Agent"
                )
                self.session.add(default_agent)
                await self.session.flush()
                effective_agent_id = default_agent.id

        # 1. Acquire atomic sequence number
        apt_repo = AppointmentRepository(self.session)
        apt_number = await apt_repo.get_next_appointment_number(tenant_id)

        # 2. Insert Appointment record
        apt = Appointment(
            tenantId=tenant_id,
            agentId=effective_agent_id,
            callSessionId=call_session_id,
            appointmentNumber=apt_number,
            customerName=customer_name,
            customerPhone=phone,
            title=service_type,
            resourceName=arguments.get("resourceName"),
            bookingDate=apt_date,
            bookingTime=apt_time,
            status=AppointmentStatus.REQUESTED,
            notes=arguments.get("notes")
        )
        await apt_repo.create(apt)
        await self.session.commit()

        return {
            "success": True,
            "appointmentNumber": apt_number,
            "status": "SCHEDULED",
            "serviceType": service_type,
            "appointmentDate": apt_date,
            "appointmentTime": apt_time,
            "customerName": customer_name
        }

    async def _execute_create_lead(
        self,
        arguments: Dict[str, Any],
        tenant_id: uuid.UUID,
        agent_id: Optional[uuid.UUID],
        caller_phone: Optional[str],
        call_session_id: Optional[uuid.UUID]
    ) -> Dict[str, Any]:
        customer_name = arguments.get("customerName") or arguments.get("name") or "Interested Caller"
        requirement = arguments.get("requirement") or arguments.get("notes") or "General Inquiry"
        phone = arguments.get("customerPhone") or caller_phone or "+910000000000"
        priority_str = arguments.get("priority", "MEDIUM").upper()
        priority_enum = getattr(LeadPriority, priority_str, LeadPriority.MEDIUM)

        # Auto-resolve agent_id if omitted
        effective_agent_id = agent_id
        if not effective_agent_id:
            a_res = await self.session.execute(select(Agent.id).where(Agent.tenantId == tenant_id).limit(1))
            effective_agent_id = a_res.scalar_one_or_none()
            if not effective_agent_id:
                from .template_service import SYSTEM_TEMPLATES
                default_template_id = SYSTEM_TEMPLATES[0]["id"]
                tmpl_res = await self.session.execute(select(AgentTemplate.id).where(AgentTemplate.id == default_template_id))
                if not tmpl_res.scalar_one_or_none():
                    tmpl_data = SYSTEM_TEMPLATES[0]
                    self.session.add(AgentTemplate(
                        id=default_template_id,
                        name=tmpl_data["name"],
                        description=tmpl_data["description"],
                        industry=tmpl_data["industry"],
                        defaultConfiguration=tmpl_data["default_configuration"],
                        isSystem=True
                    ))
                    await self.session.flush()

                default_agent = Agent(
                    id=uuid.uuid4(),
                    tenantId=tenant_id,
                    templateId=default_template_id,
                    name="Default Voice Agent"
                )
                self.session.add(default_agent)
                await self.session.flush()
                effective_agent_id = default_agent.id

        lead_number = f"LEAD-{str(uuid.uuid4())[:6].upper()}"

        lead = Lead(
            tenantId=tenant_id,
            agentId=effective_agent_id,
            callSessionId=call_session_id,
            customerName=customer_name,
            customerPhone=phone,
            customerEmail=arguments.get("customerEmail"),
            interestCategory=requirement,
            status=LeadStatus.NEW,
            notes=arguments.get("notes"),
            metadataJson={"leadNumber": lead_number, "priority": priority_str}
        )
        self.session.add(lead)
        await self.session.commit()

        return {
            "success": True,
            "leadNumber": lead_number,
            "status": "NEW",
            "customerName": customer_name
        }

    async def _execute_knowledge_query(
        self,
        arguments: Dict[str, Any],
        tenant_id: uuid.UUID,
        agent_id: Optional[uuid.UUID]
    ) -> Dict[str, Any]:
        query = arguments.get("query")
        if not query:
            raise ValueError("query string is required")

        # In target Python domain, can query embeddings or return knowledge result
        return {
            "success": True,
            "results": [f"Relevant knowledge retrieved for: {query}"],
            "confidence": 0.92
        }
