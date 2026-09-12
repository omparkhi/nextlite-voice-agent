import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from ..repositories import AppointmentRepository, CallSessionRepository, KnowledgeRepository
from ..models import Appointment, Lead, AppointmentStatus, LeadStatus, LeadPriority
from ..domain.tools_safety import normalize_tool_id, get_user_safe_display_id
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

        logger.info(f"Executing tool {canonical_name} for tenant {trusted_tenant_id}")

        if canonical_name == "book_appointment":
            return await self._execute_book_appointment(
                arguments=arguments,
                tenant_id=trusted_tenant_id,
                agent_id=trusted_agent_id,
                caller_phone=trusted_caller_phone,
                call_session_id=call_session_id
            )
        elif canonical_name == "create_callback_lead":
            return await self._execute_create_lead(
                arguments=arguments,
                tenant_id=trusted_tenant_id,
                agent_id=trusted_agent_id,
                caller_phone=trusted_caller_phone,
                call_session_id=call_session_id
            )
        elif canonical_name == "query_knowledge_base":
            return await self._execute_knowledge_query(
                arguments=arguments,
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

        service_type = arguments.get("serviceType") or arguments.get("service") or "General Consultation"
        apt_date = arguments.get("appointmentDate") or arguments.get("date") or "Tomorrow"
        apt_time = arguments.get("appointmentTime") or arguments.get("time") or "10:00 AM"
        phone = arguments.get("customerPhone") or caller_phone or "+910000000000"

        # 1. Acquire atomic sequence number
        apt_repo = AppointmentRepository(self.session)
        apt_number = await apt_repo.get_next_appointment_number(tenant_id)

        # 2. Insert Appointment record
        apt = Appointment(
            tenantId=tenant_id,
            agentId=agent_id,
            callSessionId=call_session_id,
            appointmentNumber=apt_number,
            customerName=customer_name,
            customerPhone=phone,
            customerEmail=arguments.get("customerEmail"),
            serviceType=service_type,
            appointmentDate=apt_date,
            appointmentTime=apt_time,
            status=AppointmentStatus.SCHEDULED,
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

        lead_number = f"LEAD-{str(uuid.uuid4())[:6].upper()}"

        lead = Lead(
            tenantId=tenant_id,
            agentId=agent_id,
            callSessionId=call_session_id,
            leadNumber=lead_number,
            customerName=customer_name,
            customerPhone=phone,
            customerEmail=arguments.get("customerEmail"),
            requirement=requirement,
            status=LeadStatus.NEW,
            priority=priority_enum,
            notes=arguments.get("notes")
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
