from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/stages", tags=["stages"])


def _get_stage_or_404(db: Session, tenant_id: UUID, stage_id: UUID) -> models.Stage:
    stage = (
        db.query(models.Stage)
        .filter(
            models.Stage.id == stage_id,
            models.Stage.tenant_id == tenant_id,
            models.Stage.deleted_at.is_(None),
        )
        .first()
    )
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="שלב לא נמצא")
    return stage


@router.post("/", response_model=schemas.StageRead, status_code=status.HTTP_201_CREATED)
def create_stage(
    tenant_id: UUID,
    stage_in: schemas.StageCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    stage = crud.create_entity(
        db,
        models.Stage,
        stage_in.model_dump(),
        tenant_id=str(tenant_id),
        created_by=user_id,
    )
    db.commit()
    db.refresh(stage)
    return stage


@router.get("/{stage_id}", response_model=schemas.StageRead)
def read_stage(tenant_id: UUID, stage_id: UUID, db: Session = Depends(get_db)):
    return _get_stage_or_404(db, tenant_id, stage_id)


@router.get("/", response_model=list[schemas.StageRead])
def list_stages(tenant_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(models.Stage)
        .filter(models.Stage.tenant_id == tenant_id, models.Stage.deleted_at.is_(None))
        .all()
    )


@router.put("/{stage_id}", response_model=schemas.StageRead)
def update_stage(
    tenant_id: UUID,
    stage_id: UUID,
    stage_in: schemas.StageUpdate,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    stage = _get_stage_or_404(db, tenant_id, stage_id)
    stage = crud.update_entity(db, stage, stage_in.model_dump(), changed_by=changed_by)
    db.commit()
    db.refresh(stage)
    return stage


@router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stage(
    tenant_id: UUID,
    stage_id: UUID,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    stage = _get_stage_or_404(db, tenant_id, stage_id)
    # Also soft-delete all tasks in this stage
    tasks = db.query(models.Task).filter(
        models.Task.stage_id == stage_id,
        models.Task.deleted_at.is_(None),
    ).all()
    for task in tasks:
        crud.soft_delete_entity(db, task, changed_by=changed_by)
    crud.soft_delete_entity(db, stage, changed_by=changed_by)
    db.commit()
    return None
