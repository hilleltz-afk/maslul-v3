from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/projects", tags=["projects"])


def _get_project_or_404(db: Session, tenant_id: UUID, project_id: UUID) -> models.Project:
    project = (
        db.query(models.Project)
        .filter(
            models.Project.id == project_id,
            models.Project.tenant_id == tenant_id,
            models.Project.deleted_at.is_(None),
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="פרויקט לא נמצא")
    return project


@router.post("/", response_model=schemas.ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(
    tenant_id: UUID,
    project_in: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    project = crud.create_entity(
        db, models.Project, project_in.model_dump(), tenant_id=str(tenant_id), created_by=user_id
    )
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=schemas.ProjectRead)
def read_project(tenant_id: UUID, project_id: UUID, db: Session = Depends(get_db)):
    return _get_project_or_404(db, tenant_id, project_id)


@router.get("/", response_model=list[schemas.ProjectRead])
def list_projects(tenant_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(models.Project)
        .filter(models.Project.tenant_id == tenant_id, models.Project.deleted_at.is_(None))
        .all()
    )


@router.put("/{project_id}", response_model=schemas.ProjectRead)
def update_project(
    tenant_id: UUID,
    project_id: UUID,
    project_in: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    project = _get_project_or_404(db, tenant_id, project_id)
    project = crud.update_entity(db, project, project_in.model_dump(), changed_by=changed_by)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    tenant_id: UUID,
    project_id: UUID,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    project = _get_project_or_404(db, tenant_id, project_id)
    crud.soft_delete_entity(db, project, changed_by=changed_by)
    db.commit()
    return None
