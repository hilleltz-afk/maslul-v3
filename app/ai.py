"""
Phase 3 — AI services:
1. Fuzzy duplicate detection for projects (Levenshtein)
2. AI Triage — Claude Haiku extracts project details from free text
3. AI Analysis — Claude Sonnet analyses a document and returns insights

Phase 4 — Email Pipeline AI:
4. Email Triage (Haiku) — האם המייל רלוונטי לעבודה?
5. Email Analysis (Sonnet) — לאיזה פרויקט? מה המשימה המוצעת?
"""

import os
from typing import Optional

import anthropic
from Levenshtein import ratio as lev_ratio
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import models

# ---------------------------------------------------------------------------
# Fuzzy Matching
# ---------------------------------------------------------------------------

SIMILARITY_THRESHOLD = 0.85  # ציון מעל זה נחשב כפיל


class DuplicateCandidate(BaseModel):
    id: str
    name: str
    gush: str
    helka: str
    similarity: float


def find_duplicate_projects(
    db: Session,
    tenant_id: str,
    name: str,
    gush: str,
    helka: str,
) -> list[DuplicateCandidate]:
    """
    מחפש פרויקטים דומים בתוך ה-tenant לפי שם, גוש וחלקה.
    מחזיר רשימה ממויינת לפי ציון דמיון.
    """
    existing = (
        db.query(models.Project)
        .filter(
            models.Project.tenant_id == tenant_id,
            models.Project.deleted_at.is_(None),
        )
        .all()
    )

    candidates = []
    for proj in existing:
        # בדיקת התאמה מדויקת על גוש+חלקה
        if str(proj.gush) == str(gush) and str(proj.helka) == str(helka):
            candidates.append(
                DuplicateCandidate(
                    id=str(proj.id),
                    name=proj.name,
                    gush=proj.gush,
                    helka=proj.helka,
                    similarity=1.0,
                )
            )
            continue

        # בדיקת דמיון שמות
        name_score = lev_ratio(name.lower(), proj.name.lower())
        if name_score >= SIMILARITY_THRESHOLD:
            candidates.append(
                DuplicateCandidate(
                    id=str(proj.id),
                    name=proj.name,
                    gush=proj.gush,
                    helka=proj.helka,
                    similarity=round(name_score, 3),
                )
            )

    candidates.sort(key=lambda c: c.similarity, reverse=True)
    return candidates


# ---------------------------------------------------------------------------
# Pydantic schemas for structured AI output
# ---------------------------------------------------------------------------

class ProjectTriage(BaseModel):
    """תוצאת ה-triage של Claude Haiku לפרויקט חדש."""
    name: str
    gush: Optional[str] = None
    helka: Optional[str] = None
    suggested_stages: list[str]
    notes: Optional[str] = None


class DocumentAnalysis(BaseModel):
    """תוצאת הניתוח של Claude Sonnet למסמך."""
    summary: str
    key_dates: list[str]
    action_items: list[str]
    risk_level: str  # low / medium / high
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# AI clients
# ---------------------------------------------------------------------------

def _get_client() -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY לא מוגדר ב-.env")
    return anthropic.Anthropic(api_key=api_key)


# ---------------------------------------------------------------------------
# AI Triage — Claude Haiku
# ---------------------------------------------------------------------------

_TRIAGE_SYSTEM = """
אתה מסייע לחברת נדל"ן ישראלית לקלוט פרויקטים חדשים.
קרא את הטקסט שהמשתמש מספק ומלא את שדות ה-JSON הבאים:
- name: שם הפרויקט
- gush: מספר גוש (אם מוזכר)
- helka: מספר חלקה (אם מוזכר)
- suggested_stages: רשימת שלבים מוצעים לפרויקט (בעברית)
- notes: הערות חשובות (אם יש)

החזר JSON בלבד ללא טקסט נוסף.
"""


def triage_project(text: str) -> ProjectTriage:
    """
    Claude Haiku קורא תיאור חופשי של פרויקט ומחזיר structured output.
    """
    client = _get_client()
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=_TRIAGE_SYSTEM,
        messages=[{"role": "user", "content": text}],
    )
    raw = message.content[0].text.strip()
    # נוודא שהתוצאה היא JSON תקני
    import json
    data = json.loads(raw)
    return ProjectTriage(**data)


# ---------------------------------------------------------------------------
# AI Analysis — Claude Sonnet
# ---------------------------------------------------------------------------

_ANALYSIS_SYSTEM = """
אתה מנתח מסמכים עבור חברת נדל"ן ותכנון ישראלית.
קרא את תוכן המסמך וספק JSON עם השדות הבאים:
- summary: תקציר קצר (עד 3 משפטים)
- key_dates: תאריכים חשובים שמוזכרים (רשימה)
- action_items: פעולות נדרשות (רשימה)
- risk_level: רמת סיכון - low / medium / high
- notes: הערות נוספות (אם יש)

החזר JSON בלבד ללא טקסט נוסף.
"""


def analyse_document(content: str) -> DocumentAnalysis:
    """
    Claude Sonnet מנתח תוכן מסמך ומחזיר structured output.
    """
    client = _get_client()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=_ANALYSIS_SYSTEM,
        messages=[{"role": "user", "content": content}],
    )
    raw = message.content[0].text.strip()
    import json
    data = json.loads(raw)
    return DocumentAnalysis(**data)


# ---------------------------------------------------------------------------
# Phase 4 — Email Pipeline
# ---------------------------------------------------------------------------

class EmailTriageResult(BaseModel):
    """תוצאת Triage — האם המייל רלוונטי לעבודה?"""
    is_relevant: bool
    confidence: float
    reason: str


class EmailAnalysisResult(BaseModel):
    """תוצאת Analysis מעמיקה של מייל."""
    project_name_guess: Optional[str] = None   # שם הפרויקט כפי שמוזכר במייל
    confidence_project_match: float = 0.0
    suggested_task_name: str
    suggested_priority: str  # low / medium / high / urgent
    suggested_assignee: Optional[str] = None
    suggested_due_date: Optional[str] = None   # ISO date string
    has_attachments: bool = False
    budget_mentioned: Optional[float] = None
    notes: Optional[str] = None


_EMAIL_TRIAGE_SYSTEM = """
אתה מסנן מיילים עבור חברת נדל"ן ותכנון ישראלית.
קרא את נושא המייל, השולח, ו-100 המילים הראשונות.
החלט האם המייל רלוונטי לעבודה (פרויקטים, רשויות, קבלנים, היתרים, משימות, פגישות).

החזר JSON בלבד:
{
  "is_relevant": true/false,
  "confidence": 0.0-1.0,
  "reason": "הסבר קצר"
}
"""

_EMAIL_ANALYSIS_SYSTEM = """
אתה עוזר ניהול פרויקטים לחברת נדל"ן ישראלית.
קרא את המייל המלא וזהה:
- לאיזה פרויקט הוא שייך (לפי שם/גוש/חלקה אם מוזכר)
- מהי המשימה המוצעת
- מי הנמען המתאים
- האם יש תאריך יעד
- האם יש קבצים מצורפים
- האם מוזכר סכום כסף

החזר JSON בלבד:
{
  "project_name_guess": "שם הפרויקט או null",
  "confidence_project_match": 0.0-1.0,
  "suggested_task_name": "שם המשימה",
  "suggested_priority": "low/medium/high/urgent",
  "suggested_assignee": "שם או null",
  "suggested_due_date": "YYYY-MM-DD או null",
  "has_attachments": true/false,
  "budget_mentioned": 0.0 או null,
  "notes": "הערות נוספות או null"
}
"""


def triage_email(sender: str, subject: str, body_preview: str) -> EmailTriageResult:
    """
    Step 1 — Claude Haiku: האם המייל רלוונטי? מהיר וזול.
    """
    import json
    client = _get_client()
    user_content = f"שולח: {sender}\nנושא: {subject}\nתוכן: {body_preview}"
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        system=_EMAIL_TRIAGE_SYSTEM,
        messages=[{"role": "user", "content": user_content}],
    )
    data = json.loads(message.content[0].text.strip())
    return EmailTriageResult(**data)


def analyse_email(
    sender: str,
    subject: str,
    full_body: str,
    project_names: list[str],
) -> EmailAnalysisResult:
    """
    Step 2 — Claude Sonnet: ניתוח מעמיק של המייל + התאמה לפרויקטים.
    """
    import json
    client = _get_client()
    projects_str = ", ".join(project_names) if project_names else "אין פרויקטים"
    user_content = (
        f"שולח: {sender}\nנושא: {subject}\n"
        f"פרויקטים קיימים במערכת: {projects_str}\n\n"
        f"תוכן המייל:\n{full_body}"
    )
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=_EMAIL_ANALYSIS_SYSTEM,
        messages=[{"role": "user", "content": user_content}],
    )
    data = json.loads(message.content[0].text.strip())
    return EmailAnalysisResult(**data)
