from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from . import models


def check_no_circular_dependency(db: Session, task_id: UUID, blocked_by_id: UUID) -> None:
    """
    מוודא שהגדרת blocked_by לא יוצרת תלות מעגלית.
    למשל: אם A חסום על ידי B, לא ניתן לחסום את B על ידי A.
    """
    if str(task_id) == str(blocked_by_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="משימה לא יכולה לחסום את עצמה",
        )
    # עוקבים בשרשרת אחרי blocked_by עד שמגיעים לסוף או מוצאים מעגל
    visited = set()
    current_id = str(blocked_by_id)
    while current_id:
        if current_id in visited:
            break
        if current_id == str(task_id):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="תלות מעגלית: הגדרה זו יוצרת מעגל בין משימות",
            )
        visited.add(current_id)
        blocker = (
            db.query(models.Task)
            .filter(models.Task.id == current_id, models.Task.deleted_at.is_(None))
            .first()
        )
        current_id = str(blocker.blocked_by) if blocker and blocker.blocked_by else None


def _log_audit(
    db: Session,
    tenant_id: str,
    table_name: str,
    record_id: str,
    field_name: str,
    old_value: Any,
    new_value: Any,
    changed_by: Optional[str],
    action: models.AuditAction,
) -> None:
    db.add(
        models.AuditLog(
            tenant_id=tenant_id,
            table_name=table_name,
            record_id=record_id,
            field_name=field_name,
            old_value=str(old_value) if old_value is not None else None,
            new_value=str(new_value) if new_value is not None else None,
            changed_by=changed_by,
            changed_at=datetime.now(timezone.utc),
            action=action,
        )
    )
    db.flush()


def create_entity(
    db: Session,
    model: type[models.Base],
    data: Dict[str, Any],
    tenant_id: Optional[str] = None,
    created_by: Optional[str] = None,
) -> models.Base:
    if tenant_id is not None:
        data["tenant_id"] = tenant_id

    # Only pass created_by when the model supports it (Tenant does not)
    if "created_by" in model.__table__.c:
        obj = model(**data, created_by=created_by)
    else:
        obj = model(**data)

    db.add(obj)
    db.flush()
    _log_audit(
        db,
        tenant_id=tenant_id or str(obj.id),
        table_name=obj.__tablename__,
        record_id=str(obj.id),
        field_name="__create__",
        old_value=None,
        new_value=None,
        changed_by=created_by,
        action=models.AuditAction.CREATE,
    )
    return obj


def _resolve_tenant_id(instance: models.Base) -> Optional[str]:
    """Return the tenant_id to use for audit logging, or None to skip logging.

    - Entities with a direct tenant_id column → use it.
    - Tenant itself → use its own id (it IS the tenant).
    - Entities without tenant_id (e.g. TemplateStage/Task) → None (skip log).
    """
    tenant_id = getattr(instance, "tenant_id", None)
    if tenant_id:
        return str(tenant_id)
    if instance.__tablename__ == "tenants":
        return str(getattr(instance, "id"))
    return None


def update_entity(
    db: Session,
    instance: models.Base,
    updates: Dict[str, Any],
    changed_by: Optional[str] = None,
) -> models.Base:
    table_name = instance.__tablename__
    tenant_id = _resolve_tenant_id(instance)
    for key, value in updates.items():
        if value is None or not hasattr(instance, key):
            continue
        old_value = getattr(instance, key)
        if old_value != value:
            setattr(instance, key, value)
            if tenant_id:
                _log_audit(
                    db,
                    tenant_id=tenant_id,
                    table_name=table_name,
                    record_id=str(getattr(instance, "id")),
                    field_name=key,
                    old_value=old_value,
                    new_value=value,
                    changed_by=changed_by,
                    action=models.AuditAction.UPDATE,
                )
    db.flush()
    return instance


def soft_delete_entity(
    db: Session,
    instance: models.Base,
    changed_by: Optional[str] = None,
) -> models.Base:
    if getattr(instance, "deleted_at", None) is None:
        now = datetime.now(timezone.utc)
        instance.deleted_at = now
        tenant_id = _resolve_tenant_id(instance)
        if tenant_id:
            _log_audit(
                db,
                tenant_id=tenant_id,
                table_name=instance.__tablename__,
                record_id=str(getattr(instance, "id")),
                field_name="deleted_at",
                old_value=None,
                new_value=str(now),
                changed_by=changed_by,
                action=models.AuditAction.DELETE,
            )
        db.flush()
    return instance
