from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.post("/", response_model=schemas.TenantRead, status_code=status.HTTP_201_CREATED)
def create_tenant(
    tenant_in: schemas.TenantCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    tenant = crud.create_entity(db, models.Tenant, tenant_in.model_dump(), created_by=user_id)
    db.commit()
    db.refresh(tenant)
    return tenant


def _get_tenant_or_404(db: Session, tenant_id: UUID) -> models.Tenant:
    tenant = (
        db.query(models.Tenant)
        .filter(models.Tenant.id == tenant_id, models.Tenant.deleted_at.is_(None))
        .first()
    )
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ארגון לא נמצא")
    return tenant


@router.get("/{tenant_id}", response_model=schemas.TenantRead)
def read_tenant(tenant_id: UUID, db: Session = Depends(get_db)):
    return _get_tenant_or_404(db, tenant_id)


@router.get("/", response_model=list[schemas.TenantRead])
def list_tenants(db: Session = Depends(get_db)):
    return db.query(models.Tenant).filter(models.Tenant.deleted_at.is_(None)).all()


@router.put("/{tenant_id}", response_model=schemas.TenantRead)
def update_tenant(
    tenant_id: UUID,
    tenant_in: schemas.TenantUpdate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    tenant = _get_tenant_or_404(db, tenant_id)
    tenant = crud.update_entity(db, tenant, tenant_in.model_dump(), changed_by=user_id)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(
    tenant_id: UUID,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    tenant = _get_tenant_or_404(db, tenant_id)
    crud.soft_delete_entity(db, tenant, changed_by=user_id)
    db.commit()
    return None
