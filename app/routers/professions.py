"""Professions router — manages the closed list of professions per tenant."""
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/professions", tags=["professions"])

DEFAULT_PROFESSIONS = [
    "מנהל פרוייקט", "אדריכל", "מהנדס", "מודד", "שמאי", "אינסטלציה",
    "חשמל", "בניה ירוקה", "גז", "תנועה", "נגישות", "בטיחות",
    "קרקע וביסוס", "מכון העתקות", "אשפה", "אדריכל נוף", "אדריכל שימור",
    "מיגון", "אגרונום", "אקוסטיקה", "אלומיניום", "איטום ובידוד",
    "מעליות", "מיזוג אוויר", "תאורה", "הידרולוגיה", "עיצוב פנים",
    "מכון בקרה", "יועץ קרינה", "מעבדות", "יועץ משפטי", "יועץ שילוט",
    "יועץ סביבתי", "יועץ תעופה",
]


def _seed_defaults(db: Session, tenant_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    for i, name in enumerate(DEFAULT_PROFESSIONS):
        db.add(models.Profession(
            id=uuid4(), tenant_id=tenant_id, name=name, order=i, created_at=now,
        ))
    db.commit()


@router.get("/")
def list_professions(tenant_id: UUID, db: Session = Depends(get_db)):
    rows = (
        db.query(models.Profession)
        .filter(
            models.Profession.tenant_id == tenant_id,
            models.Profession.deleted_at.is_(None),
        )
        .order_by(models.Profession.order, models.Profession.name)
        .all()
    )
    if not rows:
        _seed_defaults(db, tenant_id)
        rows = (
            db.query(models.Profession)
            .filter(
                models.Profession.tenant_id == tenant_id,
                models.Profession.deleted_at.is_(None),
            )
            .order_by(models.Profession.order, models.Profession.name)
            .all()
        )
    return [{"id": str(r.id), "name": r.name, "order": r.order} for r in rows]


@router.post("/", status_code=201)
def create_profession(
    tenant_id: UUID,
    body: dict,
    db: Session = Depends(get_db),
    _: str | None = Depends(get_current_user_id),
):
    max_order = db.query(models.Profession).filter(
        models.Profession.tenant_id == tenant_id,
        models.Profession.deleted_at.is_(None),
    ).count()
    p = models.Profession(
        id=uuid4(), tenant_id=tenant_id,
        name=body["name"].strip(), order=max_order,
        created_at=datetime.now(timezone.utc),
    )
    db.add(p)
    db.commit()
    return {"id": str(p.id), "name": p.name, "order": p.order}


@router.put("/{profession_id}")
def update_profession(
    tenant_id: UUID,
    profession_id: UUID,
    body: dict,
    db: Session = Depends(get_db),
    _: str | None = Depends(get_current_user_id),
):
    p = db.query(models.Profession).filter(
        models.Profession.id == profession_id,
        models.Profession.tenant_id == tenant_id,
        models.Profession.deleted_at.is_(None),
    ).first()
    if not p:
        from fastapi import HTTPException
        raise HTTPException(404, "לא נמצא")
    if "name" in body:
        p.name = body["name"].strip()
    db.commit()
    return {"id": str(p.id), "name": p.name, "order": p.order}


@router.delete("/{profession_id}", status_code=204)
def delete_profession(
    tenant_id: UUID,
    profession_id: UUID,
    db: Session = Depends(get_db),
    _: str | None = Depends(get_current_user_id),
):
    p = db.query(models.Profession).filter(
        models.Profession.id == profession_id,
        models.Profession.tenant_id == tenant_id,
        models.Profession.deleted_at.is_(None),
    ).first()
    if p:
        p.deleted_at = datetime.now(timezone.utc)
        db.commit()
    return None
