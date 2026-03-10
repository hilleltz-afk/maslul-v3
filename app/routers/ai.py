"""
Phase 3 — AI endpoints:
- POST /tenants/{tenant_id}/ai/triage         — Claude Haiku: קליטת פרויקט מטקסט חופשי
- POST /tenants/{tenant_id}/ai/analyse        — Claude Sonnet: ניתוח מסמך
- POST /tenants/{tenant_id}/ai/check-duplicate — Fuzzy: בדיקת כפילות פרויקט
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import ai as ai_service
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
