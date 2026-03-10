from datetime import datetime, timezone, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/documents", tags=["documents"])


def _get_document_or_404(db: Session, tenant_id: UUID, document_id: UUID) -> models.Document:
    document = (
        db.query(models.Document)
        .filter(
            models.Document.id == document_id,
            models.Document.tenant_id == tenant_id,
            models.Document.deleted_at.is_(None),
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="מסמך לא נמצא")
    return document


@router.post("/", response_model=schemas.DocumentRead, status_code=status.HTTP_201_CREATED)
def create_document(
    tenant_id: UUID,
    document_in: schemas.DocumentCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    document = crud.create_entity(
        db,
        models.Document,
        document_in.model_dump(),
        tenant_id=str(tenant_id),
        created_by=user_id,
    )
    db.commit()
    db.refresh(document)
    return document


@router.get("/expiring", response_model=list[schemas.DocumentAlert])
def list_expiring_documents(
    tenant_id: UUID,
    days: int = Query(default=30, ge=0, le=365, description="מספר ימים קדימה לבדיקה"),
    db: Session = Depends(get_db),
):
    """מחזיר מסמכים שתוקפם פג או יפוג תוך N ימים (ברירת מחדל: 30)."""
    now = datetime.now(timezone.utc)
    deadline = now + timedelta(days=days)
    documents = (
        db.query(models.Document)
        .filter(
            models.Document.tenant_id == tenant_id,
            models.Document.deleted_at.is_(None),
            models.Document.expiry_date.isnot(None),
            models.Document.expiry_date <= deadline,
        )
        .order_by(models.Document.expiry_date)
        .all()
    )
    result = []
    for doc in documents:
        expiry = doc.expiry_date
        # SQLite מחזיר datetime naive — נוסיף tzinfo לחישוב
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        days_left = (expiry - now).days
        result.append(
            schemas.DocumentAlert(
                id=doc.id,
                tenant_id=doc.tenant_id,
                project_id=doc.project_id,
                name=doc.name,
                path=doc.path,
                expiry_date=expiry,
                days_until_expiry=days_left,
            )
        )
    return result


@router.get("/{document_id}", response_model=schemas.DocumentRead)
def read_document(tenant_id: UUID, document_id: UUID, db: Session = Depends(get_db)):
    return _get_document_or_404(db, tenant_id, document_id)


@router.get("/", response_model=list[schemas.DocumentRead])
def list_documents(tenant_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(models.Document)
        .filter(models.Document.tenant_id == tenant_id, models.Document.deleted_at.is_(None))
        .all()
    )


@router.put("/{document_id}", response_model=schemas.DocumentRead)
def update_document(
    tenant_id: UUID,
    document_id: UUID,
    document_in: schemas.DocumentUpdate,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    document = _get_document_or_404(db, tenant_id, document_id)
    document = crud.update_entity(db, document, document_in.model_dump(), changed_by=changed_by)
    db.commit()
    db.refresh(document)
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    tenant_id: UUID,
    document_id: UUID,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    document = _get_document_or_404(db, tenant_id, document_id)
    crud.soft_delete_entity(db, document, changed_by=changed_by)
    db.commit()
    return None
