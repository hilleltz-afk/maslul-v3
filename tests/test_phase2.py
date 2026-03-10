"""
Phase 2 tests: circular dependency detection + document expiry alerts.
"""

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _setup(client, tenant_id):
    """יוצר project, stage ומחזיר את ה-IDs."""
    r = client.post(f"/tenants/{tenant_id}/projects/", json={"gush": "1", "helka": "1", "name": "proj"})
    project_id = r.json()["id"]
    r = client.post(
        f"/tenants/{tenant_id}/stages/",
        json={"project_id": project_id, "name": "שלב א", "handling_authority": "עירייה"},
    )
    stage_id = r.json()["id"]
    return project_id, stage_id


def _create_task(client, tenant_id, project_id, stage_id, title="task", blocked_by=None):
    payload = {"project_id": project_id, "stage_id": stage_id, "title": title, "priority": "medium", "status": "open"}
    if blocked_by:
        payload["blocked_by"] = blocked_by
    r = client.post(f"/tenants/{tenant_id}/tasks/", json=payload)
    return r


# ---------------------------------------------------------------------------
# Circular dependency tests
# ---------------------------------------------------------------------------

def test_task_cannot_block_itself(app, tenant_id):
    client = TestClient(app)
    project_id, stage_id = _setup(client, tenant_id)

    r = _create_task(client, tenant_id, project_id, stage_id, "task A")
    assert r.status_code == 201
    task_a_id = r.json()["id"]

    # ניסיון לחסום את עצמה
    r = client.put(
        f"/tenants/{tenant_id}/tasks/{task_a_id}",
        json={"blocked_by": task_a_id},
    )
    assert r.status_code == 422


def test_circular_dependency_direct(app, tenant_id):
    """A חסומה על ידי B, ואז B מנסה להיחסם על ידי A — חייב להיכשל."""
    client = TestClient(app)
    project_id, stage_id = _setup(client, tenant_id)

    r = _create_task(client, tenant_id, project_id, stage_id, "task A")
    task_a_id = r.json()["id"]

    r = _create_task(client, tenant_id, project_id, stage_id, "task B", blocked_by=task_a_id)
    assert r.status_code == 201
    task_b_id = r.json()["id"]

    # A מנסה להיחסם על ידי B — מעגל ישיר
    r = client.put(f"/tenants/{tenant_id}/tasks/{task_a_id}", json={"blocked_by": task_b_id})
    assert r.status_code == 422


def test_circular_dependency_chain(app, tenant_id):
    """A←B←C, ואז C מנסה להיחסם על ידי A — מעגל עקיף."""
    client = TestClient(app)
    project_id, stage_id = _setup(client, tenant_id)

    r = _create_task(client, tenant_id, project_id, stage_id, "A")
    task_a_id = r.json()["id"]

    r = _create_task(client, tenant_id, project_id, stage_id, "B", blocked_by=task_a_id)
    task_b_id = r.json()["id"]

    r = _create_task(client, tenant_id, project_id, stage_id, "C", blocked_by=task_b_id)
    task_c_id = r.json()["id"]

    # A מנסה להיחסם על ידי C — מעגל עקיף A←B←C←A
    r = client.put(f"/tenants/{tenant_id}/tasks/{task_a_id}", json={"blocked_by": task_c_id})
    assert r.status_code == 422


def test_valid_dependency_chain(app, tenant_id):
    """שרשרת חוקית A←B←C צריכה לעבור."""
    client = TestClient(app)
    project_id, stage_id = _setup(client, tenant_id)

    r = _create_task(client, tenant_id, project_id, stage_id, "A")
    task_a_id = r.json()["id"]

    r = _create_task(client, tenant_id, project_id, stage_id, "B", blocked_by=task_a_id)
    assert r.status_code == 201
    task_b_id = r.json()["id"]

    r = _create_task(client, tenant_id, project_id, stage_id, "C", blocked_by=task_b_id)
    assert r.status_code == 201


def test_blocked_by_cross_tenant_rejected(app, tenant_id):
    """לא ניתן לחסום משימה על ידי משימה מ-tenant אחר."""
    client = TestClient(app)

    # Tenant B
    r = client.post("/tenants/", json={"name": "tenant-B"})
    tenant_b_id = r.json()["id"]

    project_id, stage_id = _setup(client, tenant_id)
    project_b_id, stage_b_id = _setup(client, tenant_b_id)

    r = _create_task(client, tenant_b_id, project_b_id, stage_b_id, "task in B")
    task_b_id = r.json()["id"]

    # ניסיון לחסום משימה ב-tenant A על ידי משימה מ-tenant B
    r = _create_task(client, tenant_id, project_id, stage_id, "task in A", blocked_by=task_b_id)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Document expiry alerts
# ---------------------------------------------------------------------------

def test_expiring_documents(app, tenant_id):
    client = TestClient(app)

    r = client.post(f"/tenants/{tenant_id}/projects/", json={"gush": "1", "helka": "1", "name": "proj"})
    project_id = r.json()["id"]

    # מסמך שפג עבר (לפני 5 ימים)
    client.post(f"/tenants/{tenant_id}/documents/", json={
        "project_id": project_id, "name": "ישן", "path": "/old.pdf", "expiry_date": "2020-01-01",
    })

    # מסמך שיפוג בעוד 10 ימים
    client.post(f"/tenants/{tenant_id}/documents/", json={
        "project_id": project_id, "name": "קרוב לפקוע", "path": "/soon.pdf", "expiry_date": "2026-03-20",
    })

    # מסמך שיפוג בעוד שנה (מחוץ לחלון)
    client.post(f"/tenants/{tenant_id}/documents/", json={
        "project_id": project_id, "name": "רחוק", "path": "/far.pdf", "expiry_date": "2030-01-01",
    })

    # מסמך ללא תאריך (לא צריך להופיע)
    client.post(f"/tenants/{tenant_id}/documents/", json={
        "project_id": project_id, "name": "ללא תאריך", "path": "/no-date.pdf",
    })

    # שאל על 30 ימים קדימה
    r = client.get(f"/tenants/{tenant_id}/documents/expiring?days=30")
    assert r.status_code == 200
    names = [d["name"] for d in r.json()]

    assert "ישן" in names          # פג — צריך להופיע
    assert "קרוב לפקוע" in names   # בתוך 30 יום — צריך להופיע
    assert "רחוק" not in names     # מחוץ לחלון — לא צריך
    assert "ללא תאריך" not in names


def test_expiring_documents_empty(app, tenant_id):
    """ללא מסמכים — מחזיר רשימה ריקה."""
    client = TestClient(app)
    r = client.get(f"/tenants/{tenant_id}/documents/expiring?days=30")
    assert r.status_code == 200
    assert r.json() == []


def test_expiring_documents_days_zero(app, tenant_id):
    """days=0 מחזיר רק מסמכים שכבר פגו."""
    client = TestClient(app)

    r = client.post(f"/tenants/{tenant_id}/projects/", json={"gush": "1", "helka": "1", "name": "proj"})
    project_id = r.json()["id"]

    client.post(f"/tenants/{tenant_id}/documents/", json={
        "project_id": project_id, "name": "פג", "path": "/a.pdf", "expiry_date": "2020-06-01",
    })
    client.post(f"/tenants/{tenant_id}/documents/", json={
        "project_id": project_id, "name": "עתידי", "path": "/b.pdf", "expiry_date": "2030-01-01",
    })

    r = client.get(f"/tenants/{tenant_id}/documents/expiring?days=0")
    assert r.status_code == 200
    names = [d["name"] for d in r.json()]
    assert "פג" in names
    assert "עתידי" not in names
