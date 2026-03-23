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
    role: Optional[str] = "member"
    status: Optional[str] = "active"


class UserUpdate(BaseModel):
    email: Optional[constr(min_length=1)] = None
    name: Optional[constr(min_length=1)] = None
    role: Optional[str] = None
    status: Optional[str] = None


class UserRead(BaseRead):
    tenant_id: UUID
    email: str
    name: str
    role: str = "member"
    status: str = "active"


class UserInvite(BaseModel):
    email: constr(min_length=1)
    name: constr(min_length=1)
    role: Optional[str] = "member"


class ProjectCreate(BaseModel):
    gush: constr(min_length=1)
    helka: constr(min_length=1)
    name: constr(min_length=1)
    address: Optional[str] = None
    budget_total: Optional[float] = None


class ProjectUpdate(BaseModel):
    gush: Optional[constr(min_length=1)] = None
    helka: Optional[constr(min_length=1)] = None
    name: Optional[constr(min_length=1)] = None
    address: Optional[str] = None
    budget_total: Optional[float] = None


class ProjectRead(BaseRead):
    tenant_id: UUID
    gush: str
    helka: str
    name: str
    address: Optional[str] = None
    budget_total: Optional[float] = None


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
    color: Optional[str] = "#011e41"


class StageUpdate(BaseModel):
    name: Optional[constr(min_length=1)] = None
    handling_authority: Optional[constr(min_length=1)] = None
    color: Optional[str] = None


class StageRead(BaseRead):
    tenant_id: UUID
    project_id: UUID
    name: str
    handling_authority: str
    color: Optional[str] = "#011e41"


class TaskCreate(BaseModel):
    project_id: UUID
    stage_id: UUID
    assignee_id: Optional[UUID] = None
    contact_id: Optional[UUID] = None
    title: constr(min_length=1)
    description: Optional[str] = None
    priority: constr(min_length=1) = "medium"
    status: constr(min_length=1) = "in_progress"
    blocked_by: Optional[UUID] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    custom_fields: Optional[str] = None


class TaskUpdate(BaseModel):
    stage_id: Optional[UUID] = None
    assignee_id: Optional[UUID] = None
    contact_id: Optional[UUID] = None
    title: Optional[constr(min_length=1)] = None
    description: Optional[str] = None
    priority: Optional[constr(min_length=1)] = None
    status: Optional[constr(min_length=1)] = None
    rejection_count: Optional[int] = None
    blocked_by: Optional[UUID] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    custom_fields: Optional[str] = None


class TaskRead(BaseRead):
    tenant_id: UUID
    project_id: UUID
    stage_id: UUID
    assignee_id: Optional[UUID] = None
    contact_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    priority: str
    status: str
    rejection_count: int
    blocked_by: Optional[UUID] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    custom_fields: Optional[str] = None


class ContactCreate(BaseModel):
    name: constr(min_length=1)
    phone: Optional[str] = None
    email: Optional[str] = None
    profession: Optional[str] = None
    office_name: Optional[str] = None
    mobile_phone: Optional[str] = None
    notes: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[constr(min_length=1)] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    profession: Optional[str] = None
    office_name: Optional[str] = None
    mobile_phone: Optional[str] = None
    notes: Optional[str] = None


class ContactRead(BaseRead):
    tenant_id: UUID
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    profession: Optional[str] = None
    office_name: Optional[str] = None
    mobile_phone: Optional[str] = None
    notes: Optional[str] = None


class DocumentCreate(BaseModel):
    project_id: Optional[UUID] = None
    task_id: Optional[UUID] = None
    stage_id: Optional[UUID] = None
    name: constr(min_length=1)
    path: constr(min_length=1)
    expiry_date: Optional[datetime] = None


class DocumentUpdate(BaseModel):
    project_id: Optional[UUID] = None
    task_id: Optional[UUID] = None
    stage_id: Optional[UUID] = None
    name: Optional[constr(min_length=1)] = None
    path: Optional[constr(min_length=1)] = None
    expiry_date: Optional[datetime] = None


class DocumentRead(BaseRead):
    tenant_id: UUID
    project_id: Optional[UUID] = None
    task_id: Optional[UUID] = None
    stage_id: Optional[UUID] = None
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
    due_date: Optional[str] = None  # YYYY-MM-DD


# ---------------------------------------------------------------------------
# Budget schemas
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Quote schemas
# ---------------------------------------------------------------------------

class PaymentMilestoneCreate(BaseModel):
    description: constr(min_length=1)
    amount: float
    due_date: Optional[datetime] = None
    is_paid: int = 0


class PaymentMilestoneRead(BaseModel):
    id: UUID
    tenant_id: UUID
    quote_id: UUID
    project_id: Optional[UUID] = None
    description: str
    amount: float
    due_date: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    is_paid: int = 0
    created_at: datetime
    created_by: Optional[UUID] = None

    model_config = {"from_attributes": True}


class PaymentMilestoneUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[datetime] = None
    is_paid: Optional[int] = None
    paid_at: Optional[datetime] = None


class QuoteCreate(BaseModel):
    project_id: Optional[UUID] = None
    vendor: Optional[str] = None
    title: constr(min_length=1)
    total_amount: Optional[float] = None
    notes: Optional[str] = None


class QuoteUpdate(BaseModel):
    project_id: Optional[UUID] = None
    vendor: Optional[str] = None
    title: Optional[str] = None
    total_amount: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class QuoteRead(BaseRead):
    tenant_id: UUID
    project_id: Optional[UUID] = None
    vendor: Optional[str] = None
    title: str
    total_amount: Optional[float] = None
    pdf_filename: Optional[str] = None
    ai_extracted_data: Optional[str] = None
    status: str
    notes: Optional[str] = None
    milestones: list[PaymentMilestoneRead] = []


class BudgetEntryCreate(BaseModel):
    category: constr(min_length=1)
    description: constr(min_length=1)
    vendor: Optional[str] = None
    amount: float
    entry_date: Optional[datetime] = None
    is_planned: int = 0
    notes: Optional[str] = None


class BudgetEntryUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    vendor: Optional[str] = None
    amount: Optional[float] = None
    entry_date: Optional[datetime] = None
    is_planned: Optional[int] = None
    notes: Optional[str] = None


class BudgetEntryRead(BaseRead):
    tenant_id: UUID
    project_id: UUID
    category: str
    description: str
    vendor: Optional[str] = None
    amount: float
    entry_date: Optional[datetime] = None
    is_planned: int = 0
    notes: Optional[str] = None


class BudgetSummaryRow(BaseModel):
    category: str
    planned: float
    actual: float
    diff: float


class ProjectMemberCreate(BaseModel):
    user_id: UUID
    role: str = "member"  # manager / member / viewer


class ProjectMemberUpdate(BaseModel):
    role: str


class ProjectMemberRead(BaseModel):
    id: UUID
    project_id: UUID
    user_id: UUID
    role: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Task comment schemas
# ---------------------------------------------------------------------------

class TaskCommentCreate(BaseModel):
    content: constr(min_length=1)


class TaskCommentRead(BaseModel):
    id: UUID
    task_id: UUID
    content: str
    created_at: datetime
    created_by: Optional[UUID] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Project Template schemas
# ---------------------------------------------------------------------------

class TemplateTaskCreate(BaseModel):
    title: constr(min_length=1)
    description: Optional[str] = None
    priority: str = "medium"
    order: int = 0


class TemplateTaskRead(BaseModel):
    id: UUID
    template_stage_id: UUID
    title: str
    description: Optional[str] = None
    priority: str
    order: int

    model_config = {"from_attributes": True}


class TemplateTaskUpdate(BaseModel):
    title: Optional[constr(min_length=1)] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    order: Optional[int] = None


class TemplateStageCreate(BaseModel):
    name: constr(min_length=1)
    handling_authority: str = ""
    color: Optional[str] = "#011e41"
    order: int = 0
    estimated_days: Optional[int] = None
    tasks: list[TemplateTaskCreate] = []


class TemplateStageRead(BaseModel):
    id: UUID
    template_id: UUID
    name: str
    handling_authority: str
    color: Optional[str] = "#011e41"
    order: int
    estimated_days: Optional[int] = None
    tasks: list[TemplateTaskRead] = []

    model_config = {"from_attributes": True}


class TemplateStageUpdate(BaseModel):
    name: Optional[constr(min_length=1)] = None
    handling_authority: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None
    estimated_days: Optional[int] = None


class ProjectTemplateCreate(BaseModel):
    name: constr(min_length=1)
    description: Optional[str] = None
    stages: list[TemplateStageCreate] = []


class ProjectTemplateRead(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    description: Optional[str] = None
    stages: list[TemplateStageRead] = []
    created_at: datetime
    created_by: Optional[UUID] = None

    model_config = {"from_attributes": True}


class ProjectTemplateUpdate(BaseModel):
    name: Optional[constr(min_length=1)] = None
    description: Optional[str] = None


class ApplyTemplateRequest(BaseModel):
    """בקשה להחיל טמפלייט על פרויקט — עם רשימת משימות שנבחרו."""
    project_id: UUID
    # מפתח: template_task_id — ערך: True אם לכלול
    selected_task_ids: list[UUID]
    # תאריך התחלה לחישוב due_date לפי estimated_days (אופציונלי)
    start_date: Optional[str] = None  # YYYY-MM-DD
