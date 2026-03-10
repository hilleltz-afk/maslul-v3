from sqlalchemy import CHAR, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text, TypeDecorator
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from .database import Base
import uuid
from datetime import datetime
from enum import Enum as PyEnum


class GUID(TypeDecorator):
    """Platform-independent UUID type.

    Uses PostgreSQL's UUID type, otherwise stores as CHAR(36).
    """

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        # If it's already a UUID-like object, stringify it.
        if isinstance(value, uuid.UUID) or hasattr(value, "hex"):
            return str(value)
        try:
            return str(uuid.UUID(value))
        except Exception:
            return str(value)

    def process_result_value(self, value, dialect):
        if value is None or value == "":
            return None
        if isinstance(value, uuid.UUID):
            return value
        try:
            return uuid.UUID(value)
        except Exception:
            # Sometimes SQLite stores empty strings; treat them as NULL.
            try:
                return uuid.UUID(str(value))
            except Exception:
                return None

class AuditAction(PyEnum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"), nullable=False)
    table_name = Column(String, nullable=False)
    record_id = Column(GUID(), nullable=False)
    field_name = Column(String, nullable=False)
    old_value = Column(Text)
    new_value = Column(Text)
    changed_by = Column(GUID(), ForeignKey("users.id"))
    changed_at = Column(DateTime, default=datetime.utcnow)
    action = Column(Enum(AuditAction), nullable=False)

class Tenant(Base):
    __tablename__ = "tenants"
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)

class User(Base):
    __tablename__ = "users"
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"), nullable=False)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    google_id = Column(String, unique=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
    created_by = Column(GUID(), ForeignKey("users.id"), nullable=True)

class Project(Base):
    __tablename__ = "projects"
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"), nullable=False)
    gush = Column(String, nullable=False)
    helka = Column(String, nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
    created_by = Column(GUID(), ForeignKey("users.id"), nullable=True)

class ProjectAlias(Base):
    __tablename__ = "project_aliases"
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"), nullable=False)
    project_id = Column(GUID(), ForeignKey("projects.id"), nullable=False)
    alias = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
    created_by = Column(GUID(), ForeignKey("users.id"), nullable=True)

class Stage(Base):
    __tablename__ = "stages"
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"), nullable=False)
    project_id = Column(GUID(), ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    handling_authority = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
    created_by = Column(GUID(), ForeignKey("users.id"), nullable=True)

class Task(Base):
    __tablename__ = "tasks"
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"), nullable=False)
    project_id = Column(GUID(), ForeignKey("projects.id"), nullable=False)
    stage_id = Column(GUID(), ForeignKey("stages.id"), nullable=False)
    assignee_id = Column(GUID(), ForeignKey("users.id"), nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    priority = Column(String, nullable=False)
    status = Column(String, nullable=False)
    rejection_count = Column(Integer, default=0)
    blocked_by = Column(GUID(), ForeignKey("tasks.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
    created_by = Column(GUID(), ForeignKey("users.id"), nullable=True)

class Contact(Base):
    __tablename__ = "contacts"
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"), nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String)
    email = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
    created_by = Column(GUID(), ForeignKey("users.id"), nullable=True)

class Document(Base):
    __tablename__ = "documents"
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"), nullable=False)
    project_id = Column(GUID(), ForeignKey("projects.id"), nullable=True)
    name = Column(String, nullable=False)
    path = Column(String, nullable=False)
    expiry_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
    created_by = Column(GUID(), ForeignKey("users.id"), nullable=True)


class EmailPipelineStatus(PyEnum):
    TRIAGED_OUT = "TRIAGED_OUT"   # לא רלוונטי — נסנן
    PENDING = "PENDING"            # ממתין לאישור אנושי
    APPROVED = "APPROVED"          # אושר — משימה נוצרה
    DISMISSED = "DISMISSED"        # נדחה על ידי המשתמש


class EmailPipelineItem(Base):
    """מייל שעבר את צינור ה-AI — שלבי Triage, Analysis ו-HITL."""
    __tablename__ = "email_pipeline"
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID(), ForeignKey("tenants.id"), nullable=False)

    # נתוני המייל המקורי
    gmail_message_id = Column(String, nullable=True)   # לשימוש עתידי עם Gmail API
    sender = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body_preview = Column(Text, nullable=True)          # 100 מילים ראשונות
    full_body = Column(Text, nullable=True)

    # תוצאת Step 1 — Triage
    triage_is_relevant = Column(Integer, nullable=True)  # 1/0 (bool)
    triage_confidence = Column(Float, nullable=True)
    triage_reason = Column(Text, nullable=True)

    # תוצאת Step 2 — Analysis
    suggested_project_id = Column(GUID(), ForeignKey("projects.id"), nullable=True)
    project_match_confidence = Column(Float, nullable=True)
    suggested_task_name = Column(String, nullable=True)
    suggested_priority = Column(String, nullable=True)
    suggested_assignee = Column(String, nullable=True)
    suggested_due_date = Column(DateTime, nullable=True)
    has_attachments = Column(Integer, nullable=True)     # 1/0 (bool)
    budget_mentioned = Column(Float, nullable=True)
    analysis_notes = Column(Text, nullable=True)

    # Step 3/4 — HITL ויצירת משימה
    status = Column(Enum(EmailPipelineStatus), nullable=False, default=EmailPipelineStatus.PENDING)
    created_task_id = Column(GUID(), ForeignKey("tasks.id"), nullable=True)
    reviewed_by = Column(GUID(), ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
    created_by = Column(GUID(), ForeignKey("users.id"), nullable=True)