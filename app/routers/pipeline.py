"""
Phase 4 — Email Pipeline endpoints:
- POST /tenants/{tenant_id}/pipeline/ingest     — קליטת מייל חדש + Triage + Analysis
- GET  /tenants/{tenant_id}/pipeline/pending    — רשימת ממתינים לאישור (HITL)
- POST /tenants/{tenant_id}/pipeline/{item_id}/approve  — אישור ויצירת משימה
- POST /tenants/{tenant_id}/pipeline/{item_id}/dismiss  — דחייה
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import ai as ai_service
from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/pipeline", tags=["pipeline"])

_BODY_PREVIEW_WORDS = 100


def _get_item_or_404(db: Session, tenant_id: UUID, item_id: UUID, user_id: str | None = None) -> models.EmailPipelineItem:
    q = db.query(models.EmailPipelineItem).filter(
        models.EmailPipelineItem.id == item_id,
        models.EmailPipelineItem.tenant_id == tenant_id,
        models.EmailPipelineItem.deleted_at.is_(None),
    )
    if user_id:
        q = q.filter(models.EmailPipelineItem.created_by == user_id)
    item = q.first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="פריט צינור לא נמצא")
    return item


@router.post("/ingest", response_model=schemas.EmailPipelineItemRead, status_code=status.HTTP_201_CREATED)
def ingest_email(
    tenant_id: UUID,
    req: schemas.EmailIngestRequest,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    """
    Step 1 + 2: קליטת מייל, הרצת Triage ואם רלוונטי — Analysis מעמיק.
    """
    # חלץ תצוגה מקדימה (100 מילים)
    words = req.body.split()
    body_preview = " ".join(words[:_BODY_PREVIEW_WORDS])

    # Step 1 — Triage (Haiku)
    triage = ai_service.triage_email(req.sender, req.subject, body_preview)

    item = models.EmailPipelineItem(
        tenant_id=str(tenant_id),
        gmail_message_id=req.gmail_message_id,
        sender=req.sender,
        subject=req.subject,
        body_preview=body_preview,
        full_body=req.body,
        triage_is_relevant=1 if triage.is_relevant else 0,
        triage_confidence=triage.confidence,
        triage_reason=triage.reason,
        status=models.EmailPipelineStatus.TRIAGED_OUT if not triage.is_relevant else models.EmailPipelineStatus.PENDING,
        created_by=user_id,
    )

    if triage.is_relevant:
        # Step 2 — Analysis (Sonnet)
        projects = (
            db.query(models.Project)
            .filter(models.Project.tenant_id == str(tenant_id), models.Project.deleted_at.is_(None))
            .all()
        )

        # הכנת מידע עשיר על פרויקטים (כולל alias-ים)
        aliases_rows = (
            db.query(models.ProjectAlias)
            .filter(models.ProjectAlias.tenant_id == str(tenant_id), models.ProjectAlias.deleted_at.is_(None))
            .all()
        )
        aliases_by_project: dict[str, list[str]] = {}
        for a in aliases_rows:
            aliases_by_project.setdefault(str(a.project_id), []).append(a.alias)

        projects_data = []
        for p in projects:
            entry = {
                "id": str(p.id),
                "name": p.name,
                "gush": p.gush or "",
                "helka": p.helka or "",
                "address": p.address or "",
            }
            extras = aliases_by_project.get(str(p.id), [])
            if extras:
                entry["name"] = p.name + " / " + " / ".join(extras)
            projects_data.append(entry)

        # זיהוי שולח לפי אימייל בין אנשי הקשר
        contact = (
            db.query(models.Contact)
            .filter(
                models.Contact.tenant_id == str(tenant_id),
                models.Contact.email == req.sender,
                models.Contact.deleted_at.is_(None),
            )
            .first()
        )
        contact_context = ""
        if contact:
            profession = f" ({contact.profession})" if contact.profession else ""
            contact_context = f"שולח מזוהה באנשי הקשר: {contact.name}{profession}"

        # שליפת היסטוריית שיוכים שאושרו — ל-few-shot learning (אופציונלי)
        try:
            past_approvals = (
                db.query(models.EmailPipelineItem, models.Project)
                .join(models.Project, models.EmailPipelineItem.approved_project_id == models.Project.id, isouter=True)
                .filter(
                    models.EmailPipelineItem.tenant_id == str(tenant_id),
                    models.EmailPipelineItem.status == models.EmailPipelineStatus.APPROVED,
                    models.EmailPipelineItem.approved_project_id.isnot(None),
                )
                .order_by(models.EmailPipelineItem.reviewed_at.desc())
                .limit(15)
                .all()
            )
            past_corrections = [
                {"sender": ep_item.sender, "subject": ep_item.subject, "project_name": proj.name}
                for ep_item, proj in past_approvals
                if proj
            ]
        except Exception:
            past_corrections = []

        analysis = ai_service.analyse_email(
            req.sender, req.subject, req.body,
            projects=projects_data,
            contact_context=contact_context,
            past_corrections=past_corrections,
        )

        # Fuzzy match: מצא project_id לפי שם שהוחזר מה-AI
        matched_project_id = None
        if analysis.project_name_guess and projects:
            candidates = ai_service.find_duplicate_projects(
                db=db,
                tenant_id=str(tenant_id),
                name=analysis.project_name_guess,
                gush="",
                helka="",
            )
            if candidates and candidates[0].similarity >= 0.6:
                matched_project_id = candidates[0].id

        # פרסור תאריך יעד מוצע
        suggested_due_dt = None
        if analysis.suggested_due_date:
            try:
                from datetime import datetime as dt
                suggested_due_dt = dt.strptime(analysis.suggested_due_date, "%Y-%m-%d")
            except ValueError:
                pass

        item.suggested_project_id = matched_project_id
        item.project_match_confidence = analysis.confidence_project_match
        item.suggested_task_name = analysis.suggested_task_name
        item.suggested_priority = analysis.suggested_priority
        item.suggested_assignee = analysis.suggested_assignee
        item.suggested_due_date = suggested_due_dt
        item.has_attachments = 1 if analysis.has_attachments else 0
        item.budget_mentioned = analysis.budget_mentioned
        # שמור הערות + שם איש קשר שזוהה
        notes_parts = []
        if analysis.notes:
            notes_parts.append(analysis.notes)
        if contact_context:
            notes_parts.append(contact_context)
        item.analysis_notes = " | ".join(notes_parts) if notes_parts else None

    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/pending", response_model=list[schemas.EmailPipelineItemRead])
def list_pending(
    tenant_id: UUID,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    """Step 3 — HITL: רשימת מיילים שממתינים לאישור — פרטי לכל משתמש."""
    q = db.query(models.EmailPipelineItem).filter(
        models.EmailPipelineItem.tenant_id == str(tenant_id),
        models.EmailPipelineItem.status == models.EmailPipelineStatus.PENDING,
        models.EmailPipelineItem.deleted_at.is_(None),
    )
    if user_id:
        q = q.filter(models.EmailPipelineItem.created_by == user_id)
    return q.order_by(models.EmailPipelineItem.created_at.desc()).all()


@router.post("/{item_id}/approve", response_model=schemas.EmailPipelineItemRead)
def approve_email(
    tenant_id: UUID,
    item_id: UUID,
    req: schemas.EmailApproveRequest,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    """
    Step 4 — אישור: יצירת משימה ועדכון סטטוס הפריט.
    """
    item = _get_item_or_404(db, tenant_id, item_id, user_id)
    if item.status != models.EmailPipelineStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="פריט זה כבר טופל ואינו ממתין לאישור",
        )

    # יצירת המשימה
    task_data = {
        "project_id": str(req.project_id),
        "stage_id": str(req.stage_id),
        "title": req.task_title,
        "priority": req.priority,
        "status": "open",
        "description": f"נוצר אוטומטית ממייל: {item.subject}\nשולח: {item.sender}",
    }
    if req.assignee_id:
        task_data["assignee_id"] = str(req.assignee_id)
    if req.due_date:
        try:
            from datetime import datetime as dt
            task_data["end_date"] = dt.strptime(req.due_date, "%Y-%m-%d")
        except ValueError:
            pass

    task = crud.create_entity(
        db, models.Task, task_data,
        tenant_id=str(tenant_id),
        created_by=user_id,
    )

    # עדכון הפריט
    item.status = models.EmailPipelineStatus.APPROVED
    item.approved_project_id = str(req.project_id)
    item.created_task_id = task.id
    item.reviewed_by = user_id
    item.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{item_id}/dismiss", response_model=schemas.EmailPipelineItemRead)
def dismiss_email(
    tenant_id: UUID,
    item_id: UUID,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    """Step 3 — דחיית מייל ללא יצירת משימה."""
    item = _get_item_or_404(db, tenant_id, item_id, user_id)
    if item.status != models.EmailPipelineStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="פריט זה כבר טופל ואינו ממתין לאישור",
        )
    item.status = models.EmailPipelineStatus.DISMISSED
    item.reviewed_by = user_id
    item.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item
