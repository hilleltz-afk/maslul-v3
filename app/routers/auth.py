"""
Google OAuth 2.0 authentication endpoints:
- GET /auth/login    → redirect לדף ההתחברות של Google
- GET /auth/callback → קבלת code, החלפה ב-token, החזרת JWT
"""

import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, quote

import requests as http_requests
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .. import models
from ..deps import get_db
from ..email import notify_pending_user

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# הגדרות סביבה
# ---------------------------------------------------------------------------

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8000/auth/callback")
SECRET_KEY = os.getenv("SECRET_KEY", "maslul-dev-secret-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 7  # 7 days


# ---------------------------------------------------------------------------
# פונקציות עזר
# ---------------------------------------------------------------------------

def create_access_token(user: models.User) -> str:
    """יוצר JWT token למשתמש."""
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": str(user.id),
        "tenant_id": str(user.tenant_id),
        "email": user.email,
        "name": user.name,
        "role": user.role or "member",
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/login", summary="כניסה עם Google")
def login():
    """מפנה את המשתמש לדף ההתחברות של Google."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth לא מוגדר בשרת. הגדר GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET ב-.env",
        )
    state = secrets.token_urlsafe(16)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    response = RedirectResponse(url=auth_url)
    response.set_cookie("oauth_state", state, httponly=True, samesite="lax", max_age=300)
    return response


@router.get("/callback", summary="קריאה חוזרת מ-Google")
def callback(
    code: str,
    state: str | None = None,
    oauth_state: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    """
    Google מפנה לכאן לאחר אישור המשתמש.
    מחליף את ה-code ב-token, מזהה את המשתמש ומחזיר JWT.
    """
    # החלפת code ב-access_token
    try:
        token_resp = http_requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise ValueError("לא התקבל access_token")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"אימות Google נכשל: {str(e)}",
        )

    # שלוף מידע על המשתמש מה-Google userinfo endpoint
    try:
        resp = http_requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        resp.raise_for_status()
        id_info = resp.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="לא ניתן לשלוף פרטי משתמש מ-Google",
        )

    google_id = id_info.get("sub", "")
    email = id_info.get("email", "")
    name = id_info.get("name", email)

    # חפש משתמש לפי google_id
    user = (
        db.query(models.User)
        .filter(
            models.User.google_id == google_id,
            models.User.deleted_at.is_(None),
        )
        .first()
    )

    # אם לא נמצא לפי google_id, חפש לפי מייל וקשר את google_id
    if not user:
        user = (
            db.query(models.User)
            .filter(
                models.User.email == email,
                models.User.deleted_at.is_(None),
            )
            .first()
        )
        if user:
            user.google_id = google_id
            db.commit()
            db.refresh(user)

    if not user:
        # Create a pending user — admin will need to approve
        # Find the first tenant (single-tenant setup)
        from sqlalchemy import text
        tenant = db.execute(text("SELECT id FROM tenants WHERE deleted_at IS NULL LIMIT 1")).fetchone()
        if tenant:
            import uuid as _uuid
            new_user = models.User(
                id=_uuid.uuid4(),
                tenant_id=str(tenant[0]),
                email=email,
                name=name,
                google_id=google_id,
                role="member",
                status="pending",
            )
            db.add(new_user)
            db.commit()
            # Notify admins by email
            try:
                admins = db.query(models.User).filter(
                    models.User.tenant_id == str(tenant[0]),
                    models.User.role.in_(["admin", "super_admin"]),
                    models.User.status == "active",
                    models.User.deleted_at.is_(None),
                ).all()
                admin_emails = [a.email for a in admins if a.email]
                if admin_emails:
                    notify_pending_user(admin_emails, name, email)
            except Exception:
                pass

        frontend_url = os.getenv("FRONTEND_URL", "")
        pending_url = f"{frontend_url}/login?pending=1" if frontend_url else "/login?pending=1"
        return RedirectResponse(url=pending_url)

    if user.status == "pending":
        frontend_url = os.getenv("FRONTEND_URL", "")
        pending_url = f"{frontend_url}/login?pending=1" if frontend_url else "/login?pending=1"
        return RedirectResponse(url=pending_url)

    if user.status == "rejected":
        frontend_url = os.getenv("FRONTEND_URL", "")
        rejected_url = f"{frontend_url}/login?rejected=1" if frontend_url else "/login?rejected=1"
        return RedirectResponse(url=rejected_url)

    token = create_access_token(user)

    # אם יש FRONTEND_URL — עשה redirect לפרונטאנד עם ה-token
    frontend_url = os.getenv("FRONTEND_URL", "")
    if frontend_url:
        return RedirectResponse(url=f"{frontend_url}/auth-callback?token={quote(token)}")

    # fallback — החזר JSON (לפיתוח / API ישיר)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "tenant_id": str(user.tenant_id),
        },
    }


@router.get("/me", summary="פרטי המשתמש המחובר")
def get_me(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    """מחזיר את פרטי המשתמש לפי JWT token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="נדרשת התחברות")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="טוקן לא תקין")

    user = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.deleted_at.is_(None),
    ).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="משתמש לא נמצא")
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "tenant_id": str(user.tenant_id),
        "role": user.role or "member",
        "status": user.status or "active",
    }
