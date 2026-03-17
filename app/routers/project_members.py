"""
ניהול חברי צוות בפרויקט — תפקידים והרשאות ברמת הפרויקט.
"""
import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/projects/{project_id}/members", tags=["project-members"])

ROLES = {"manager", "member", "viewer"}


@router.get("/", response_model=list[schemas.ProjectMemberRead])
def list_members(tenant_id: UUID, project_id: UUID, db: Session = Depends(get_db)):
    rows = (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.tenant_id == tenant_id,
            models.ProjectMember.project_id == project_id,
            models.ProjectMember.deleted_at.is_(None),
        )
        .all()
    )
    user_ids = [str(r.user_id) for r in rows]
    users = {str(u.id): u for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all()} if user_ids else {}
    result = []
    for r in rows:
        u = users.get(str(r.user_id))
        item = schemas.ProjectMemberRead.model_validate(r)
        item.user_name = u.name if u else None
        item.user_email = u.email if u else None
        result.append(item)
    return result


@router.post("/", response_model=schemas.ProjectMemberRead, status_code=status.HTTP_201_CREATED)
def add_member(
    tenant_id: UUID,
    project_id: UUID,
    data: schemas.ProjectMemberCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    if data.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"תפקיד לא חוקי. אפשרויות: {', '.join(ROLES)}")

    existing = (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.project_id == project_id,
            models.ProjectMember.user_id == data.user_id,
            models.ProjectMember.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="משתמש זה כבר שייך לפרויקט")

    now = datetime.now(timezone.utc)
    member = models.ProjectMember(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        project_id=project_id,
        user_id=data.user_id,
        role=data.role,
        created_at=now,
        updated_at=now,
        created_by=user_id,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    u = db.query(models.User).filter(models.User.id == data.user_id).first()
    item = schemas.ProjectMemberRead.model_validate(member)
    item.user_name = u.name if u else None
    item.user_email = u.email if u else None
    return item


@router.put("/{member_user_id}", response_model=schemas.ProjectMemberRead)
def update_member(
    tenant_id: UUID,
    project_id: UUID,
    member_user_id: UUID,
    data: schemas.ProjectMemberUpdate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    if data.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"תפקיד לא חוקי. אפשרויות: {', '.join(ROLES)}")
    m = (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.project_id == project_id,
            models.ProjectMember.user_id == member_user_id,
            models.ProjectMember.deleted_at.is_(None),
        )
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="חבר לא נמצא")
    m.role = data.role
    m.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(m)

    u = db.query(models.User).filter(models.User.id == member_user_id).first()
    item = schemas.ProjectMemberRead.model_validate(m)
    item.user_name = u.name if u else None
    item.user_email = u.email if u else None
    return item


@router.delete("/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    tenant_id: UUID,
    project_id: UUID,
    member_user_id: UUID,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    m = (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.project_id == project_id,
            models.ProjectMember.user_id == member_user_id,
            models.ProjectMember.deleted_at.is_(None),
        )
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="חבר לא נמצא")
    m.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return None
