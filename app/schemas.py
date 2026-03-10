from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, constr


class BaseRead(BaseModel):
    id: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None
    created_by: Optional[UUID] = None

    model_config = {
        "from_attributes": True,
    }


class TenantCreate(BaseModel):
    name: constr(min_length=1)


class TenantUpdate(BaseModel):
    name: Optional[constr(min_length=1)] = None


class TenantRead(BaseRead):
    name: str


class UserCreate(BaseModel):
    email: constr(min_length=1)
    name: constr(min_length=1)


class UserUpdate(BaseModel):
    email: Optional[constr(min_length=1)] = None
    name: Optional[constr(min_length=1)] = None


class UserRead(BaseRead):
    tenant_id: UUID
    email: str
    name: str


class ProjectCreate(BaseModel):
    gush: constr(min_length=1)
    helka: constr(min_length=1)
    name: constr(min_length=1)


class ProjectUpdate(BaseModel):
    gush: Optional[constr(min_length=1)] = None
    helka: Optional[constr(min_length=1)] = None
    name: Optional[constr(min_length=1)] = None


class ProjectRead(BaseRead):
    tenant_id: UUID
    gush: str
    helka: str
    name: str


class ProjectAliasCreate(BaseModel):
    project_id: UUID
    alias: constr(min_length=1)


class ProjectAliasUpdate(BaseModel):
    alias: Optional[constr(min_length=1)] = None


class ProjectAliasRead(BaseRead):
    tenant_id: UUID
    project_id: UUID
    alias: str


class StageCreate(BaseModel):
    project_id: UUID
    name: constr(min_length=1)
    handling_authority: constr(min_length=1)


class StageUpdate(BaseModel):
    name: Optional[constr(min_length=1)] = None
    handling_authority: Optional[constr(min_length=1)] = None


class StageRead(BaseRead):
    tenant_id: UUID
    project_id: UUID
    name: str
    handling_authority: str


class TaskCreate(BaseModel):
    project_id: UUID
    stage_id: UUID
    assignee_id: Optional[UUID] = None
    title: constr(min_length=1)
    description: Optional[str] = None
    priority: constr(min_length=1)
    status: constr(min_length=1)
    blocked_by: Optional[UUID] = None


class TaskUpdate(BaseModel):
    stage_id: Optional[UUID] = None
    assignee_id: Optional[UUID] = None
    title: Optional[constr(min_length=1)] = None
    description: Optional[str] = None
    priority: Optional[constr(min_length=1)] = None
    status: Optional[constr(min_length=1)] = None
    rejection_count: Optional[int] = None
    blocked_by: Optional[UUID] = None


class TaskRead(BaseRead):
    tenant_id: UUID
    project_id: UUID
    stage_id: UUID
    assignee_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    priority: str
    status: str
    rejection_count: int
    blocked_by: Optional[UUID] = None


class ContactCreate(BaseModel):
    name: constr(min_length=1)
    phone: Optional[str] = None
    email: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[constr(min_length=1)] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class ContactRead(BaseRead):
    tenant_id: UUID
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None


class DocumentCreate(BaseModel):
    project_id: Optional[UUID] = None
    name: constr(min_length=1)
    path: constr(min_length=1)
    expiry_date: Optional[datetime] = None


class DocumentUpdate(BaseModel):
    project_id: Optional[UUID] = None
    name: Optional[constr(min_length=1)] = None
    path: Optional[constr(min_length=1)] = None
    expiry_date: Optional[datetime] = None


class DocumentRead(BaseRead):
    tenant_id: UUID
    project_id: Optional[UUID] = None
    name: str
    path: str
    expiry_date: Optional[datetime] = None


class DocumentAlert(BaseModel):
    """מסמך שתוקפו פג או עומד לפוג."""
    id: UUID
    tenant_id: UUID
    project_id: Optional[UUID] = None
    name: str
    path: str
    expiry_date: datetime
    days_until_expiry: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Phase 4 — Email Pipeline schemas
# ---------------------------------------------------------------------------

class EmailIngestRequest(BaseModel):
    """בקשה לעיבוד מייל חדש דרך הצינור."""
    sender: constr(min_length=1)
    subject: constr(min_length=1)
    body: str
    gmail_message_id: Optional[str] = None


class EmailPipelineItemRead(BaseModel):
    """פריט מהצינור — כולל תוצאות Triage ו-Analysis."""
    id: UUID
    tenant_id: UUID
    sender: str
    subject: str
    body_preview: Optional[str] = None
    triage_is_relevant: Optional[int] = None
    triage_confidence: Optional[float] = None
    triage_reason: Optional[str] = None
    suggested_project_id: Optional[UUID] = None
    project_match_confidence: Optional[float] = None
    suggested_task_name: Optional[str] = None
    suggested_priority: Optional[str] = None
    suggested_assignee: Optional[str] = None
    suggested_due_date: Optional[datetime] = None
    has_attachments: Optional[int] = None
    budget_mentioned: Optional[float] = None
    analysis_notes: Optional[str] = None
    status: str
    created_task_id: Optional[UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class EmailApproveRequest(BaseModel):
    """אישור פריט מהצינור — עם אפשרות לעריכת פרטי המשימה."""
    project_id: UUID
    stage_id: UUID
    task_title: constr(min_length=1)
    priority: constr(min_length=1)
    assignee_id: Optional[UUID] = None
