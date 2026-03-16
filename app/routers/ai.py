"""
Phase 3 — AI endpoints:
- POST /tenants/{tenant_id}/ai/triage         — Claude Haiku: קליטת פרויקט מטקסט חופשי
- POST /tenants/{tenant_id}/ai/analyse        — Claude Sonnet: ניתוח מסמך
- POST /tenants/{tenant_id}/ai/check-duplicate — Fuzzy: בדיקת כפילות פרויקט
"""

import os
from uuid import UUID

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import ai as ai_service, models
from ..deps import get_db

router = APIRouter(prefix="/tenants/{tenant_id}/ai", tags=["ai"])


# ---------------------------------------------------------------------------
# Schemas (request/response)
# ---------------------------------------------------------------------------

class TriageRequest(BaseModel):
    text: str  # תיאור חופשי של הפרויקט


class AnalyseRequest(BaseModel):
    content: str  # תוכן המסמך


class DuplicateCheckRequest(BaseModel):
    name: str
    gush: str
    helka: str


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/triage", response_model=ai_service.ProjectTriage)
def triage_project(tenant_id: UUID, req: TriageRequest):
    """Claude Haiku קורא תיאור חופשי ומחזיר שדות פרויקט מובנים."""
    try:
        return ai_service.triage_project(req.text)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.post("/analyse", response_model=ai_service.DocumentAnalysis)
def analyse_document(tenant_id: UUID, req: AnalyseRequest):
    """Claude Sonnet מנתח מסמך ומחזיר תקציר, תאריכים ופעולות נדרשות."""
    try:
        return ai_service.analyse_document(req.content)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.post("/check-duplicate", response_model=list[ai_service.DuplicateCandidate])
def check_duplicate(tenant_id: UUID, req: DuplicateCheckRequest, db: Session = Depends(get_db)):
    """בודק אם קיים פרויקט דומה ב-tenant לפי Fuzzy Matching."""
    return ai_service.find_duplicate_projects(
        db=db,
        tenant_id=str(tenant_id),
        name=req.name,
        gush=req.gush,
        helka=req.helka,
    )


@router.post("/ask", response_model=AskResponse)
def ask(tenant_id: UUID, req: AskRequest, db: Session = Depends(get_db)):
    """שאל שאלה חופשית על הנתונים של ה-tenant — Claude מנתח ומשיב."""
    # Build context: projects, open tasks, budget summary
    projects = db.query(models.Project).filter(
        models.Project.tenant_id == tenant_id,
        models.Project.deleted_at.is_(None),
    ).all()

    tasks = db.query(models.Task).filter(
        models.Task.tenant_id == tenant_id,
        models.Task.deleted_at.is_(None),
    ).all()

    proj_lines = "\n".join(
        f"- {p.name} (גוש {p.gush} חלקה {p.helka}, תקציב: {p.budget_total or 'לא מוגדר'})"
        for p in projects
    )
    task_lines = "\n".join(
        f"- {t.title} [{t.status}] תאריך סיום: {t.end_date or 'לא מוגדר'}"
        for t in tasks[:50]  # limit context size
    )

    system_prompt = f"""אתה עוזר AI לניהול פרויקטים נדל"ן עבור חברת Hadas Capital.
ענה בעברית. היה תמציתי וממוקד.

נתוני המערכת הנוכחיים:

פרויקטים ({len(projects)}):
{proj_lines or "אין פרויקטים"}

משימות ({len(tasks)}):
{task_lines or "אין משימות"}
"""

    try:
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": req.question}],
        )
        return AskResponse(answer=msg.content[0].text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"שגיאה ב-AI: {str(e)[:200]}")
