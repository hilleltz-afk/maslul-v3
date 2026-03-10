"""
Phase 4 tests — Email Pipeline (עם mock של AI).
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _setup(client, tenant_id):
    r = client.post(f"/tenants/{tenant_id}/projects/", json={"gush": "1", "helka": "1", "name": "פרויקט הדס"})
    project_id = r.json()["id"]
    r = client.post(f"/tenants/{tenant_id}/stages/", json={
        "project_id": project_id, "name": "שלב א", "handling_authority": "עירייה"
    })
    stage_id = r.json()["id"]
    return project_id, stage_id


def _mock_triage(is_relevant=True, confidence=0.95, reason="קשור לפרויקט"):
    from app.ai import EmailTriageResult
    return EmailTriageResult(is_relevant=is_relevant, confidence=confidence, reason=reason)


def _mock_analysis(task_name="בדיקת היתר", priority="high"):
    from app.ai import EmailAnalysisResult
    return EmailAnalysisResult(
        project_name_guess="פרויקט הדס",
        confidence_project_match=0.9,
        suggested_task_name=task_name,
        suggested_priority=priority,
        suggested_assignee=None,
        suggested_due_date=None,
        has_attachments=False,
        budget_mentioned=None,
        notes=None,
    )


# ---------------------------------------------------------------------------
# Ingest tests
# ---------------------------------------------------------------------------

def test_ingest_relevant_email(app, tenant_id):
    """מייל רלוונטי עובר triage + analysis ונכנס כ-PENDING."""
    client = TestClient(app)
    _setup(client, tenant_id)

    with patch("app.ai.triage_email", return_value=_mock_triage()), \
         patch("app.ai.analyse_email", return_value=_mock_analysis()):
        r = client.post(f"/tenants/{tenant_id}/pipeline/ingest", json={
            "sender": "contractor@example.com",
            "subject": "עדכון לגבי היתר בנייה",
            "body": "שלום, אנחנו צריכים לבדוק את ההיתר לפני תחילת הבנייה. " * 20,
        })

    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "PENDING"
    assert data["triage_is_relevant"] == 1
    assert data["suggested_task_name"] == "בדיקת היתר"
    assert data["suggested_priority"] == "high"


def test_ingest_irrelevant_email(app, tenant_id):
    """מייל לא רלוונטי עובר triage ונדחה אוטומטית (TRIAGED_OUT)."""
    client = TestClient(app)

    with patch("app.ai.triage_email", return_value=_mock_triage(is_relevant=False, confidence=0.98, reason="ספאם")):
        r = client.post(f"/tenants/{tenant_id}/pipeline/ingest", json={
            "sender": "spam@ads.com",
            "subject": "הצעה מיוחדת!",
            "body": "קנה עכשיו וקבל הנחה של 50%",
        })

    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "TRIAGED_OUT"
    assert data["triage_is_relevant"] == 0
    # Analysis לא רץ — אין suggested_task_name
    assert data["suggested_task_name"] is None


# ---------------------------------------------------------------------------
# HITL tests
# ---------------------------------------------------------------------------

def test_list_pending(app, tenant_id):
    """רק פריטי PENDING מוצגים ברשימת הממתינים."""
    client = TestClient(app)
    _setup(client, tenant_id)

    with patch("app.ai.triage_email", return_value=_mock_triage()), \
         patch("app.ai.analyse_email", return_value=_mock_analysis()):
        client.post(f"/tenants/{tenant_id}/pipeline/ingest", json={
            "sender": "a@b.com", "subject": "נושא", "body": "תוכן " * 10,
        })

    # מייל שנסנן
    with patch("app.ai.triage_email", return_value=_mock_triage(is_relevant=False, reason="לא רלוונטי")):
        client.post(f"/tenants/{tenant_id}/pipeline/ingest", json={
            "sender": "spam@b.com", "subject": "ספאם", "body": "תוכן " * 10,
        })

    r = client.get(f"/tenants/{tenant_id}/pipeline/pending")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["status"] == "PENDING"


def test_approve_creates_task(app, tenant_id):
    """אישור פריט יוצר משימה ומעדכן סטטוס ל-APPROVED."""
    client = TestClient(app)
    project_id, stage_id = _setup(client, tenant_id)

    with patch("app.ai.triage_email", return_value=_mock_triage()), \
         patch("app.ai.analyse_email", return_value=_mock_analysis()):
        r = client.post(f"/tenants/{tenant_id}/pipeline/ingest", json={
            "sender": "a@b.com", "subject": "נושא", "body": "תוכן " * 10,
        })
    item_id = r.json()["id"]

    r = client.post(f"/tenants/{tenant_id}/pipeline/{item_id}/approve", json={
        "project_id": project_id,
        "stage_id": stage_id,
        "task_title": "בדיקת היתר מאושרת",
        "priority": "high",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "APPROVED"
    assert data["created_task_id"] is not None

    # המשימה אכן נוצרה
    task_id = data["created_task_id"]
    r = client.get(f"/tenants/{tenant_id}/tasks/{task_id}")
    assert r.status_code == 200
    assert r.json()["title"] == "בדיקת היתר מאושרת"


def test_dismiss_email(app, tenant_id):
    """דחיית פריט מעדכן סטטוס ל-DISMISSED ללא יצירת משימה."""
    client = TestClient(app)
    _setup(client, tenant_id)

    with patch("app.ai.triage_email", return_value=_mock_triage()), \
         patch("app.ai.analyse_email", return_value=_mock_analysis()):
        r = client.post(f"/tenants/{tenant_id}/pipeline/ingest", json={
            "sender": "a@b.com", "subject": "נושא", "body": "תוכן " * 10,
        })
    item_id = r.json()["id"]

    r = client.post(f"/tenants/{tenant_id}/pipeline/{item_id}/dismiss")
    assert r.status_code == 200
    assert r.json()["status"] == "DISMISSED"
    assert r.json()["created_task_id"] is None


def test_cannot_approve_twice(app, tenant_id):
    """לא ניתן לאשר פריט שכבר אושר."""
    client = TestClient(app)
    project_id, stage_id = _setup(client, tenant_id)

    with patch("app.ai.triage_email", return_value=_mock_triage()), \
         patch("app.ai.analyse_email", return_value=_mock_analysis()):
        r = client.post(f"/tenants/{tenant_id}/pipeline/ingest", json={
            "sender": "a@b.com", "subject": "נושא", "body": "תוכן " * 10,
        })
    item_id = r.json()["id"]

    approve_payload = {"project_id": project_id, "stage_id": stage_id, "task_title": "משימה", "priority": "low"}
    client.post(f"/tenants/{tenant_id}/pipeline/{item_id}/approve", json=approve_payload)

    # ניסיון שני
    r = client.post(f"/tenants/{tenant_id}/pipeline/{item_id}/approve", json=approve_payload)
    assert r.status_code == 409
