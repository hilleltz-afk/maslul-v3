from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/tasks", tags=["tasks"])


def _get_task_or_404(db: Session, tenant_id: UUID, task_id: UUID) -> models.Task:
    task = (
        db.query(models.Task)
        .filter(
            models.Task.id == task_id,
            models.Task.tenant_id == tenant_id,
            models.Task.deleted_at.is_(None),
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="משימה לא נמצאה")
    return task


@router.post("/", response_model=schemas.TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    tenant_id: UUID,
    task_in: schemas.TaskCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    if task_in.blocked_by:
        # וידוא שהמשימה החוסמת קיימת ושייכת לאותו tenant
        _get_task_or_404(db, tenant_id, task_in.blocked_by)
    task = crud.create_entity(
        db,
        models.Task,
        task_in.model_dump(),
        tenant_id=str(tenant_id),
        created_by=user_id,
    )
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=schemas.TaskRead)
def read_task(tenant_id: UUID, task_id: UUID, db: Session = Depends(get_db)):
    return _get_task_or_404(db, tenant_id, task_id)


@router.get("/", response_model=list[schemas.TaskRead])
def list_tasks(
    tenant_id: UUID,
    project_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(models.Task).filter(models.Task.tenant_id == tenant_id, models.Task.deleted_at.is_(None))
    if project_id:
        q = q.filter(models.Task.project_id == project_id)
    return q.all()


@router.put("/{task_id}", response_model=schemas.TaskRead)
def update_task(
    tenant_id: UUID,
    task_id: UUID,
    task_in: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    task = _get_task_or_404(db, tenant_id, task_id)
    if task_in.blocked_by:
        _get_task_or_404(db, tenant_id, task_in.blocked_by)
        crud.check_no_circular_dependency(db, task_id, task_in.blocked_by)
    task = crud.update_entity(db, task, task_in.model_dump(), changed_by=changed_by)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    tenant_id: UUID,
    task_id: UUID,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    task = _get_task_or_404(db, tenant_id, task_id)
    crud.soft_delete_entity(db, task, changed_by=changed_by)
    db.commit()
    return None
