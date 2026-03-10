from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/contacts", tags=["contacts"])


def _get_contact_or_404(db: Session, tenant_id: UUID, contact_id: UUID) -> models.Contact:
    contact = (
        db.query(models.Contact)
        .filter(
            models.Contact.id == contact_id,
            models.Contact.tenant_id == tenant_id,
            models.Contact.deleted_at.is_(None),
        )
        .first()
    )
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="איש קשר לא נמצא")
    return contact


@router.post("/", response_model=schemas.ContactRead, status_code=status.HTTP_201_CREATED)
def create_contact(
    tenant_id: UUID,
    contact_in: schemas.ContactCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    contact = crud.create_entity(
        db,
        models.Contact,
        contact_in.model_dump(),
        tenant_id=str(tenant_id),
        created_by=user_id,
    )
    db.commit()
    db.refresh(contact)
    return contact


@router.get("/{contact_id}", response_model=schemas.ContactRead)
def read_contact(tenant_id: UUID, contact_id: UUID, db: Session = Depends(get_db)):
    return _get_contact_or_404(db, tenant_id, contact_id)


@router.get("/", response_model=list[schemas.ContactRead])
def list_contacts(tenant_id: UUID, db: Session = Depends(get_db)):
    return (
        db.query(models.Contact)
        .filter(models.Contact.tenant_id == tenant_id, models.Contact.deleted_at.is_(None))
        .all()
    )


@router.put("/{contact_id}", response_model=schemas.ContactRead)
def update_contact(
    tenant_id: UUID,
    contact_id: UUID,
    contact_in: schemas.ContactUpdate,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    contact = _get_contact_or_404(db, tenant_id, contact_id)
    contact = crud.update_entity(db, contact, contact_in.model_dump(), changed_by=changed_by)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(
    tenant_id: UUID,
    contact_id: UUID,
    db: Session = Depends(get_db),
    changed_by: str | None = Depends(get_current_user_id),
):
    contact = _get_contact_or_404(db, tenant_id, contact_id)
    crud.soft_delete_entity(db, contact, changed_by=changed_by)
    db.commit()
    return None
