"""
סיכומי פגישות — עיבוד AI, עריכה, יצירת משימות, הפקת PDF.
"""
import base64
import json
import os
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

    prompt = f"""אתה עוזר מנהלתי של חברת נדל"ן. קיבלת מסמך PDF של פגישה עבור הפרויקט: "{project_name}".
חלץ ממנו סיכום פגישה מסודר.

החזר JSON בלבד (ללא markdown, ללא ```) בפורמט הבא:
{{
  "title": "כותרת הפגישה",
  "meeting_date": "תאריך בפורמט DD.MM.YYYY אם מוזכר, אחרת null",
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
}}"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        extra_headers={"anthropic-beta": "pdfs-2024-09-25"},
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

    text = message.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


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
        structured = _process_pdf_with_claude(pdf_bytes, project.name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"שגיאה בניתוח PDF: {str(e)}")

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
