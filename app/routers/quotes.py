"""
ניהול הצעות מחיר — העלאת PDF, ניתוח AI, ואבני דרך לתשלום.
"""
import io
import json
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

import anthropic
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user_id, get_db


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """חלץ טקסט מה-PDF באמצעות pypdf."""
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages)
    except Exception:
        return ""

router = APIRouter(prefix="/tenants/{tenant_id}/quotes", tags=["quotes"])

ALLOWED_TYPES = {"application/pdf", "application/octet-stream"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _get_quote_or_404(db: Session, tenant_id: UUID, quote_id: UUID) -> models.Quote:
    q = (
        db.query(models.Quote)
        .filter(
            models.Quote.id == quote_id,
            models.Quote.tenant_id == tenant_id,
            models.Quote.deleted_at.is_(None),
        )
        .first()
    )
    if not q:
        raise HTTPException(status_code=404, detail="הצעת מחיר לא נמצאה")
    return q


def _quote_to_read(quote: models.Quote, db: Session) -> schemas.QuoteRead:
    milestones = (
        db.query(models.PaymentMilestone)
        .filter(
            models.PaymentMilestone.quote_id == quote.id,
            models.PaymentMilestone.deleted_at.is_(None),
        )
        .order_by(models.PaymentMilestone.due_date)
        .all()
    )
    data = schemas.QuoteRead.model_validate(quote)
    data.milestones = [schemas.PaymentMilestoneRead.model_validate(m) for m in milestones]
    return data


def _analyse_pdf_with_claude(
    pdf_bytes: bytes,
    filename: str,
    projects: list[models.Project],
) -> dict:
    """חלץ טקסט מה-PDF ושלח ל-Claude לניתוח."""
    project_list = "\n".join(
        f"- {p.name} (id: {p.id}, גוש {p.gush} חלקה {p.helka})"
        for p in projects
    )

    pdf_text = _extract_pdf_text(pdf_bytes)
    if not pdf_text.strip():
        pdf_text = f"[לא הצלחתי לחלץ טקסט מהקובץ: {filename}]"

    prompt = f"""אתה מנתח הצעות מחיר לפרויקטים בנדל"ן עבור חברת Hadas Capital.

להלן רשימת הפרויקטים הקיימים במערכת:
{project_list if project_list else "אין פרויקטים קיימים"}

להלן תוכן הצעת המחיר (חולץ מ-PDF):
---
{pdf_text[:8000]}
---

נתח את ההצעה וחלץ את המידע הבא בפורמט JSON בלבד — ללא טקסט נוסף:

{{
  "title": "שם/תיאור קצר של ההצעה",
  "vendor": "שם הספק/קבלן",
  "total_amount": <מספר — הסכום הכולל בשקלים, null אם לא ברור>,
  "project_id": "<UUID של הפרויקט המתאים ביותר, null אם לא ברור>",
  "project_name": "<שם הפרויקט שזיהית, null אם לא ברור>",
  "milestones": [
    {{
      "description": "תיאור אבן הדרך",
      "amount": <סכום בשקלים>,
      "due_date": "<YYYY-MM-DD או null>"
    }}
  ],
  "notes": "הערות נוספות"
}}

חשוב:
- total_amount ו-amount: ספרות בלבד (ללא פסיקים, ללא ₪)
- milestones: רשימת כל אבני הדרך לתשלום שמוזכרות בהצעה
- project_id: בחר את ה-UUID המדויק מהרשימה, או null
"""

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    text = message.content[0].text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        text = "\n".join(inner)
    return json.loads(text)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/", response_model=List[schemas.QuoteRead])
def list_quotes(
    tenant_id: UUID,
    project_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Quote).filter(
        models.Quote.tenant_id == tenant_id,
        models.Quote.deleted_at.is_(None),
    )
    if project_id:
        q = q.filter(models.Quote.project_id == project_id)
    quotes = q.order_by(models.Quote.created_at.desc()).all()
    return [_quote_to_read(quote, db) for quote in quotes]


@router.get("/{quote_id}", response_model=schemas.QuoteRead)
def get_quote(tenant_id: UUID, quote_id: UUID, db: Session = Depends(get_db)):
    quote = _get_quote_or_404(db, tenant_id, quote_id)
    return _quote_to_read(quote, db)


@router.post("/upload", response_model=schemas.QuoteRead, status_code=status.HTTP_201_CREATED)
async def upload_quote(
    tenant_id: UUID,
    file: UploadFile = File(...),
    project_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    """העלה PDF של הצעת מחיר — Claude ינתח ויחלץ נתונים."""
    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="הקובץ גדול מדי (מקסימום 10MB)")

    # קבל רשימת פרויקטים קיימים לצורך התאמה
    projects = (
        db.query(models.Project)
        .filter(
            models.Project.tenant_id == tenant_id,
            models.Project.deleted_at.is_(None),
        )
        .all()
    )

    try:
        extracted = _analyse_pdf_with_claude(pdf_bytes, file.filename or "quote.pdf", projects)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"שגיאה בניתוח ה-PDF: {str(e)[:200]}")

    # צור Quote
    now = datetime.now(timezone.utc)
    quote_id = uuid.uuid4()

    # project_id מפרמטר מנצח את הניחוש של ה-AI
    if project_id:
        project_id_val = project_id
    else:
        project_id_val = extracted.get("project_id")
        if project_id_val:
            try:
                pid = uuid.UUID(str(project_id_val))
                exists = db.query(models.Project).filter(models.Project.id == pid).first()
                if not exists:
                    project_id_val = None
            except Exception:
                project_id_val = None

    quote = models.Quote(
        id=quote_id,
        tenant_id=tenant_id,
        project_id=project_id_val,
        vendor=extracted.get("vendor"),
        title=extracted.get("title") or (file.filename or "הצעת מחיר"),
        total_amount=extracted.get("total_amount"),
        pdf_filename=file.filename,
        ai_extracted_data=json.dumps(extracted, ensure_ascii=False),
        status="pending_review",
        notes=extracted.get("notes"),
        created_at=now,
        updated_at=now,
        created_by=user_id,
    )
    db.add(quote)

    # צור אבני דרך
    for ms in extracted.get("milestones", []):
        due = None
        if ms.get("due_date"):
            try:
                due = datetime.fromisoformat(ms["due_date"])
            except Exception:
                pass
        milestone = models.PaymentMilestone(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            quote_id=quote_id,
            project_id=project_id_val,
            description=ms.get("description", "תשלום"),
            amount=float(ms.get("amount") or 0),
            due_date=due,
            is_paid=0,
            created_at=now,
            updated_at=now,
            created_by=user_id,
        )
        db.add(milestone)

    db.commit()
    db.refresh(quote)
    return _quote_to_read(quote, db)


@router.put("/{quote_id}", response_model=schemas.QuoteRead)
def update_quote(
    tenant_id: UUID,
    quote_id: UUID,
    data: schemas.QuoteUpdate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    quote = _get_quote_or_404(db, tenant_id, quote_id)
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(quote, k, v)
    quote.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(quote)
    return _quote_to_read(quote, db)


@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quote(
    tenant_id: UUID,
    quote_id: UUID,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    quote = _get_quote_or_404(db, tenant_id, quote_id)
    now = datetime.now(timezone.utc)
    quote.deleted_at = now
    # soft-delete milestones too
    db.query(models.PaymentMilestone).filter(
        models.PaymentMilestone.quote_id == quote_id,
        models.PaymentMilestone.deleted_at.is_(None),
    ).update({"deleted_at": now})
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Milestone endpoints
# ---------------------------------------------------------------------------


@router.put("/{quote_id}/milestones/{milestone_id}", response_model=schemas.PaymentMilestoneRead)
def update_milestone(
    tenant_id: UUID,
    quote_id: UUID,
    milestone_id: UUID,
    data: schemas.PaymentMilestoneUpdate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    ms = (
        db.query(models.PaymentMilestone)
        .filter(
            models.PaymentMilestone.id == milestone_id,
            models.PaymentMilestone.quote_id == quote_id,
            models.PaymentMilestone.deleted_at.is_(None),
        )
        .first()
    )
    if not ms:
        raise HTTPException(status_code=404, detail="אבן דרך לא נמצאה")

    update_data = data.model_dump(exclude_none=True)
    # if marking as paid and no paid_at, set it now
    if update_data.get("is_paid") == 1 and not ms.paid_at:
        update_data["paid_at"] = datetime.now(timezone.utc)
    for k, v in update_data.items():
        setattr(ms, k, v)
    ms.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ms)
    return ms
