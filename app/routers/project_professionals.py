"""Project Professionals router — link contacts to a project by profession."""
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..constants import PROFESSIONS
from ..deps import get_current_user_id, get_db

router = APIRouter(
    prefix="/tenants/{tenant_id}/projects/{project_id}/professionals",
    tags=["project-professionals"],
)


def _get_project_or_404(db: Session, tenant_id: UUID, project_id: UUID) -> models.Project:
    p = (
        db.query(models.Project)
        .filter(
            models.Project.id == project_id,
            models.Project.tenant_id == tenant_id,
            models.Project.deleted_at.is_(None),
        )
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="פרויקט לא נמצא")
    return p


@router.get("/", response_model=list[schemas.ProjectProfessionalRead])
def list_professionals(
    tenant_id: UUID,
    project_id: UUID,
    db: Session = Depends(get_db),
):
    _get_project_or_404(db, tenant_id, project_id)
    rows = (
        db.query(models.ProjectProfessional)
        .filter(
            models.ProjectProfessional.tenant_id == str(tenant_id),
            models.ProjectProfessional.project_id == str(project_id),
            models.ProjectProfessional.deleted_at.is_(None),
        )
        .all()
    )
    result = []
    for r in rows:
        contact = db.query(models.Contact).filter(models.Contact.id == r.contact_id).first()
        result.append(schemas.ProjectProfessionalRead(
            id=r.id,
            project_id=r.project_id,
            contact_id=r.contact_id,
            profession=r.profession,
            contact_name=contact.name if contact else None,
            contact_phone=contact.phone if contact else None,
            contact_email=contact.email if contact else None,
            created_at=r.created_at,
        ))
    return result


@router.post("/", response_model=schemas.ProjectProfessionalRead, status_code=status.HTTP_201_CREATED)
def add_professional(
    tenant_id: UUID,
    project_id: UUID,
    body: schemas.ProjectProfessionalCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    _get_project_or_404(db, tenant_id, project_id)

    if body.profession not in PROFESSIONS:
        raise HTTPException(status_code=400, detail=f"מקצוע לא חוקי: {body.profession}")

    contact = db.query(models.Contact).filter(
        models.Contact.id == body.contact_id,
        models.Contact.tenant_id == str(tenant_id),
        models.Contact.deleted_at.is_(None),
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="איש קשר לא נמצא")

    # prevent duplicate profession per project
    existing = db.query(models.ProjectProfessional).filter(
        models.ProjectProfessional.project_id == str(project_id),
        models.ProjectProfessional.profession == body.profession,
        models.ProjectProfessional.deleted_at.is_(None),
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"כבר קיים {body.profession} בפרויקט זה")

    now = datetime.now(timezone.utc)
    row = models.ProjectProfessional(
        id=uuid4(),
        tenant_id=tenant_id,
        project_id=project_id,
        contact_id=body.contact_id,
        profession=body.profession,
        created_at=now,
        updated_at=now,
        created_by=user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.ProjectProfessionalRead(
        id=row.id,
        project_id=row.project_id,
        contact_id=row.contact_id,
        profession=row.profession,
        contact_name=contact.name,
        contact_phone=contact.phone,
        contact_email=contact.email,
        created_at=row.created_at,
    )


@router.delete("/{prof_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_professional(
    tenant_id: UUID,
    project_id: UUID,
    prof_id: UUID,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    _get_project_or_404(db, tenant_id, project_id)
    row = db.query(models.ProjectProfessional).filter(
        models.ProjectProfessional.id == prof_id,
        models.ProjectProfessional.project_id == str(project_id),
        models.ProjectProfessional.deleted_at.is_(None),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="לא נמצא")
    row.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return None


@router.get("/professions-list", response_model=list[str])
def get_professions_list(tenant_id: UUID, project_id: UUID):
    """Return the closed professions list."""
    return PROFESSIONS
