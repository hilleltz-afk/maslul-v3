from uuid import UUID, uuid4
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db
from ..email import notify_user_approved, notify_user_invited, notify_user_rejected

router = APIRouter(prefix="/tenants/{tenant_id}/users", tags=["users"])


def _get_user_or_404(db: Session, tenant_id: UUID, user_id: UUID) -> models.User:
    user = (
        db.query(models.User)
        .filter(
            models.User.id == user_id,
            models.User.tenant_id == tenant_id,
            models.User.deleted_at.is_(None),
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="משתמש לא נמצא")
    return user


@router.post("/", response_model=schemas.UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    tenant_id: UUID,
    user_in: schemas.UserCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    user = crud.create_entity(db, models.User, user_in.model_dump(), tenant_id=str(tenant_id), created_by=user_id)
    db.commit()
    db.refresh(user)
    return user


@router.get("/", response_model=list[schemas.UserRead])
def list_users(tenant_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(models.User)
        .filter(models.User.tenant_id == tenant_id, models.User.deleted_at.is_(None))
        .all()
    )


@router.get("/{user_id}", response_model=schemas.UserRead)
def read_user(tenant_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    return _get_user_or_404(db, tenant_id, user_id)


@router.put("/{user_id}", response_model=schemas.UserRead)
def update_user(
    tenant_id: UUID,
    user_id: UUID,
    user_in: schemas.UserUpdate,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    user = _get_user_or_404(db, tenant_id, user_id)
    user = crud.update_entity(db, user, user_in.model_dump(), changed_by=changed_by)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    tenant_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    user = _get_user_or_404(db, tenant_id, user_id)
    crud.soft_delete_entity(db, user, changed_by=changed_by)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Admin endpoints — ניהול משתמשים
# ---------------------------------------------------------------------------

@router.post("/{user_id}/approve", response_model=schemas.UserRead, summary="אישור משתמש ממתין")
def approve_user(
    tenant_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    user = _get_user_or_404(db, tenant_id, user_id)
    if user.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="המשתמש אינו ממתין לאישור")
    user.status = "active"
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    try:
        notify_user_approved(user.email, user.name)
    except Exception:
        pass
    return user


@router.post("/{user_id}/reject", response_model=schemas.UserRead, summary="דחיית משתמש ממתין")
def reject_user(
    tenant_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    user = _get_user_or_404(db, tenant_id, user_id)
    user.status = "rejected"
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    try:
        notify_user_rejected(user.email, user.name)
    except Exception:
        pass
    return user


@router.patch("/{user_id}/role", response_model=schemas.UserRead, summary="שינוי תפקיד משתמש")
def change_role(
    tenant_id: UUID,
    user_id: UUID,
    role: str,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    VALID_ROLES = ("member", "admin", "super_admin")
    if role not in VALID_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"תפקיד לא תקין — אחד מ: {', '.join(VALID_ROLES)}")

    # Get the actor's role
    actor = db.query(models.User).filter(models.User.id == changed_by, models.User.deleted_at.is_(None)).first() if changed_by else None
    actor_role = actor.role if actor else "member"

    user = _get_user_or_404(db, tenant_id, user_id)

    # Only super_admin can touch other super_admins or grant super_admin
    if user.role == "super_admin" and actor_role != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="רק super_admin יכול לשנות תפקיד של super_admin")
    if role == "super_admin" and actor_role != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="רק super_admin יכול להעניק תפקיד super_admin")

    user.role = role
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


@router.post("/invite", response_model=schemas.UserRead, status_code=status.HTTP_201_CREATED, summary="הזמנת משתמש לפי אימייל")
def invite_user(
    tenant_id: UUID,
    invite_in: schemas.UserInvite,
    db: Session = Depends(get_db),
    inviter_id: str | None = Depends(get_current_user_id),
):
    # בדוק אם כבר קיים
    existing = (
        db.query(models.User)
        .filter(models.User.email == invite_in.email, models.User.deleted_at.is_(None))
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="משתמש עם אימייל זה כבר קיים")

    user = models.User(
        id=uuid4(),
        tenant_id=str(tenant_id),
        email=invite_in.email,
        name=invite_in.name,
        role=invite_in.role or "member",
        status="active",  # הזמנה ישירה מאדמין — מאושרת מיד
        created_by=inviter_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # שלח אימייל הזמנה
    try:
        inviter = db.query(models.User).filter(models.User.id == inviter_id, models.User.deleted_at.is_(None)).first() if inviter_id else None
        notify_user_invited(user.email, user.name, invited_by=inviter.name if inviter else "")
    except Exception:
        pass

    return user
