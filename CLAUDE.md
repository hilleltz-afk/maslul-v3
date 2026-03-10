# מסלול — Maslul Project Guide

## סקירה כללית
מערכת ניהול משרד לחברת נדל"ן ישראלית (Hadas Capital).
**שפות:** כל הודעות המשתמש ושגיאות API — **עברית בלבד**. קוד ותגובות פנימיות — אנגלית.

## Stack טכנולוגי
- **Backend:** Python 3.12, FastAPI, SQLAlchemy, Alembic
- **DB (dev):** SQLite | **DB (prod):** PostgreSQL
- **AI:** Anthropic Claude (Haiku לtriage, Sonnet לanalysis)
- **Auth:** Google OAuth 2.0 + JWT (python-jose)
- **Tests:** pytest עם mock של Anthropic API

## מבנה הפרויקט
```
app/
  main.py          — FastAPI app entry point (load_dotenv() כאן)
  models.py        — SQLAlchemy models (GUID TypeDecorator לתאימות SQLite/PG)
  schemas.py       — Pydantic v2 schemas (model_dump() לא .dict())
  crud.py          — פונקציות CRUD כלליות + check_no_circular_dependency
  deps.py          — get_db(), get_current_user_id() (JWT + X-User-ID fallback)
  ai.py            — Fuzzy matching, Email triage/analysis, Project triage
  database.py      — SQLAlchemy engine + Base
  routers/
    auth.py        — /auth/login, /auth/callback, /auth/me
    tenants.py     — /tenants/
    users.py       — /tenants/{id}/users/
    projects.py    — /tenants/{id}/projects/
    project_aliases.py
    stages.py      — /tenants/{id}/stages/
    tasks.py       — /tenants/{id}/tasks/ (circular dependency check)
    contacts.py    — /tenants/{id}/contacts/
    documents.py   — /tenants/{id}/documents/ + /expiring
    pipeline.py    — /tenants/{id}/pipeline/ (Email AI Pipeline)
    ai.py          — /tenants/{id}/ai/triage, /analyse, /check-duplicate
alembic/versions/  — migrations ידניים (לא autogenerate בגלל GUID)
tests/             — test_*.py (כולם עם in-memory SQLite)
seed.py            — יצירת Tenant + User ראשון (להריץ פעם אחת)
```

## כללים חשובים לפיתוח

### UUID / GUID
- כל הטבלאות משתמשות ב-`GUID()` TypeDecorator (לא UUID של PG ישירות)
- בmigrations: ייבוא `from app.models import GUID` — אסור autogenerate

### Datetime
- תמיד `datetime.now(timezone.utc)` — לא `datetime.utcnow()` (deprecated)

### Pydantic
- תמיד `model_dump()` — לא `.dict()` (deprecated ב-v2)

### Soft Delete
- כל הטבלאות יש `deleted_at` — סינון תמיד עם `.filter(deleted_at.is_(None))`

### Multi-tenant
- כל query מסנן לפי `tenant_id`
- פונקציה `_get_X_or_404` בכל router מוודאת tenant isolation

### FastAPI routing
- endpoints עם path parameter כמו `/{document_id}` — לשים **אחרי** endpoints עם שמות קבועים כמו `/expiring`

### Migrations (Alembic)
- SQLite לא תומך ב-`create_unique_constraint` — להשתמש ב-`create_index(..., unique=True)`
- אחרי migration שנכשל בגלל "already exists" → `alembic stamp <revision_id>`

## Phases שהושלמו
- **Phase 1:** ניהול בסיסי (Tenants, Users, Projects, Stages, Tasks, Contacts, Documents)
- **Phase 2:** Task Dependencies (blocked_by) + Document Alerts (expiring)
- **Phase 3:** AI Onboarding (Claude Haiku triage) + Fuzzy Duplicate Detection (Levenshtein)
- **Phase 4:** Email AI Pipeline (Triage → Analysis → HITL → Task creation)
- **Auth:** Google OAuth 2.0 + JWT

## סביבת הפרותחול
```bash
# הפעלת השרת
uvicorn app.main:app --reload

# הרצת טסטים
python -m pytest tests/ -x -q

# migration
python -m alembic upgrade head

# seed (פעם אחת)
python seed.py
```

## משתני סביבה (.env)
```
ANTHROPIC_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
REDIRECT_URI=http://localhost:8000/auth/callback
SECRET_KEY=...   # לJWT — לשנות בproduction
```

## Tenant ומשתמש קיימים (dev)
- Tenant: **Hadas Capital** (`f5e358da-ebfd-47ad-9ee0-3bb638089a1a`)
- User: **הלל** (`hillel_tz@hadas-capital.com`)

## AI Models בשימוש
- Triage (מהיר/זול): `claude-haiku-4-5-20251001`
- Analysis (עמוק): `claude-sonnet-4-6`

## Tests
- כל הטסטים ב-`tests/` משתמשים ב-in-memory SQLite + mock של Anthropic
- fixture `app` ו-`tenant_id` מוגדרים ב-`tests/conftest.py`
- להריץ: `python -m pytest tests/ -x -q`
