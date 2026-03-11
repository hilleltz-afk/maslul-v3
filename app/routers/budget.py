from uuid import UUID
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/projects/{project_id}/budget", tags=["budget"])


def _get_entry_or_404(db: Session, project_id: UUID, entry_id: UUID) -> models.BudgetEntry:
    entry = (
        db.query(models.BudgetEntry)
        .filter(
            models.BudgetEntry.id == entry_id,
            models.BudgetEntry.project_id == project_id,
            models.BudgetEntry.deleted_at.is_(None),
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="רשומת תקציב לא נמצאה")
    return entry


@router.get("/", response_model=List[schemas.BudgetEntryRead])
def list_entries(tenant_id: UUID, project_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(models.BudgetEntry)
        .filter(
            models.BudgetEntry.project_id == project_id,
            models.BudgetEntry.tenant_id == tenant_id,
            models.BudgetEntry.deleted_at.is_(None),
        )
        .order_by(models.BudgetEntry.entry_date.desc())
        .all()
    )


@router.get("/summary", response_model=List[schemas.BudgetSummaryRow])
def budget_summary(tenant_id: UUID, project_id: UUID, db: Session = Depends(get_db)):
    entries = (
        db.query(models.BudgetEntry)
        .filter(
            models.BudgetEntry.project_id == project_id,
            models.BudgetEntry.tenant_id == tenant_id,
            models.BudgetEntry.deleted_at.is_(None),
        )
        .all()
    )
    categories: dict[str, dict] = {}
    for e in entries:
        cat = e.category
        if cat not in categories:
            categories[cat] = {"planned": 0.0, "actual": 0.0}
        if e.is_planned:
            categories[cat]["planned"] += e.amount
        else:
            categories[cat]["actual"] += e.amount

    return [
        schemas.BudgetSummaryRow(
            category=cat,
            planned=vals["planned"],
            actual=vals["actual"],
            diff=vals["planned"] - vals["actual"],
        )
        for cat, vals in sorted(categories.items())
    ]


@router.post("/", response_model=schemas.BudgetEntryRead, status_code=status.HTTP_201_CREATED)
def create_entry(
    tenant_id: UUID,
    project_id: UUID,
    entry_in: schemas.BudgetEntryCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    entry = crud.create_entity(
        db,
        models.BudgetEntry,
        entry_in.model_dump(),
        tenant_id=str(tenant_id),
        project_id=str(project_id),
        created_by=user_id,
    )
    db.commit()
    db.refresh(entry)
    return entry


@router.put("/{entry_id}", response_model=schemas.BudgetEntryRead)
def update_entry(
    tenant_id: UUID,
    project_id: UUID,
    entry_id: UUID,
    entry_in: schemas.BudgetEntryUpdate,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    entry = _get_entry_or_404(db, project_id, entry_id)
    entry = crud.update_entity(db, entry, entry_in.model_dump(), changed_by=changed_by)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    tenant_id: UUID,
    project_id: UUID,
    entry_id: UUID,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    entry = _get_entry_or_404(db, project_id, entry_id)
    crud.soft_delete_entity(db, entry, changed_by=changed_by)
    db.commit()
    return None
