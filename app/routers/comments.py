from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/tasks/{task_id}/comments", tags=["comments"])


@router.get("/", response_model=List[schemas.TaskCommentRead])
def list_comments(tenant_id: UUID, task_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(models.TaskComment)
        .filter(
            models.TaskComment.task_id == task_id,
            models.TaskComment.tenant_id == tenant_id,
            models.TaskComment.deleted_at.is_(None),
        )
        .order_by(models.TaskComment.created_at.asc())
        .all()
    )


@router.post("/", response_model=schemas.TaskCommentRead, status_code=status.HTTP_201_CREATED)
def add_comment(
    tenant_id: UUID,
    task_id: UUID,
    comment_in: schemas.TaskCommentCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    comment = crud.create_entity(
        db,
        models.TaskComment,
        comment_in.model_dump(),
        tenant_id=str(tenant_id),
        task_id=str(task_id),
        created_by=user_id,
    )
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    tenant_id: UUID,
    task_id: UUID,
    comment_id: UUID,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    comment = (
        db.query(models.TaskComment)
        .filter(
            models.TaskComment.id == comment_id,
            models.TaskComment.task_id == task_id,
            models.TaskComment.deleted_at.is_(None),
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הערה לא נמצאה")
    crud.soft_delete_entity(db, comment, changed_by=changed_by)
    db.commit()
    return None
