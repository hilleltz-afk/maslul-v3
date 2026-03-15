"""
חיפוש גלובלי — פרויקטים, משימות, אנשי קשר, מסמכים.
"""
from uuid import UUID
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models
from ..deps import get_db

router = APIRouter(prefix="/tenants/{tenant_id}", tags=["search"])


@router.get("/search")
def global_search(tenant_id: UUID, q: str = "", db: Session = Depends(get_db)) -> dict[str, list[dict]]:
    if not q or len(q.strip()) < 2:
        return {"projects": [], "tasks": [], "contacts": [], "documents": []}

    term = f"%{q.strip()}%"

    projects = (
        db.query(models.Project)
        .filter(
            models.Project.tenant_id == tenant_id,
            models.Project.deleted_at.is_(None),
            or_(
                models.Project.name.ilike(term),
                models.Project.address.ilike(term),
                models.Project.gush.ilike(term),
                models.Project.helka.ilike(term),
            ),
        )
        .limit(5)
        .all()
    )

    tasks = (
        db.query(models.Task)
        .filter(
            models.Task.tenant_id == tenant_id,
            models.Task.deleted_at.is_(None),
            or_(
                models.Task.title.ilike(term),
                models.Task.description.ilike(term),
            ),
        )
        .limit(8)
        .all()
    )

    contacts = (
        db.query(models.Contact)
        .filter(
            models.Contact.tenant_id == tenant_id,
            models.Contact.deleted_at.is_(None),
            or_(
                models.Contact.name.ilike(term),
                models.Contact.email.ilike(term),
                models.Contact.phone.ilike(term),
                models.Contact.profession.ilike(term),
            ),
        )
        .limit(5)
        .all()
    )

    documents = (
        db.query(models.Document)
        .filter(
            models.Document.tenant_id == tenant_id,
            models.Document.deleted_at.is_(None),
            models.Document.name.ilike(term),
        )
        .limit(5)
        .all()
    )

    return {
        "projects": [
            {"id": str(p.id), "name": p.name, "address": p.address, "type": "project"}
            for p in projects
        ],
        "tasks": [
            {"id": str(t.id), "title": t.title, "status": t.status, "project_id": str(t.project_id), "type": "task"}
            for t in tasks
        ],
        "contacts": [
            {"id": str(c.id), "name": c.name, "email": c.email, "profession": c.profession, "type": "contact"}
            for c in contacts
        ],
        "documents": [
            {"id": str(d.id), "name": d.name, "project_id": str(d.project_id) if d.project_id else None, "type": "document"}
            for d in documents
        ],
    }
