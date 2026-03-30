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
    suggested_due_date: Optional[str] = None   # ISO date string YYYY-MM-DD
    has_attachments: bool = False
    budget_mentioned: Optional[float] = None
    notes: Optional[str] = None
    matched_contact_name: Optional[str] = None  # שם איש קשר שזוהה לפי אימייל


_EMAIL_TRIAGE_SYSTEM = """
אתה מסנן מיילים עבור חברת נדל"ן ותכנון ישראלית בשם Hadas Capital.
קרא את נושא המייל, השולח, ו-100 המילים הראשונות.

מיילים רלוונטיים: פרויקטים, רשויות תכנון, קבלנים, היתרי בנייה, חוזים, תשלומים, פגישות עסקיות,
 אישורים, עיריות, ועדות, בנקים, עורכי דין, שמאים, מודדים, מחירים, לוחות זמנים.

מיילים לא רלוונטיים: ניוזלטרים, פרסומות, מיילים אישיים לחלוטין, אישורי הרשמה אוטומטיים,
 עדכוני תוכנה, חשבוניות שירות אחזקה כלליות שאינן קשורות לפרויקט.

החזר JSON בלבד (ללא ```):
{
  "is_relevant": true/false,
  "confidence": 0.0-1.0,
  "reason": "הסבר קצר בעברית"
}
"""

_EMAIL_ANALYSIS_SYSTEM = """
אתה עוזר ניהול פרויקטים לחברת נדל"ן ישראלית בשם Hadas Capital.
קרא את המייל המלא וזהה את הפרטים הבאים:

1. לאיזה פרויקט הוא שייך — השווה לרשימת הפרויקטים שסופקה. חפש שמות, מספרי גוש/חלקה, כתובות, שמות שולחים.
   אם יש היסטוריית שיוכים קודמים — השתמש בה כרמז חזק.
2. מהי המשימה הנדרשת — נסח בעברית, ברורה ותמציתית.
3. רמת עדיפות — urgent אם יש דדליין קרוב / דחיפות מפורשת, high אם דורש פעולה מהירה, medium ברירת מחדל.
4. תאריך יעד — אם מוזכר תאריך ספציפי בטקסט.
5. סכום כסף — אם מוזכר סכום (בש"ח, ₪, ILS, דולרים וכו').

החזר JSON בלבד (ללא ```):
{
  "project_name_guess": "שם הפרויקט כפי שמוזכר במייל, או null",
  "confidence_project_match": 0.0-1.0,
  "suggested_task_name": "שם המשימה בעברית",
  "suggested_priority": "low/medium/high/urgent",
  "suggested_assignee": "שם איש צוות רלוונטי אם מוזכר, או null",
  "suggested_due_date": "YYYY-MM-DD אם מוזכר תאריך, אחרת null",
  "has_attachments": true/false,
  "budget_mentioned": סכום מספרי בש\"ח אם מוזכר אחרת null,
  "notes": "הערות תמציתיות לגבי תוכן המייל, או null"
}
"""


def _parse_json(raw: str) -> dict:
    """פרסור JSON עם סטריפ של code fences אם קיימות."""
    import json, re
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw.strip())


def triage_email(sender: str, subject: str, body_preview: str) -> EmailTriageResult:
    """
    Step 1 — Claude Haiku: האם המייל רלוונטי? מהיר וזול.
    """
    client = _get_client()
    user_content = f"שולח: {sender}\nנושא: {subject}\nתוכן: {body_preview}"
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        system=_EMAIL_TRIAGE_SYSTEM,
        messages=[{"role": "user", "content": user_content}],
    )
    data = _parse_json(message.content[0].text)
    return EmailTriageResult(**data)


def analyse_email(
    sender: str,
    subject: str,
    full_body: str,
    projects: list[dict],         # [{"id": ..., "name": ..., "gush": ..., "helka": ..., "address": ...}]
    contact_context: str = "",    # e.g. "שולח מזוהה: דוד לוי (עו\"ד)"
    past_corrections: list[dict] = [],  # [{"sender": ..., "subject": ..., "project_name": ...}]
) -> EmailAnalysisResult:
    """
    Step 2 — Claude Sonnet: ניתוח מעמיק של המייל + התאמה לפרויקטים.
    """
    client = _get_client()

    # בניית תיאור פרויקטים עשיר
    if projects:
        proj_lines = []
        for p in projects:
            parts = [p["name"]]
            if p.get("gush") and p.get("helka"):
                parts.append(f"גוש {p['gush']} חלקה {p['helka']}")
            if p.get("address"):
                parts.append(p["address"])
            proj_lines.append("• " + " | ".join(parts))
        projects_str = "\n".join(proj_lines)
    else:
        projects_str = "אין פרויקטים"

    # בניית היסטוריית שיוכים קודמים כ-few-shot
    history_str = ""
    if past_corrections:
        lines = []
        for c in past_corrections[:10]:  # מקסימום 10 דוגמאות
            lines.append(f"• שולח: {c['sender']} | נושא: {c['subject'][:60]} → פרויקט: {c['project_name']}")
        history_str = "\nשיוכים קודמים שאושרו על ידי המשתמש (השתמש כרמז):\n" + "\n".join(lines) + "\n"

    contact_line = f"\n{contact_context}" if contact_context else ""
    user_content = (
        f"שולח: {sender}{contact_line}\n"
        f"נושא: {subject}\n"
        f"{history_str}\n"
        f"פרויקטים קיימים במערכת:\n{projects_str}\n\n"
        f"תוכן המייל:\n{full_body}"
    )
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=_EMAIL_ANALYSIS_SYSTEM,
        messages=[{"role": "user", "content": user_content}],
    )
    data = _parse_json(message.content[0].text)
    return EmailAnalysisResult(**data)


# ---------------------------------------------------------------------------
# Meeting Notes Processing
# ---------------------------------------------------------------------------

def process_meeting_notes(raw_text: str, project_name: str) -> dict:
    """מעבד טקסט גולמי של פגישה ומחזיר מבנה מסודר."""
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    prompt = f"""אתה עוזר מנהלתי של חברת נדל"ן. קיבלת טקסט גולמי מפגישה עבור הפרויקט: "{project_name}".
עליך לחלץ ממנו סיכום פגישה מסודר.

החזר JSON בלבד (ללא markdown, ללא ```) בפורמט הבא:
{{
  "title": "כותרת הפגישה (קצר, לדוגמא: סיכום פגישת תכנון ראשונית)",
  "meeting_date": "תאריך הפגישה בפורמט DD.MM.YYYY אם מוזכר, אחרת null",
  "participants": ["שם1", "שם2"],
  "overview": "סקירה כללית של הנושאים שנדונו (2-4 משפטים)",
  "decisions": ["החלטה 1", "החלטה 2"],
  "action_items": [
    {{
      "title": "תיאור המשימה",
      "assignee": "שם האחראי אם מוזכר, אחרת null",
      "due_date": "YYYY-MM-DD אם מוזכר, אחרת null",
      "notes": "הערות נוספות אם יש"
    }}
  ]
}}

טקסט הפגישה:
{raw_text}"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    import json
    text = response.content[0].text.strip()
    # נקה markdown אם יש
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    return json.loads(text)
