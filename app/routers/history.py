"""
Audit log — היסטוריית שינויים.
"""
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..deps import get_db

router = APIRouter(prefix="/tenants/{tenant_id}/history", tags=["history"])

TABLE_HE = {
    "projects": "פרויקטים",
    "tasks": "משימות",
    "stages": "שלבים",
    "contacts": "אנשי קשר",
    "documents": "מסמכים",
    "budget_entries": "תקציב",
    "quotes": "הצעות מחיר",
    "payment_milestones": "אבני דרך",
    "users": "משתמשים",
    "email_pipeline": "Pipeline AI",
    "task_comments": "הערות",
}

ACTION_HE = {
    "CREATE": "יצירה",
    "UPDATE": "עדכון",
    "DELETE": "מחיקה",
}

FIELD_HE = {
    "title": "כותרת",
    "status": "סטטוס",
    "priority": "עדיפות",
    "description": "תיאור",
    "assignee_id": "אחראי",
    "start_date": "תאריך התחלה",
    "end_date": "תאריך סיום",
    "name": "שם",
    "amount": "סכום",
    "category": "קטגוריה",
    "vendor": "ספק",
    "deleted_at": "נמחק",
    "__create__": "נוצר",
    "role": "תפקיד",
    "handling_authority": "גורם מטפל",
    "color": "צבע",
    "is_paid": "שולם",
    "budget_total": "תקציב כולל",
    "address": "כתובת",
    "content": "תוכן",
}


@router.get("/")
def list_history(
    tenant_id: UUID,
    table_name: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.AuditLog)
        .filter(models.AuditLog.tenant_id == tenant_id)
    )
    if table_name:
        q = q.filter(models.AuditLog.table_name == table_name)

    logs = q.order_by(models.AuditLog.changed_at.desc()).limit(limit).all()

    # שלוף שמות משתמשים
    user_ids = {str(l.changed_by) for l in logs if l.changed_by}
    users = {}
    if user_ids:
        user_rows = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
        users = {str(u.id): u.name for u in user_rows}

    return [
        {
            "id": str(l.id),
            "table_name": l.table_name,
            "table_he": TABLE_HE.get(l.table_name, l.table_name),
            "record_id": str(l.record_id),
            "field_name": l.field_name,
            "field_he": FIELD_HE.get(l.field_name, l.field_name),
            "old_value": l.old_value,
            "new_value": l.new_value,
            "changed_by": str(l.changed_by) if l.changed_by else None,
            "changed_by_name": users.get(str(l.changed_by), "—") if l.changed_by else "—",
            "changed_at": l.changed_at.isoformat() if l.changed_at else None,
            "action": l.action.value if l.action else None,
            "action_he": ACTION_HE.get(l.action.value if l.action else "", "—"),
        }
        for l in logs
    ]
