import os
from typing import Generator

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .database import SessionLocal

SECRET_KEY = os.getenv("SECRET_KEY", "maslul-dev-secret-change-in-production")
ALGORITHM = "HS256"


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user_id(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> str | None:
    """
    מחלץ user_id מ-JWT (Authorization: Bearer <token>).
    לצורך תאימות לאחור עם טסטים — גם X-User-ID header נתמך.
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload.get("sub")
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="טוקן לא תקין או פג תוקף",
            )
    # fallback לטסטים (X-User-ID header)
    return x_user_id
