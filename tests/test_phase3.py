"""
Phase 3 tests:
- Fuzzy duplicate detection (ללא API)
- AI endpoints עם mock של Anthropic (ללא קריאות אמיתיות)
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fuzzy Matching tests
# ---------------------------------------------------------------------------

def test_check_duplicate_exact_gush_helka(app, tenant_id):
    """התאמה מדויקת על גוש+חלקה מחזירה similarity=1.0."""
    client = TestClient(app)

    # יצירת פרויקט קיים
    client.post(f"/tenants/{tenant_id}/projects/", json={"gush": "100", "helka": "5", "name": "פרויקט ראשון"})

    r = client.post(
        f"/tenants/{tenant_id}/ai/check-duplicate",
        json={"name": "שם שונה לגמרי", "gush": "100", "helka": "5"},
    )
    assert r.status_code == 200
    results = r.json()
    assert len(results) >= 1
    assert results[0]["similarity"] == 1.0


def test_check_duplicate_similar_name(app, tenant_id):
    """שם דומה מאוד מחזיר תוצאה."""
    client = TestClient(app)

    client.post(f"/tenants/{tenant_id}/projects/", json={"gush": "200", "helka": "1", "name": "הדס קפיטל תל אביב"})

    r = client.post(
        f"/tenants/{tenant_id}/ai/check-duplicate",
        json={"name": "הדס קפיטל תל אביב", "gush": "999", "helka": "999"},
    )
    assert r.status_code == 200
    results = r.json()
    assert len(results) >= 1
    assert results[0]["similarity"] >= 0.85


def test_check_duplicate_no_match(app, tenant_id):
    """שם שונה לגמרי לא מחזיר תוצאות."""
    client = TestClient(app)

    client.post(f"/tenants/{tenant_id}/projects/", json={"gush": "300", "helka": "1", "name": "פרויקט צפון"})

    r = client.post(
        f"/tenants/{tenant_id}/ai/check-duplicate",
        json={"name": "zzz xyz 999", "gush": "999", "helka": "999"},
    )
    assert r.status_code == 200
    assert r.json() == []


def test_check_duplicate_empty_tenant(app, tenant_id):
    """tenant ללא פרויקטים — רשימה ריקה."""
    client = TestClient(app)
    r = client.post(
        f"/tenants/{tenant_id}/ai/check-duplicate",
        json={"name": "כלשהו", "gush": "1", "helka": "1"},
    )
    assert r.status_code == 200
    assert r.json() == []


# ---------------------------------------------------------------------------
# AI Triage — mock
# ---------------------------------------------------------------------------

def test_triage_project_mock(app, tenant_id):
    """בודק את ה-endpoint עם mock של Claude Haiku."""
    mock_result = {
        "name": "פרויקט הדס רחובות",
        "gush": "3750",
        "helka": "12",
        "suggested_stages": ["הגשת תוכניות", "קבלת היתר", "בנייה"],
        "notes": "פרויקט מגורים 8 קומות",
    }

    with patch("app.ai.triage_project") as mock_triage:
        from app.ai import ProjectTriage
        mock_triage.return_value = ProjectTriage(**mock_result)

        client = TestClient(app)
        r = client.post(
            f"/tenants/{tenant_id}/ai/triage",
            json={"text": "פרויקט מגורים ברחובות גוש 3750 חלקה 12, 8 קומות"},
        )

    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "פרויקט הדס רחובות"
    assert data["gush"] == "3750"
    assert len(data["suggested_stages"]) == 3


# ---------------------------------------------------------------------------
# AI Analysis — mock
# ---------------------------------------------------------------------------

def test_analyse_document_mock(app, tenant_id):
    """בודק את ה-endpoint עם mock של Claude Sonnet."""
    mock_result = {
        "summary": "היתר בנייה לפרויקט מגורים.",
        "key_dates": ["01/03/2026 - תפוגת היתר"],
        "action_items": ["חידוש היתר לפני המועד"],
        "risk_level": "high",
        "notes": None,
    }

    with patch("app.ai.analyse_document") as mock_analyse:
        from app.ai import DocumentAnalysis
        mock_analyse.return_value = DocumentAnalysis(**mock_result)

        client = TestClient(app)
        r = client.post(
            f"/tenants/{tenant_id}/ai/analyse",
            json={"content": "היתר בנייה מספר 1234, תוקף עד 01/03/2026"},
        )

    assert r.status_code == 200
    data = r.json()
    assert data["risk_level"] == "high"
    assert len(data["action_items"]) == 1
