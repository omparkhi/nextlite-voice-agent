import uuid
import enum
from datetime import datetime
from typing import Optional, List, Any
from sqlalchemy import (
    Column, String, Text, Boolean, DateTime, Integer, Float, ForeignKey,
    Enum as SQLEnum, Index, UniqueConstraint, func
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, Mapped, mapped_column
from pgvector.sqlalchemy import Vector
from .db import Base

# ==========================================
# 1. DATABASE ENUMS
# ==========================================

class VersionStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"

class DeploymentEnvironment(str, enum.Enum):
    TEST = "TEST"
    PRODUCTION = "PRODUCTION"

class DeploymentStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ROLLED_BACK = "ROLLED_BACK"

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    CLIENT_OWNER = "CLIENT_OWNER"
    CLIENT_VIEWER = "CLIENT_VIEWER"

class AgentStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    READY = "READY"
    LIVE = "LIVE"
    PAUSED = "PAUSED"
    ARCHIVED = "ARCHIVED"

class SubscriptionStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAYMENT_PENDING = "PAYMENT_PENDING"
    ACTIVE = "ACTIVE"
    PAST_DUE = "PAST_DUE"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"

class ProposalStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class CallStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    MISSED = "MISSED"

class CallDirection(str, enum.Enum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"
    WEB_TEST = "WEB_TEST"

class LeadStatus(str, enum.Enum):
    NEW = "NEW"
    CONTACTED = "CONTACTED"
    QUALIFIED = "QUALIFIED"
    LOST = "LOST"

class LeadPriority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

class AppointmentStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"

class FollowUpStatus(str, enum.Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

class KnowledgeSourceStatus(str, enum.Enum):
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


# ==========================================
# 2. DATABASE MODELS (20 TABLES)
# ==========================================

class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    agents = relationship("Agent", back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[Optional[uuid.UUID]] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    passwordHash: Mapped[str] = mapped_column("password_hash", Text, nullable=False)
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole, name="user_role", native_enum=False), nullable=False)
    emailVerified: Mapped[bool] = mapped_column("email_verified", Boolean, default=False, nullable=False)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="users")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    userId: Mapped[uuid.UUID] = mapped_column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    expiresAt: Mapped[datetime] = mapped_column("expires_at", DateTime, nullable=False)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="refresh_tokens")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[Optional[uuid.UUID]] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True)
    actorId: Mapped[Optional[uuid.UUID]] = mapped_column("actor_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    entityType: Mapped[str] = mapped_column("entity_type", String(255), nullable=False)
    entityId: Mapped[Optional[str]] = mapped_column("entity_id", String(255), nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)


class VerificationToken(Base):
    __tablename__ = "verification_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    userId: Mapped[uuid.UUID] = mapped_column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    expiresAt: Mapped[datetime] = mapped_column("expires_at", DateTime, nullable=False)
    usedAt: Mapped[Optional[datetime]] = mapped_column("used_at", DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    planName: Mapped[Optional[str]] = mapped_column("plan_name", String(255), nullable=True)
    status: Mapped[SubscriptionStatus] = mapped_column(SQLEnum(SubscriptionStatus, name="subscription_status", native_enum=False), nullable=False, default=SubscriptionStatus.PENDING)
    startedAt: Mapped[Optional[datetime]] = mapped_column("started_at", DateTime, nullable=True)
    currentPeriodEnd: Mapped[Optional[datetime]] = mapped_column("current_period_end", DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)



class AgentTemplate(Base):
    __tablename__ = "agent_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    industry: Mapped[str] = mapped_column(String(100), nullable=False)
    defaultConfiguration: Mapped[dict] = mapped_column("default_configuration", JSONB, nullable=False, default=dict)
    isSystem: Mapped[bool] = mapped_column("is_system", Boolean, default=True, nullable=False)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    templateId: Mapped[Optional[uuid.UUID]] = mapped_column("template_id", UUID(as_uuid=True), ForeignKey("agent_templates.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[AgentStatus] = mapped_column(SQLEnum(AgentStatus, name="agent_status", native_enum=False), nullable=False, default=AgentStatus.DRAFT)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="agents")
    versions = relationship("AgentVersion", back_populates="agent", cascade="all, delete-orphan")


class AgentVersion(Base):
    __tablename__ = "agent_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agentId: Mapped[uuid.UUID] = mapped_column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    versionNumber: Mapped[int] = mapped_column("version_number", Integer, nullable=False)
    configuration: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[VersionStatus] = mapped_column(SQLEnum(VersionStatus, name="version_status", native_enum=False), nullable=False, default=VersionStatus.DRAFT)
    createdBy: Mapped[uuid.UUID] = mapped_column("created_by", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)

    agent = relationship("Agent", back_populates="versions")
    deployments = relationship("Deployment", back_populates="version", cascade="all, delete-orphan")


class Deployment(Base):
    __tablename__ = "deployments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agentId: Mapped[uuid.UUID] = mapped_column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    versionId: Mapped[uuid.UUID] = mapped_column("version_id", UUID(as_uuid=True), ForeignKey("agent_versions.id", ondelete="CASCADE"), nullable=False)
    environment: Mapped[DeploymentEnvironment] = mapped_column(SQLEnum(DeploymentEnvironment, name="deployment_environment", native_enum=False), nullable=False, default=DeploymentEnvironment.TEST)
    status: Mapped[DeploymentStatus] = mapped_column(SQLEnum(DeploymentStatus, name="deployment_status", native_enum=False), nullable=False, default=DeploymentStatus.ACTIVE)
    createdBy: Mapped[uuid.UUID] = mapped_column("created_by", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    deployedAt: Mapped[datetime] = mapped_column("deployed_at", DateTime, default=datetime.utcnow, nullable=False)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    version = relationship("AgentVersion", back_populates="deployments")


class AgentTool(Base):
    __tablename__ = "agent_tools"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agentId: Mapped[uuid.UUID] = mapped_column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    toolName: Mapped[str] = mapped_column("tool_name", String(255), nullable=False)
    toolConfig: Mapped[dict] = mapped_column("tool_config", JSONB, nullable=False, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agentId: Mapped[uuid.UUID] = mapped_column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    fileName: Mapped[str] = mapped_column("file_name", String(255), nullable=False)
    filePath: Mapped[str] = mapped_column("file_path", Text, nullable=False)
    fileType: Mapped[str] = mapped_column("file_type", String(50), nullable=False)
    chunkCount: Mapped[int] = mapped_column("chunk_count", Integer, default=0, nullable=False)
    contentHash: Mapped[Optional[str]] = mapped_column("content_hash", String(64), nullable=True)
    status: Mapped[KnowledgeSourceStatus] = mapped_column(SQLEnum(KnowledgeSourceStatus, name="knowledge_source_status", native_enum=False), default=KnowledgeSourceStatus.PROCESSING, nullable=False)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)

    chunks = relationship("KnowledgeChunk", back_populates="source", cascade="all, delete-orphan")


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sourceId: Mapped[uuid.UUID] = mapped_column("source_id", UUID(as_uuid=True), ForeignKey("knowledge_sources.id", ondelete="CASCADE"), nullable=False)
    agentId: Mapped[uuid.UUID] = mapped_column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = mapped_column(JSONB, nullable=True)
    chunkIndex: Mapped[int] = mapped_column("chunk_index", Integer, nullable=False)
    tokenCount: Mapped[Optional[int]] = mapped_column("token_count", Integer, nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)

    source = relationship("KnowledgeSource", back_populates="chunks")


class ConfigChangeProposal(Base):
    __tablename__ = "config_change_proposals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agentId: Mapped[uuid.UUID] = mapped_column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    proposedBy: Mapped[uuid.UUID] = mapped_column("proposed_by", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    userMessage: Mapped[str] = mapped_column("user_message", Text, nullable=False)
    currentConfig: Mapped[dict] = mapped_column("current_config", JSONB, nullable=False)
    proposedConfig: Mapped[dict] = mapped_column("proposed_config", JSONB, nullable=False)
    diff: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    status: Mapped[ProposalStatus] = mapped_column(SQLEnum(ProposalStatus, name="config_proposal_status", native_enum=False), default=ProposalStatus.PENDING, nullable=False)
    reviewedBy: Mapped[Optional[uuid.UUID]] = mapped_column("reviewed_by", UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewedAt: Mapped[Optional[datetime]] = mapped_column("reviewed_at", DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)


class CallSession(Base):
    __tablename__ = "call_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agentId: Mapped[Optional[uuid.UUID]] = mapped_column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    deploymentId: Mapped[Optional[uuid.UUID]] = mapped_column("deployment_id", UUID(as_uuid=True), ForeignKey("deployments.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[CallStatus] = mapped_column(SQLEnum(CallStatus, name="call_status", native_enum=False), nullable=False, default=CallStatus.ACTIVE)
    direction: Mapped[CallDirection] = mapped_column(SQLEnum(CallDirection, name="call_direction", native_enum=False), nullable=False, default=CallDirection.INBOUND)
    callerPhoneNumber: Mapped[Optional[str]] = mapped_column("caller_phone_number", String(50), nullable=True)
    recipientPhoneNumber: Mapped[Optional[str]] = mapped_column("recipient_phone_number", String(50), nullable=True)
    durationSeconds: Mapped[Optional[int]] = mapped_column("duration_seconds", Integer, default=0, nullable=True)
    transcript: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True, default=list)
    toolsUsed: Mapped[Optional[list]] = mapped_column("tools_used", JSONB, nullable=True, default=list)
    metricsJson: Mapped[Optional[dict]] = mapped_column("metrics_json", JSONB, nullable=True, default=dict)
    recordingUrl: Mapped[Optional[str]] = mapped_column("recording_url", Text, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sentiment: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    startedAt: Mapped[datetime] = mapped_column("started_at", DateTime, default=datetime.utcnow, nullable=False)
    endedAt: Mapped[Optional[datetime]] = mapped_column("ended_at", DateTime, nullable=True)


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agentId: Mapped[Optional[uuid.UUID]] = mapped_column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    callSessionId: Mapped[Optional[uuid.UUID]] = mapped_column("call_session_id", UUID(as_uuid=True), ForeignKey("call_sessions.id", ondelete="SET NULL"), nullable=True)
    leadNumber: Mapped[str] = mapped_column("lead_number", String(50), nullable=False)
    customerName: Mapped[str] = mapped_column("customer_name", String(255), nullable=False)
    customerPhone: Mapped[str] = mapped_column("customer_phone", String(50), nullable=False)
    customerEmail: Mapped[Optional[str]] = mapped_column("customer_email", String(255), nullable=True)
    requirement: Mapped[Text] = mapped_column(Text, nullable=False)
    status: Mapped[LeadStatus] = mapped_column(SQLEnum(LeadStatus, name="lead_status", native_enum=False), nullable=False, default=LeadStatus.NEW)
    priority: Mapped[LeadPriority] = mapped_column(SQLEnum(LeadPriority, name="lead_priority", native_enum=False), nullable=False, default=LeadPriority.MEDIUM)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agentId: Mapped[Optional[uuid.UUID]] = mapped_column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    callSessionId: Mapped[Optional[uuid.UUID]] = mapped_column("call_session_id", UUID(as_uuid=True), ForeignKey("call_sessions.id", ondelete="SET NULL"), nullable=True)
    appointmentNumber: Mapped[str] = mapped_column("appointment_number", String(50), nullable=False)
    customerName: Mapped[str] = mapped_column("customer_name", String(255), nullable=False)
    customerPhone: Mapped[str] = mapped_column("customer_phone", String(50), nullable=False)
    customerEmail: Mapped[Optional[str]] = mapped_column("customer_email", String(255), nullable=True)
    serviceType: Mapped[str] = mapped_column("service_type", String(255), nullable=False)
    appointmentDate: Mapped[str] = mapped_column("appointment_date", String(50), nullable=False)
    appointmentTime: Mapped[str] = mapped_column("appointment_time", String(50), nullable=False)
    status: Mapped[AppointmentStatus] = mapped_column(SQLEnum(AppointmentStatus, name="appointment_status", native_enum=False), nullable=False, default=AppointmentStatus.SCHEDULED)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class TenantAppointmentCounter(Base):
    __tablename__ = "tenant_appointment_counters"

    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    lastNumber: Mapped[int] = mapped_column("last_number", Integer, default=1000, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PhoneNumber(Base):
    __tablename__ = "phone_numbers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agentId: Mapped[Optional[uuid.UUID]] = mapped_column("agent_id", UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    phoneNumber: Mapped[str] = mapped_column("phone_number", String(50), nullable=False, unique=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    providerNumberId: Mapped[Optional[str]] = mapped_column("provider_number_id", String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class FollowUp(Base):
    __tablename__ = "follow_ups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    leadId: Mapped[Optional[uuid.UUID]] = mapped_column("lead_id", UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True)
    appointmentId: Mapped[Optional[uuid.UUID]] = mapped_column("appointment_id", UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True)
    callSessionId: Mapped[Optional[uuid.UUID]] = mapped_column("call_session_id", UUID(as_uuid=True), ForeignKey("call_sessions.id", ondelete="SET NULL"), nullable=True)
    customerName: Mapped[Optional[str]] = mapped_column("customer_name", String(255), nullable=True)
    customerPhone: Mapped[str] = mapped_column("customer_phone", String(50), nullable=False)
    channel: Mapped[str] = mapped_column(String(50), default="WHATSAPP", nullable=False)
    provider: Mapped[str] = mapped_column(String(50), default="DEMO", nullable=False)
    messageType: Mapped[str] = mapped_column("message_type", String(50), default="CUSTOM", nullable=False)
    messageText: Mapped[str] = mapped_column("message_text", Text, nullable=False)
    status: Mapped[FollowUpStatus] = mapped_column(SQLEnum(FollowUpStatus, name="follow_up_status", native_enum=False), nullable=False, default=FollowUpStatus.SENT)
    providerMessageId: Mapped[Optional[str]] = mapped_column("provider_message_id", String(255), nullable=True)
    isDemo: Mapped[bool] = mapped_column("is_demo", Boolean, default=True, nullable=False)
    sentAt: Mapped[datetime] = mapped_column("sent_at", DateTime, default=datetime.utcnow, nullable=False)
    deliveredAt: Mapped[Optional[datetime]] = mapped_column("delivered_at", DateTime, nullable=True)
    failedAt: Mapped[Optional[datetime]] = mapped_column("failed_at", DateTime, nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)