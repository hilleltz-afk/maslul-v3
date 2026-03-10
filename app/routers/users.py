from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

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


@router.get("/{user_id}", response_model=schemas.UserRead)
def read_user(tenant_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    return _get_user_or_404(db, tenant_id, user_id)


@router.get("/", response_model=list[schemas.UserRead])
def list_users(tenant_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(models.User)
        .filter(models.User.tenant_id == tenant_id, models.User.deleted_at.is_(None))
        .all()
    )


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
