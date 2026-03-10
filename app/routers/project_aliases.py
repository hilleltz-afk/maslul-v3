from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/project-aliases", tags=["project_aliases"])


def _get_alias_or_404(db: Session, tenant_id: UUID, alias_id: UUID) -> models.ProjectAlias:
    alias = (
        db.query(models.ProjectAlias)
        .filter(
            models.ProjectAlias.id == alias_id,
            models.ProjectAlias.tenant_id == tenant_id,
            models.ProjectAlias.deleted_at.is_(None),
        )
        .first()
    )
    if not alias:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="כינוי פרויקט לא נמצא")
    return alias


@router.post("/", response_model=schemas.ProjectAliasRead, status_code=status.HTTP_201_CREATED)
def create_project_alias(
    tenant_id: UUID,
    alias_in: schemas.ProjectAliasCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    alias = crud.create_entity(
        db,
        models.ProjectAlias,
        alias_in.model_dump(),
        tenant_id=str(tenant_id),
        created_by=user_id,
    )
    db.commit()
    db.refresh(alias)
    return alias


@router.get("/{alias_id}", response_model=schemas.ProjectAliasRead)
def read_project_alias(tenant_id: UUID, alias_id: UUID, db: Session = Depends(get_db)):
    return _get_alias_or_404(db, tenant_id, alias_id)


@router.get("/", response_model=list[schemas.ProjectAliasRead])
def list_project_aliases(tenant_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(models.ProjectAlias)
        .filter(models.ProjectAlias.tenant_id == tenant_id, models.ProjectAlias.deleted_at.is_(None))
        .all()
    )


@router.put("/{alias_id}", response_model=schemas.ProjectAliasRead)
def update_project_alias(
    tenant_id: UUID,
    alias_id: UUID,
    alias_in: schemas.ProjectAliasUpdate,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    alias = _get_alias_or_404(db, tenant_id, alias_id)
    alias = crud.update_entity(db, alias, alias_in.model_dump(), changed_by=changed_by)
    db.commit()
    db.refresh(alias)
    return alias


@router.delete("/{alias_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_alias(
    tenant_id: UUID,
    alias_id: UUID,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    alias = _get_alias_or_404(db, tenant_id, alias_id)
    crud.soft_delete_entity(db, alias, changed_by=changed_by)
    db.commit()
    return None
