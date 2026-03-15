"""
Gmail Integration — חיבור Gmail, שליפת מיילים, והעברה ל-Pipeline.
"""
import base64
import os
import secrets
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode
from uuid import UUID

import requests as http_requests
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Response
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .. import ai as ai_service
from .. import models
from ..deps import get_db

router = APIRouter(prefix="/auth/gmail", tags=["gmail"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GMAIL_REDIRECT_URI = os.getenv("GMAIL_REDIRECT_URI", "http://localhost:8000/auth/gmail/callback")
SECRET_KEY = os.getenv("SECRET_KEY", "maslul-dev-secret-change-in-production")
ALGORITHM = "HS256"
GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"


def _get_user_from_token(authorization: Optional[str], db: Session) -> models.User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="נדרשת התחברות")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="טוקן לא תקין")
    user = db.query(models.User).filter(models.User.id == user_id, models.User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    return user


@router.get("/connect")
def gmail_connect(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    """מתחיל את תהליך חיבור Gmail — מפנה ל-Google עם scope של gmail.readonly."""
    user = _get_user_from_token(authorization, db)
    state = secrets.token_urlsafe(16)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GMAIL_REDIRECT_URI,
        "response_type": "code",
        "scope": f"openid email {GMAIL_SCOPE}",
        "state": f"{state}:{user.id}",
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return {"url": auth_url}


@router.get("/callback")
def gmail_callback(
    code: str,
    state: str | None = None,
    db: Session = Depends(get_db),
):
    """Google מחזיר לכאן — שומר refresh_token."""
    user_id = None
    if state and ":" in state:
        user_id = state.split(":", 1)[1]

    try:
        token_resp = http_requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GMAIL_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()
        refresh_token = token_data.get("refresh_token")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"שגיאה בחיבור Gmail: {str(e)}")

    if user_id and refresh_token:
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user:
            user.gmail_refresh_token = refresh_token
            db.commit()

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    return RedirectResponse(url=f"{frontend_url}/pipeline?gmail_connected=1")


@router.get("/status")
def gmail_status(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    """בדיקה אם Gmail מחובר למשתמש הנוכחי."""
    user = _get_user_from_token(authorization, db)
    connected = bool(getattr(user, "gmail_refresh_token", None))
    return {"connected": connected, "email": user.email if connected else None}


def _refresh_access_token(refresh_token: str) -> str:
    resp = http_requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _decode_body(payload: dict) -> str:
    """מחלץ גוף מייל מ-payload של Gmail API."""
    body = ""
    if "parts" in payload:
        for part in payload["parts"]:
            if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
                body = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="ignore")
                break
    elif payload.get("body", {}).get("data"):
        body = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="ignore")
    return body[:3000]


@router.post("/fetch")
def fetch_gmail(
    tenant_id: UUID,
    max_results: int = 10,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    """שולף מיילים חדשים מ-Gmail ומוסיף ל-pipeline."""
    user = _get_user_from_token(authorization, db)
    refresh_token = getattr(user, "gmail_refresh_token", None)
    if not refresh_token:
        raise HTTPException(status_code=400, detail="Gmail לא מחובר. חבר תחילה.")

    try:
        access_token = _refresh_access_token(refresh_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"שגיאה בחידוש token: {str(e)}")

    headers = {"Authorization": f"Bearer {access_token}"}

    # שלוף רשימת הודעות
    list_resp = http_requests.get(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        params={"maxResults": max_results, "labelIds": "INBOX", "q": "is:unread"},
        headers=headers,
        timeout=15,
    )
    list_resp.raise_for_status()
    messages = list_resp.json().get("messages", [])

    added = 0
    skipped = 0

    for msg_ref in messages:
        msg_id = msg_ref["id"]

        # בדיקה אם כבר קיים ב-pipeline
        exists = db.query(models.EmailPipelineItem).filter(
            models.EmailPipelineItem.gmail_message_id == msg_id,
        ).first()
        if exists:
            skipped += 1
            continue

        # שלוף פרטי הודעה
        msg_resp = http_requests.get(
            f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}",
            params={"format": "full"},
            headers=headers,
            timeout=15,
        )
        if not msg_resp.ok:
            continue
        msg_data = msg_resp.json()

        hdrs = {h["name"].lower(): h["value"] for h in msg_data.get("payload", {}).get("headers", [])}
        sender = hdrs.get("from", "unknown")
        subject = hdrs.get("subject", "(ללא נושא)")
        body = _decode_body(msg_data.get("payload", {}))

        now = datetime.now(timezone.utc)

        # Triage with Claude Haiku
        try:
            triage = ai_service.triage_email(sender, subject, body[:500])
        except Exception:
            triage = None

        pipeline_status = models.EmailPipelineStatus.PENDING
        item = models.EmailPipelineItem(
            tenant_id=tenant_id,
            gmail_message_id=msg_id,
            sender=sender,
            subject=subject,
            body_preview=body[:500],
            full_body=body,
            status=pipeline_status,
            created_at=now,
            updated_at=now,
            created_by=str(user.id),
        )

        if triage:
            item.triage_is_relevant = 1 if triage.is_relevant else 0
            item.triage_confidence = triage.confidence
            item.triage_reason = triage.reason
            if not triage.is_relevant:
                item.status = models.EmailPipelineStatus.TRIAGED_OUT
            else:
                # Analysis with Claude Sonnet
                try:
                    projects = db.query(models.Project).filter(
                        models.Project.tenant_id == str(tenant_id),
                        models.Project.deleted_at.is_(None),
                    ).all()
                    project_names = [p.name for p in projects]
                    analysis = ai_service.analyse_email(sender, subject, body, project_names)

                    matched_project_id = None
                    if analysis.project_name_guess and projects:
                        candidates = ai_service.find_duplicate_projects(
                            db=db, tenant_id=str(tenant_id),
                            name=analysis.project_name_guess, gush="", helka="",
                        )
                        if candidates and candidates[0].similarity >= 0.7:
                            matched_project_id = candidates[0].id

                    item.suggested_project_id = matched_project_id
                    item.project_match_confidence = analysis.confidence_project_match
                    item.suggested_task_name = analysis.suggested_task_name
                    item.suggested_priority = analysis.suggested_priority
                    item.suggested_assignee = analysis.suggested_assignee
                    item.has_attachments = 1 if analysis.has_attachments else 0
                    item.budget_mentioned = analysis.budget_mentioned
                    item.analysis_notes = analysis.notes
                except Exception:
                    pass  # Analysis failed — still save as PENDING

        db.add(item)
        added += 1

    db.commit()
    return {"added": added, "skipped": skipped, "total_found": len(messages)}
