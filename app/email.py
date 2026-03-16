"""
שירות שליחת מיילים — Resend
מוגדר ב-.env:
  RESEND_API_KEY=re_...
  RESEND_FROM=Hadas Capital <noreply@hadas-capital.com>
"""
import os
import logging

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv("RESEND_FROM", "Hadas Capital <noreply@hadas-capital.com>")


def _send(to: str | list[str], subject: str, html: str) -> bool:
    """שולח מייל דרך Resend API. מחזיר True אם הצליח."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY לא מוגדר — מייל לא נשלח")
        return False
    try:
        import resend as resend_sdk
        resend_sdk.api_key = RESEND_API_KEY
        resend_sdk.Emails.send({
            "from": RESEND_FROM,
            "to": [to] if isinstance(to, str) else to,
            "subject": subject,
            "html": html,
        })
        return True
    except Exception as e:
        logger.error(f"שגיאה בשליחת מייל: {e}")
        return False


def notify_pending_user(admin_emails: list[str], user_name: str, user_email: str):
    """מיידע adminים על משתמש חדש שממתין לאישור."""
    html = f"""
    <div dir="rtl" style="font-family: Arial, sans-serif;">
      <h2 style="color:#011e41;">בקשת כניסה חדשה — מסלול</h2>
      <p><strong>{user_name}</strong> ({user_email}) ביקש/ה גישה למערכת.</p>
      <p>יש לאשר או לדחות את הבקשה בדף <strong>הגדרות → ניהול משתמשים</strong>.</p>
    </div>
    """
    _send(admin_emails, f"בקשת גישה חדשה — {user_name}", html)


def notify_user_approved(user_email: str, user_name: str):
    """מודיע למשתמש שאושר."""
    html = f"""
    <div dir="rtl" style="font-family: Arial, sans-serif;">
      <h2 style="color:#011e41;">הגישה שלך אושרה!</h2>
      <p>שלום {user_name},</p>
      <p>בקשת הגישה שלך למערכת <strong>מסלול — Hadas Capital</strong> אושרה.</p>
      <p>כעת תוכל/י להתחבר עם חשבון Google שלך.</p>
    </div>
    """
    _send(user_email, "הגישה שלך למסלול אושרה", html)


def notify_user_rejected(user_email: str, user_name: str):
    """מודיע למשתמש שנדחה."""
    html = f"""
    <div dir="rtl" style="font-family: Arial, sans-serif;">
      <h2 style="color:#c0392b;">בקשת הגישה לא אושרה</h2>
      <p>שלום {user_name},</p>
      <p>לצערנו בקשת הגישה שלך למערכת <strong>מסלול</strong> לא אושרה.</p>
      <p>לשאלות פנה/י למנהל המערכת.</p>
    </div>
    """
    _send(user_email, "בקשת גישה — מסלול", html)


def notify_user_invited(user_email: str, user_name: str, invited_by: str = ""):
    """שולח למשתמש שהוזמן ישירות על ידי מנהל."""
    inviter_txt = f" על ידי {invited_by}" if invited_by else ""
    html = f"""
    <div dir="rtl" style="font-family: Arial, sans-serif;">
      <h2 style="color:#011e41;">הוזמנת למסלול — Hadas Capital</h2>
      <p>שלום {user_name},</p>
      <p>הוזמנת{inviter_txt} למערכת <strong>מסלול</strong> לניהול פרויקטים.</p>
      <p>על מנת להתחבר, השתמש בכניסה עם Google בחשבון: <strong>{user_email}</strong></p>
    </div>
    """
    _send(user_email, "הוזמנת למסלול — Hadas Capital", html)


def notify_document_expiring(admin_emails: list[str], doc_name: str, days_left: int, project_name: str = ""):
    """התראה על מסמך שעומד לפוג."""
    urgency = "פג תוקף" if days_left <= 0 else f"פג תוקף בעוד {days_left} ימים"
    proj_txt = f" (פרויקט: {project_name})" if project_name else ""
    html = f"""
    <div dir="rtl" style="font-family: Arial, sans-serif;">
      <h2 style="color:#e67e22;">התראת מסמך — מסלול</h2>
      <p>המסמך <strong>{doc_name}</strong>{proj_txt} — <strong>{urgency}</strong>.</p>
      <p>יש לטפל בחידוש המסמך בהקדם.</p>
    </div>
    """
    _send(admin_emails, f"התראה: מסמך {doc_name} — {urgency}", html)
