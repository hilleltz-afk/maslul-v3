"""
סיכומי פגישות — עיבוד AI, עריכה, יצירת משימות, הפקת PDF.
"""
import base64
import io
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import anthropic
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..ai import process_meeting_notes
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/meetings", tags=["meetings"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")

# ---------------------------------------------------------------------------
# Hadas Capital meeting PDF parser (no AI required)
# ---------------------------------------------------------------------------

_DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")
_NUM_RE  = re.compile(r"\d[\d.,\-]*\d|\d")   # numbers, ranges, decimals

# Column indices in pdfplumber's 15-col extraction of the action items table
_C_ASSIGNEE = 0
_C_DUE      = 3
_C_TITLE    = 6
_C_START    = 9


def _cell(row: list, idx: int) -> str:
    if idx < len(row) and row[idx] is not None:
        return str(row[idx]).strip()
    return ""


def _fix_heb(s: str | None) -> str:
    """Reverse RTL Hebrew text extracted in wrong order by pdfplumber.
    Number sequences (3.5, 22-25, etc.) are preserved in their original order.
    Multi-line cells are joined with a space.
    """
    if not s:
        return ""
    s = str(s).strip()
    if not any("֐" <= c <= "׿" for c in s):
        return s  # no Hebrew — dates, ASCII, etc.

    result_lines = []
    for line in s.split("\n"):
        line = line.strip()
        if not line:
            continue

        # Mask numbers so they survive the reversal intact
        placeholders: dict[str, str] = {}
        counter = [0]

        def _mask(m: re.Match) -> str:
            key = f"\x00{counter[0]}\x00"
            placeholders[key] = m.group()
            counter[0] += 1
            return key

        masked = _NUM_RE.sub(_mask, line)
        # Reverse the whole line (fixes Hebrew word+char order)
        rev = masked[::-1]
        # Restore numbers (their keys are also reversed in the string)
        for key, val in placeholders.items():
            rev = rev.replace(key[::-1], val)
        result_lines.append(rev.strip())

    return " ".join(result_lines)


def _last_date(s: str) -> str | None:
    """Return last DD/MM/YYYY found (handles strikethrough + updated date on two lines)."""
    dates = _DATE_RE.findall(s or "")
    return dates[-1] if dates else None


def _to_iso(raw: str) -> str | None:
    d = _last_date(raw)
    if not d:
        return None
    day, mo, yr = d.split("/")
    return f"{yr}-{mo.zfill(2)}-{day.zfill(2)}"


def _to_display(raw: str) -> str | None:
    d = _last_date(raw)
    if not d:
        return None
    day, mo, yr = d.split("/")
    return f"{day.zfill(2)}.{mo.zfill(2)}.{yr}"


def _parse_meeting_pdf(pdf_bytes: bytes) -> dict:
    """Parse a Hadas Capital meeting PDF directly — no AI API call."""
    import pdfplumber

    result: dict = {
        "title": "סיכום פגישה",
        "meeting_date": None,
        "participants": [],
        "overview": "",
        "decisions": [],
        "action_items": [],
    }

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        all_tables: list[list] = []
        for page in pdf.pages:
            all_tables += [t for t in (page.extract_tables() or []) if t]

    if len(all_tables) < 2:
        raise ValueError("מבנה PDF לא מוכר — לא נמצאו טבלאות")

    # --- Table 0: project header + participants ---
    header_table = all_tables[0]
    topic = ""

    for row in header_table[:4]:          # rows 0-3: project info
        label = _fix_heb(_cell(row, 6))
        value_raw = _cell(row, 1)

        if "פרויקט" in label:
            result["title"] = f"ישיבת תכנון — {_fix_heb(value_raw)}"
        elif "נושא" in label:
            topic = _fix_heb(value_raw)
        elif "תאריך" in label and _DATE_RE.search(value_raw):
            result["meeting_date"] = _to_display(value_raw)

    # Rows 5+: participants  (row 4 is the שם/תפקיד/חברה header)
    SKIP_LABELS = {":הצופת", ":םשר"}      # תפוצה, רשם — reversed
    for row in header_table[5:]:
        if _cell(row, 5) in SKIP_LABELS:
            continue
        name    = _fix_heb(_cell(row, 3))
        role    = _fix_heb(_cell(row, 2))
        company = _fix_heb(_cell(row, 0))
        if name:
            result["participants"].append(f"{name} — {role} ({company})")

    # --- Tables 1+: action items ---
    in_previous = False
    SECTION_MARKER_REV = "םימדוק םינוידמ םיאשונ"   # "נושאים מדיונים קודמים" reversed

    for table in all_tables[1:]:
        for row in table:
            if not row or not any(row):
                continue

            # Detect "נושאים מדיונים קודמים" section header (any cell)
            row_text = " ".join(_cell(row, i) for i in range(len(row)) if _cell(row, i))
            if SECTION_MARKER_REV in row_text:
                in_previous = True
                continue

            due_raw   = _cell(row, _C_DUE)
            title_raw = _cell(row, _C_TITLE)

            if not title_raw:
                continue

            title = _fix_heb(title_raw)

            # Skip column-header row (title is exactly "פירוט") or due is "תאריך יעד"
            due_fixed = _fix_heb(due_raw)
            if title == "פירוט" or due_fixed == "תאריך יעד":
                continue

            # "לידיעה" → decision (informational)
            if due_fixed == "לידיעה" or (not _DATE_RE.search(due_raw) and "לידיעה" in due_fixed):
                result["decisions"].append(title)
                continue

            # Action item must have a date in the due column
            if not _DATE_RE.search(due_raw):
                continue

            assignee_raw = _cell(row, _C_ASSIGNEE)
            start_raw    = _cell(row, _C_START)

            result["action_items"].append({
                "title": title,
                "assignee": _fix_heb(assignee_raw) or None,
                "start_date": _to_iso(start_raw),
                "due_date": _to_iso(due_raw),
                "notes": None,
                "section": "previous" if in_previous else "current",
            })

    # --- Generate overview (no AI) ---
    n_cur  = sum(1 for a in result["action_items"] if a["section"] == "current")
    n_prev = sum(1 for a in result["action_items"] if a["section"] == "previous")
    assignees = list(dict.fromkeys(
        a["assignee"] for a in result["action_items"] if a["assignee"]
    ))

    parts = []
    if topic:
        parts.append(f"הפגישה עסקה ב{topic}.")
    if result["meeting_date"]:
        parts.append(f"התקיימה ב-{result['meeting_date']}.")
    if n_cur:
        parts.append(f"הוגדרו {n_cur} משימות חדשות.")
    if n_prev:
        parts.append(f"בנוסף, {n_prev} נושאים פתוחים מפגישות קודמות.")
    if assignees:
        parts.append(f"אחראים: {', '.join(assignees[:6])}.")
    result["overview"] = " ".join(parts)

    return result


def _get_meeting_or_404(db: Session, tenant_id: UUID, meeting_id: UUID) -> models.MeetingSummary:
    m = (
        db.query(models.MeetingSummary)
        .filter(
            models.MeetingSummary.id == meeting_id,
            models.MeetingSummary.tenant_id == tenant_id,
            models.MeetingSummary.deleted_at.is_(None),
        )
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="סיכום פגישה לא נמצא")
    return m


def _json_load(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _meeting_to_schema(m: models.MeetingSummary) -> schemas.MeetingSummaryRead:
    return schemas.MeetingSummaryRead(
        id=m.id,
        project_id=m.project_id,
        title=m.title,
        raw_text=m.raw_text,
        meeting_date=m.meeting_date,
        participants=_json_load(m.participants, []),
        overview=m.overview,
        decisions=_json_load(m.decisions, []),
        action_items=[schemas.ActionItem(**a) for a in _json_load(m.action_items, [])],
        status=m.status,
        document_id=m.document_id,
        created_by=m.created_by,
        created_at=m.created_at,
    )


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[schemas.MeetingSummaryRead])
def list_meetings(
    tenant_id: UUID,
    project_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(models.MeetingSummary).filter(
        models.MeetingSummary.tenant_id == tenant_id,
        models.MeetingSummary.deleted_at.is_(None),
    )
    if project_id:
        q = q.filter(models.MeetingSummary.project_id == project_id)
    meetings = q.order_by(models.MeetingSummary.created_at.desc()).all()
    return [_meeting_to_schema(m) for m in meetings]


# ---------------------------------------------------------------------------
# Process (AI) — creates a draft
# ---------------------------------------------------------------------------

@router.post("/process", response_model=schemas.MeetingSummaryRead)
def process_meeting(
    tenant_id: UUID,
    req: schemas.ProcessMeetingRequest,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    # Fetch project name for context
    project = db.query(models.Project).filter(
        models.Project.id == req.project_id,
        models.Project.tenant_id == tenant_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="פרויקט לא נמצא")

    try:
        structured = process_meeting_notes(req.raw_text, project.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"שגיאה בעיבוד AI: {str(e)}")

    now = datetime.now(timezone.utc)
    meeting = models.MeetingSummary(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        project_id=req.project_id,
        title=structured.get("title", "פגישה"),
        raw_text=req.raw_text,
        meeting_date=structured.get("meeting_date"),
        participants=json.dumps(structured.get("participants") or [], ensure_ascii=False),
        overview=structured.get("overview"),
        decisions=json.dumps(structured.get("decisions") or [], ensure_ascii=False),
        action_items=json.dumps(structured.get("action_items") or [], ensure_ascii=False),
        status="draft",
        created_by=user_id,
        created_at=now,
        updated_at=now,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return _meeting_to_schema(meeting)


# ---------------------------------------------------------------------------
# Upload PDF
# ---------------------------------------------------------------------------

def _process_pdf_with_claude(pdf_bytes: bytes, project_name: str) -> dict:
    """שלח PDF של פגישה ל-Claude לניתוח וחילוץ מבנה."""
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")

    prompt = f"""אתה עוזר מנהלתי של חברת נדל"ן. קיבלת סיכום פגישה בפורמט קבוע של Hadas Capital עבור הפרויקט: "{project_name}".

מבנה המסמך:
- כותרת עם: שם הפרויקט, נושא הדיון, תאריך פגישה, מיקום
- טבלת משתתפים (שלושה עמודות): שם | תפקיד | חברה
- טבלה ראשית עם העמודות: מס' | תאריך רישום | פירוט | תאריך יעד | אחראי
- לעיתים יש חלק "נושאים מדיונים קודמים" בתחתית הטבלה

כללי חילוץ:
1. participants — כל המשתתפים בפורמט "שם — תפקיד (חברה)"
2. overview — כתוב סקירה קצרה של 2-3 משפטים על מה שדנו בפגישה והחלטות מרכזיות. הסק זאת מתוכן הפירוטים, גם אם לא כתוב מפורשות.
3. decisions — שורות עם "לידיעה" בעמודת אחראי (אלו עדכונים/החלטות, לא משימות)
4. action_items — רק שורות עם תאריך יעד ואחראי אמיתי (אדריכל, קונס', מיזוג, יועץ גז, בטיחות, יזם, וכו')
   - title: הפירוט של המשימה
   - assignee: מה שכתוב בעמודת "אחראי"
   - start_date: תאריך הרישום (עמודה 2) — המר DD/MM/YYYY → YYYY-MM-DD
   - due_date: תאריך היעד (עמודה 4) — המר DD/MM/YYYY → YYYY-MM-DD
   - section: "current" לשורות מהפגישה הנוכחית, "previous" לשורות מחלק "נושאים מדיונים קודמים"
5. אל תכלול את שורת "מטרת הפגישה" עצמה כ-action item
6. תאריך הפגישה — מה שמופיע בכותרת המסמך, המר ל-DD.MM.YYYY

קרא לפונקציה extract_meeting_summary עם הנתונים."""

    tool_schema = {
        "name": "extract_meeting_summary",
        "description": "חילוץ סיכום פגישה מובנה מ-PDF",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "meeting_date": {"type": ["string", "null"], "description": "DD.MM.YYYY או null"},
                "participants": {"type": "array", "items": {"type": "string"}},
                "overview": {"type": "string"},
                "decisions": {"type": "array", "items": {"type": "string"}},
                "action_items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "assignee": {"type": ["string", "null"]},
                            "start_date": {"type": ["string", "null"], "description": "YYYY-MM-DD (תאריך רישום)"},
                            "due_date": {"type": ["string", "null"], "description": "YYYY-MM-DD (תאריך יעד)"},
                            "notes": {"type": ["string", "null"]},
                            "section": {
                                "type": "string",
                                "enum": ["current", "previous"],
                                "description": "current=פגישה הנוכחית, previous=נושאים מדיונים קודמים",
                            },
                        },
                        "required": ["title", "assignee", "start_date", "due_date", "notes", "section"],
                    },
                },
            },
            "required": ["title", "meeting_date", "participants", "overview", "decisions", "action_items"],
        },
    }

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        tools=[tool_schema],
        tool_choice={"type": "tool", "name": "extract_meeting_summary"},
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": pdf_b64,
                    },
                },
                {"type": "text", "text": prompt},
            ],
        }],
    )

    for block in message.content:
        if block.type == "tool_use" and block.name == "extract_meeting_summary":
            return block.input

    raise ValueError("Claude לא החזיר נתוני פגישה")


@router.post("/upload-pdf", response_model=schemas.MeetingSummaryRead)
async def upload_pdf_meeting(
    tenant_id: UUID,
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="יש להעלות קובץ PDF")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="הקובץ גדול מדי (מקסימום 10MB)")

    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.tenant_id == tenant_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="פרויקט לא נמצא")

    try:
        structured = _parse_meeting_pdf(pdf_bytes)
    except Exception as parse_err:
        # Fallback to Claude if direct parsing fails (unexpected PDF format)
        try:
            structured = _process_pdf_with_claude(pdf_bytes, project.name)
        except Exception as ai_err:
            raise HTTPException(
                status_code=500,
                detail=f"שגיאה בניתוח PDF: {str(parse_err)} | AI: {str(ai_err)}",
            )

    now = datetime.now(timezone.utc)
    meeting = models.MeetingSummary(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        project_id=project_id,
        title=structured.get("title", file.filename),
        raw_text=None,
        meeting_date=structured.get("meeting_date"),
        participants=json.dumps(structured.get("participants") or [], ensure_ascii=False),
        overview=structured.get("overview"),
        decisions=json.dumps(structured.get("decisions") or [], ensure_ascii=False),
        action_items=json.dumps(structured.get("action_items") or [], ensure_ascii=False),
        status="draft",
        created_by=user_id,
        created_at=now,
        updated_at=now,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return _meeting_to_schema(meeting)


# ---------------------------------------------------------------------------
# Get
# ---------------------------------------------------------------------------

@router.get("/{meeting_id}", response_model=schemas.MeetingSummaryRead)
def get_meeting(
    tenant_id: UUID,
    meeting_id: UUID,
    db: Session = Depends(get_db),
):
    return _meeting_to_schema(_get_meeting_or_404(db, tenant_id, meeting_id))


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

@router.put("/{meeting_id}", response_model=schemas.MeetingSummaryRead)
def update_meeting(
    tenant_id: UUID,
    meeting_id: UUID,
    data: schemas.MeetingSummaryUpdate,
    db: Session = Depends(get_db),
):
    m = _get_meeting_or_404(db, tenant_id, meeting_id)
    update = data.model_dump(exclude_none=True)

    # Serialize list fields to JSON
    for list_field in ("participants", "decisions"):
        if list_field in update:
            update[list_field] = json.dumps(update[list_field], ensure_ascii=False)
    if "action_items" in update:
        update["action_items"] = json.dumps(
            [a.model_dump() if hasattr(a, "model_dump") else a for a in update["action_items"]],
            ensure_ascii=False,
        )

    for k, v in update.items():
        setattr(m, k, v)
    m.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(m)
    return _meeting_to_schema(m)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

@router.delete("/{meeting_id}")
def delete_meeting(
    tenant_id: UUID,
    meeting_id: UUID,
    db: Session = Depends(get_db),
):
    m = _get_meeting_or_404(db, tenant_id, meeting_id)
    m.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Create tasks from action items
# ---------------------------------------------------------------------------

@router.post("/{meeting_id}/create-tasks")
def create_tasks_from_meeting(
    tenant_id: UUID,
    meeting_id: UUID,
    req: schemas.CreateTasksFromMeetingRequest,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    m = _get_meeting_or_404(db, tenant_id, meeting_id)

    # Verify stage belongs to same project/tenant
    stage = db.query(models.Stage).filter(
        models.Stage.id == req.stage_id,
        models.Stage.tenant_id == tenant_id,
        models.Stage.deleted_at.is_(None),
    ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="קבוצה לא נמצאה")

    now = datetime.now(timezone.utc)
    created = []
    for item in req.items:
        start_date = None
        if item.start_date:
            try:
                start_date = datetime.strptime(item.start_date, "%Y-%m-%d")
            except ValueError:
                pass

        end_date = None
        if item.due_date:
            try:
                end_date = datetime.strptime(item.due_date, "%Y-%m-%d")
            except ValueError:
                pass

        task = models.Task(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            project_id=m.project_id,
            stage_id=req.stage_id,
            title=item.title,
            description=item.notes,
            status="todo",
            priority="medium",
            start_date=start_date,
            end_date=end_date,
            created_at=now,
            updated_at=now,
        )
        db.add(task)
        created.append({"id": str(task.id), "title": task.title})

    # Mark meeting as finalized once tasks created
    m.status = "finalized"
    m.updated_at = now
    db.commit()

    return {"created": created, "count": len(created)}


# ---------------------------------------------------------------------------
# PDF — returns print-ready HTML
# ---------------------------------------------------------------------------

@router.get("/{meeting_id}/pdf", response_class=HTMLResponse)
def meeting_pdf(
    tenant_id: UUID,
    meeting_id: UUID,
    db: Session = Depends(get_db),
):
    m = _get_meeting_or_404(db, tenant_id, meeting_id)

    participants = _json_load(m.participants, [])
    decisions = _json_load(m.decisions, [])
    action_items = _json_load(m.action_items, [])

    def li_list(items: list[str]) -> str:
        return "".join(f"<li>{item}</li>" for item in items)

    def action_rows(items: list[dict]) -> str:
        rows = ""
        for i, a in enumerate(items, 1):
            due = a.get("due_date") or "—"
            assignee = a.get("assignee") or "—"
            notes = a.get("notes") or ""
            rows += f"""
            <tr>
              <td class="num">{i}</td>
              <td class="task-title">{a.get("title","")}</td>
              <td>{assignee}</td>
              <td>{due}</td>
              <td class="notes">{notes}</td>
            </tr>"""
        return rows

    date_str = m.meeting_date or datetime.now(timezone.utc).strftime("%d.%m.%Y")
    participants_str = " | ".join(participants) if participants else "—"

    html = f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>{m.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: 'Heebo', Arial, sans-serif;
    font-size: 11pt;
    color: #1a1a2e;
    background: white;
    padding: 0;
    direction: rtl;
  }}
  .page {{
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 50px;
  }}
  /* Header */
  .header {{
    border-bottom: 3px solid #011e41;
    padding-bottom: 18px;
    margin-bottom: 28px;
  }}
  .company {{
    font-size: 10pt;
    color: #888;
    margin-bottom: 6px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }}
  .doc-type {{
    font-size: 9pt;
    color: #011e41;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }}
  h1 {{
    font-size: 20pt;
    font-weight: 700;
    color: #011e41;
    margin-bottom: 8px;
    line-height: 1.3;
  }}
  .meta {{
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    font-size: 9.5pt;
    color: #555;
    margin-top: 8px;
  }}
  .meta span {{ display: flex; align-items: center; gap: 6px; }}
  .meta .label {{ font-weight: 600; color: #011e41; }}

  /* Sections */
  .section {{
    margin-bottom: 24px;
  }}
  .section-title {{
    font-size: 11pt;
    font-weight: 700;
    color: #011e41;
    border-right: 4px solid #fcd562;
    padding-right: 10px;
    margin-bottom: 10px;
  }}
  p {{
    font-size: 10.5pt;
    line-height: 1.7;
    color: #333;
  }}
  ul {{
    list-style: none;
    padding: 0;
  }}
  ul li {{
    padding: 5px 0;
    padding-right: 18px;
    font-size: 10.5pt;
    line-height: 1.5;
    color: #333;
    position: relative;
  }}
  ul li::before {{
    content: "◆";
    position: absolute;
    right: 0;
    color: #fcd562;
    font-size: 8pt;
    top: 7px;
  }}

  /* Action items table */
  table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
    margin-top: 6px;
  }}
  thead tr {{
    background: #011e41;
    color: white;
  }}
  thead th {{
    padding: 8px 10px;
    text-align: right;
    font-weight: 600;
    font-size: 9pt;
  }}
  tbody tr:nth-child(even) {{ background: #f8f9ff; }}
  tbody tr:hover {{ background: #eef2ff; }}
  tbody td {{
    padding: 7px 10px;
    border-bottom: 1px solid #eee;
    vertical-align: top;
  }}
  td.num {{ color: #aaa; font-size: 8.5pt; text-align: center; width: 28px; }}
  td.task-title {{ font-weight: 500; }}
  td.notes {{ color: #777; font-size: 9pt; }}

  /* Footer */
  .footer {{
    margin-top: 40px;
    padding-top: 14px;
    border-top: 1px solid #ddd;
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    color: #aaa;
  }}
  .status-badge {{
    display: inline-block;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 8.5pt;
    font-weight: 600;
    background: {"#e8fdf2" if m.status == "finalized" else "#fff8e1"};
    color: {"#16a34a" if m.status == "finalized" else "#b45309"};
    border: 1px solid {"#bbf7d0" if m.status == "finalized" else "#fde68a"};
  }}

  /* Print */
  @media print {{
    body {{ padding: 0; }}
    .page {{ padding: 20px 30px; }}
    .no-print {{ display: none !important; }}
    thead {{ display: table-header-group; }}
    tr {{ page-break-inside: avoid; }}
  }}

  /* Print button */
  .print-bar {{
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #011e41;
    color: white;
    padding: 12px 28px;
    border-radius: 30px;
    font-family: 'Heebo', sans-serif;
    font-size: 13pt;
    font-weight: 600;
    cursor: pointer;
    border: none;
    box-shadow: 0 4px 20px rgba(1,30,65,0.4);
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: opacity 0.2s;
  }}
  .print-bar:hover {{ opacity: 0.85; }}
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="company">Hadas Capital</div>
    <div class="doc-type">סיכום פגישה רשמי</div>
    <h1>{m.title}</h1>
    <div class="meta">
      <span><span class="label">תאריך:</span> {date_str}</span>
      <span><span class="label">משתתפים:</span> {participants_str}</span>
      <span class="status-badge">{"מאושר" if m.status == "finalized" else "טיוטה"}</span>
    </div>
  </div>

  <!-- Overview -->
  {"" if not m.overview else f'<div class="section"><div class="section-title">סקירה כללית</div><p>{m.overview}</p></div>'}

  <!-- Decisions -->
  {"" if not decisions else f'<div class="section"><div class="section-title">החלטות</div><ul>{li_list(decisions)}</ul></div>'}

  <!-- Action items -->
  {"" if not action_items else f"""
  <div class="section">
    <div class="section-title">חלוקת משימות</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>משימה</th>
          <th>אחראי</th>
          <th>תאריך יעד</th>
          <th>הערות</th>
        </tr>
      </thead>
      <tbody>
        {action_rows(action_items)}
      </tbody>
    </table>
  </div>"""}

  <!-- Footer -->
  <div class="footer">
    <span>הופק על ידי מסלול — Hadas Capital</span>
    <span>{datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M")}</span>
  </div>
</div>

<!-- Print button -->
<button class="print-bar no-print" onclick="window.print()">
  🖨️ הדפס / שמור PDF
</button>

<script>
  // Auto-focus for keyboard shortcut hints
  document.addEventListener('keydown', function(e) {{
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {{
      // Allow default print
    }}
  }});
</script>
</body>
</html>"""

    return HTMLResponse(content=html)
