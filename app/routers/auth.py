"""
Google OAuth 2.0 authentication endpoints:
- GET /auth/login    → redirect לדף ההתחברות של Google
- GET /auth/callback → קבלת code, החלפה ב-token, החזרת JWT
"""

import os
from datetime import datetime, timedelta, timezone

import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .. import models
from ..deps import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# הגדרות סביבה
# ---------------------------------------------------------------------------

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8000/auth/callback")
SECRET_KEY = os.getenv("SECRET_KEY", "maslul-dev-secret-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


# ---------------------------------------------------------------------------
# פונקציות עזר
# ---------------------------------------------------------------------------

def _build_flow(state: str | None = None) -> Flow:
    """בונה Flow object של Google OAuth."""
    client_config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [REDIRECT_URI],
        }
    }
    return Flow.from_client_config(
        client_config,
        scopes=GOOGLE_SCOPES,
        redirect_uri=REDIRECT_URI,
        state=state,
    )


def create_access_token(user: models.User) -> str:
    """יוצר JWT token למשתמש."""
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": str(user.id),
        "tenant_id": str(user.tenant_id),
        "email": user.email,
        "name": user.name,
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
    flow = _build_flow()
    auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline")
    return RedirectResponse(url=auth_url)


@router.get("/callback", summary="קריאה חוזרת מ-Google")
def callback(
    code: str,
    state: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Google מפנה לכאן לאחר אישור המשתמש.
    מחליף את ה-code ב-token, מזהה את המשתמש ומחזיר JWT.
    """
    try:
        flow = _build_flow(state=state)
        flow.fetch_token(code=code)
        credentials = flow.credentials
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="אימות Google נכשל — קוד לא תקין או פג תוקף",
        )

    # שלוף מידע על המשתמש מה-Google userinfo endpoint
    try:
        resp = http_requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {credentials.token}"},
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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"המשתמש {email} לא רשום במערכת. צור קשר עם מנהל המערכת.",
        )

    token = create_access_token(user)
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
def get_me(authorization: str | None = None, db: Session = Depends(get_db)):
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
    return {"id": str(user.id), "name": user.name, "email": user.email, "tenant_id": str(user.tenant_id)}
