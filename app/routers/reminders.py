"""
תזכורות אוטומטיות — דייג'סט שבועי/יומי.
שולח מייל לכל מנהלי הטנאנט עם:
  • מסמכים פגי תוקף (30 ימים קדימה + שכבר פגו)
  • משימות באיחור
"""
import os
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..deps import get_db
from ..email import _send

router = APIRouter(prefix="/tenants/{tenant_id}/reminders", tags=["reminders"])

APP_URL = os.getenv("APP_URL", "https://maslul-v3.vercel.app")


def _fmt_date(dt) -> str:
    if dt is None:
        return ""
    if isinstance(dt, str):
        return dt[:10]
    return dt.strftime("%d/%m/%Y")


STATUS_HE = {
    "in_progress": "בעבודה",
    "done": "בוצע",
    "delayed": "בעיכוב",
    "rejected": "נדחה",
    "partial": "בוצע חלקית",
}
PRIORITY_HE = {"high": "גבוהה", "medium": "בינונית", "low": "נמוכה"}


@router.post("/digest")
def send_digest(tenant_id: UUID, db: Session = Depends(get_db)):
    """שולח דייג'סט מסמכים ומשימות לכל מנהלי הטנאנט."""
    now = datetime.now(timezone.utc)
    today = now.date()
    in_30 = today + timedelta(days=30)

    # --- Admin recipients ---
    admins = (
        db.query(models.User)
        .filter(
            models.User.tenant_id == str(tenant_id),
            models.User.role.in_(["admin", "super_admin"]),
            models.User.status == "active",
            models.User.deleted_at.is_(None),
        )
        .all()
    )
    recipients = [u.email for u in admins if u.email]
    if not recipients:
        return {"sent": False, "reason": "אין נמענים"}

    # --- Expiring / expired documents ---
    docs = (
        db.query(models.Document)
        .filter(
            models.Document.tenant_id == str(tenant_id),
            models.Document.deleted_at.is_(None),
            models.Document.expiry_date.isnot(None),
            models.Document.expiry_date <= in_30,
        )
        .order_by(models.Document.expiry_date)
        .all()
    )
    proj_ids = list({str(d.project_id) for d in docs if d.project_id})
    proj_map: dict[str, str] = {}
    if proj_ids:
        projs = db.query(models.Project).filter(models.Project.id.in_(proj_ids)).all()
        proj_map = {str(p.id): p.name for p in projs}

    # --- Overdue tasks ---
    overdue_tasks = (
        db.query(models.Task)
        .filter(
            models.Task.tenant_id == str(tenant_id),
            models.Task.deleted_at.is_(None),
            models.Task.status != "done",
            models.Task.end_date.isnot(None),
            models.Task.end_date < now,
        )
        .order_by(models.Task.end_date)
        .all()
    )
    task_proj_ids = list({str(t.project_id) for t in overdue_tasks if t.project_id} - set(proj_ids))
    if task_proj_ids:
        more = db.query(models.Project).filter(models.Project.id.in_(task_proj_ids)).all()
        proj_map.update({str(p.id): p.name for p in more})

    assignee_ids = list({str(t.assignee_id) for t in overdue_tasks if t.assignee_id})
    user_map: dict[str, str] = {}
    if assignee_ids:
        users = db.query(models.User).filter(models.User.id.in_(assignee_ids)).all()
        user_map = {str(u.id): u.name for u in users}

    if not docs and not overdue_tasks:
        return {"sent": False, "reason": "אין מסמכים פגים ואין משימות באיחור"}

    # --- Build HTML ---
    html = f"""
<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; color: #333;">
  <div style="background:#011e41;padding:20px 28px;border-radius:10px 10px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:20px;">מסלול — סיכום שבועי</h1>
    <p style="color:#a0b4c8;margin:4px 0 0;font-size:13px;">{today.strftime("%d/%m/%Y")}</p>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px 28px;border-radius:0 0 10px 10px;">
"""

    # Documents section
    if docs:
        html += """
    <h2 style="color:#e67e22;font-size:16px;margin-bottom:12px;">📄 מסמכים הדורשים טיפול</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="background:#fef3c7;color:#92400e;">
        <th style="padding:8px;text-align:right;border-bottom:2px solid #fcd34d;">מסמך</th>
        <th style="padding:8px;text-align:right;border-bottom:2px solid #fcd34d;">פרויקט</th>
        <th style="padding:8px;text-align:right;border-bottom:2px solid #fcd34d;">תאריך תוקף</th>
        <th style="padding:8px;text-align:right;border-bottom:2px solid #fcd34d;">סטטוס</th>
      </tr>
"""
        for d in docs:
            exp = d.expiry_date.date() if hasattr(d.expiry_date, "date") else d.expiry_date
            days_left = (exp - today).days if exp else None
            if days_left is not None and days_left < 0:
                status_txt = f'<span style="color:#c0392b;font-weight:bold;">פג תוקף לפני {abs(days_left)} ימים</span>'
            elif days_left == 0:
                status_txt = '<span style="color:#c0392b;font-weight:bold;">פג היום</span>'
            else:
                status_txt = f'<span style="color:#e67e22;">עוד {days_left} ימים</span>'
            proj_name = proj_map.get(str(d.project_id), "—") if d.project_id else "—"
            html += f"""
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:8px;">{d.name}</td>
        <td style="padding:8px;color:#666;">{proj_name}</td>
        <td style="padding:8px;color:#666;">{_fmt_date(d.expiry_date)}</td>
        <td style="padding:8px;">{status_txt}</td>
      </tr>"""
        html += "\n    </table>\n"

    # Overdue tasks section
    if overdue_tasks:
        html += """
    <h2 style="color:#c0392b;font-size:16px;margin-bottom:12px;margin-top:28px;">⚠️ משימות באיחור</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="background:#fef2f2;color:#7f1d1d;">
        <th style="padding:8px;text-align:right;border-bottom:2px solid #fca5a5;">משימה</th>
        <th style="padding:8px;text-align:right;border-bottom:2px solid #fca5a5;">פרויקט</th>
        <th style="padding:8px;text-align:right;border-bottom:2px solid #fca5a5;">אחראי</th>
        <th style="padding:8px;text-align:right;border-bottom:2px solid #fca5a5;">תאריך סיום</th>
        <th style="padding:8px;text-align:right;border-bottom:2px solid #fca5a5;">עדיפות</th>
      </tr>
"""
        for t in overdue_tasks[:20]:  # cap at 20
            end = t.end_date.date() if hasattr(t.end_date, "date") else t.end_date
            days_late = (today - end).days if end else 0
            proj_name = proj_map.get(str(t.project_id), "—") if t.project_id else "—"
            assignee = user_map.get(str(t.assignee_id), "—") if t.assignee_id else "—"
            prio_color = {"high": "#c0392b", "medium": "#e67e22", "low": "#27ae60"}.get(t.priority, "#666")
            html += f"""
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:8px;">{t.title}</td>
        <td style="padding:8px;color:#666;">{proj_name}</td>
        <td style="padding:8px;color:#666;">{assignee}</td>
        <td style="padding:8px;color:#c0392b;">איחור {days_late}י׳</td>
        <td style="padding:8px;color:{prio_color};font-weight:bold;">{PRIORITY_HE.get(t.priority, t.priority)}</td>
      </tr>"""
        if len(overdue_tasks) > 20:
            html += f'\n      <tr><td colspan="5" style="padding:8px;color:#666;text-align:center;">+ עוד {len(overdue_tasks)-20} משימות</td></tr>'
        html += "\n    </table>\n"

    html += f"""
    <div style="margin-top:28px;text-align:center;">
      <a href="{APP_URL}" style="background:#011e41;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
        פתח את מסלול
      </a>
    </div>
  </div>
</div>
"""

    doc_count = len(docs)
    task_count = len(overdue_tasks)
    subject = f"מסלול — {doc_count} מסמכים + {task_count} משימות באיחור" if doc_count and task_count \
        else f"מסלול — {doc_count} מסמכים פגי תוקף" if doc_count \
        else f"מסלול — {task_count} משימות באיחור"

    ok = _send(recipients, subject, html)
    return {
        "sent": ok,
        "recipients": recipients,
        "doc_count": doc_count,
        "task_count": task_count,
    }
