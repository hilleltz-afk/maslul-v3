"""
Tests for Contacts, Documents, Project Aliases CRUD + soft delete,
and cross-tenant isolation.
"""

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_project(client, tenant_id):
    r = client.post(
        f"/tenants/{tenant_id}/projects/",
        json={"gush": "1", "helka": "1", "name": "proj"},
    )
    assert r.status_code == 201
    return r.json()["id"]


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

def test_contact_crud(app, tenant_id):
    client = TestClient(app)

    # Create
    r = client.post(
        f"/tenants/{tenant_id}/contacts/",
        json={"name": "יוסי כהן", "phone": "050-1234567", "email": "yosi@example.com"},
    )
    assert r.status_code == 201
    contact_id = r.json()["id"]
    assert r.json()["name"] == "יוסי כהן"

    # Read
    r = client.get(f"/tenants/{tenant_id}/contacts/{contact_id}")
    assert r.status_code == 200
    assert r.json()["email"] == "yosi@example.com"

    # List
    r = client.get(f"/tenants/{tenant_id}/contacts/")
    assert r.status_code == 200
    assert any(c["id"] == contact_id for c in r.json())

    # Update
    r = client.put(
        f"/tenants/{tenant_id}/contacts/{contact_id}",
        json={"phone": "052-9999999"},
    )
    assert r.status_code == 200
    assert r.json()["phone"] == "052-9999999"

    # Soft delete
    r = client.delete(f"/tenants/{tenant_id}/contacts/{contact_id}")
    assert r.status_code == 204

    # Gone from list
    r = client.get(f"/tenants/{tenant_id}/contacts/")
    assert all(c["id"] != contact_id for c in r.json())

    # 404 on direct read
    r = client.get(f"/tenants/{tenant_id}/contacts/{contact_id}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

def test_document_crud(app, tenant_id):
    client = TestClient(app)
    project_id = _create_project(client, tenant_id)

    # Create
    r = client.post(
        f"/tenants/{tenant_id}/documents/",
        json={
            "project_id": project_id,
            "name": "היתר בנייה",
            "path": "/docs/hitaer.pdf",
            "expiry_date": "2027-01-01",
        },
    )
    assert r.status_code == 201
    doc_id = r.json()["id"]
    assert r.json()["name"] == "היתר בנייה"

    # Read
    r = client.get(f"/tenants/{tenant_id}/documents/{doc_id}")
    assert r.status_code == 200

    # List
    r = client.get(f"/tenants/{tenant_id}/documents/")
    assert any(d["id"] == doc_id for d in r.json())

    # Update
    r = client.put(
        f"/tenants/{tenant_id}/documents/{doc_id}",
        json={"expiry_date": "2028-06-15"},
    )
    assert r.status_code == 200
    assert r.json()["expiry_date"].startswith("2028-06-15")

    # Soft delete
    r = client.delete(f"/tenants/{tenant_id}/documents/{doc_id}")
    assert r.status_code == 204

    # Gone from list
    r = client.get(f"/tenants/{tenant_id}/documents/")
    assert all(d["id"] != doc_id for d in r.json())

    # 404 on direct read
    r = client.get(f"/tenants/{tenant_id}/documents/{doc_id}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Project Aliases
# ---------------------------------------------------------------------------

def test_project_alias_crud(app, tenant_id):
    client = TestClient(app)
    project_id = _create_project(client, tenant_id)

    # Create
    r = client.post(
        f"/tenants/{tenant_id}/project-aliases/",
        json={"project_id": project_id, "alias": "הדס-001"},
    )
    assert r.status_code == 201
    alias_id = r.json()["id"]
    assert r.json()["alias"] == "הדס-001"

    # Read
    r = client.get(f"/tenants/{tenant_id}/project-aliases/{alias_id}")
    assert r.status_code == 200

    # List
    r = client.get(f"/tenants/{tenant_id}/project-aliases/")
    assert any(a["id"] == alias_id for a in r.json())

    # Update
    r = client.put(
        f"/tenants/{tenant_id}/project-aliases/{alias_id}",
        json={"alias": "הדס-002"},
    )
    assert r.status_code == 200
    assert r.json()["alias"] == "הדס-002"

    # Soft delete
    r = client.delete(f"/tenants/{tenant_id}/project-aliases/{alias_id}")
    assert r.status_code == 204

    # Gone from list
    r = client.get(f"/tenants/{tenant_id}/project-aliases/")
    assert all(a["id"] != alias_id for a in r.json())

    # 404 on direct read
    r = client.get(f"/tenants/{tenant_id}/project-aliases/{alias_id}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Cross-tenant isolation
# ---------------------------------------------------------------------------

def test_cross_tenant_isolation(app, tenant_id):
    """Tenant B cannot read or modify Tenant A's data."""
    client = TestClient(app)

    # Create a second tenant
    r = client.post("/tenants/", json={"name": "tenant-B"})
    assert r.status_code == 201
    tenant_b_id = r.json()["id"]

    # Create a contact in Tenant A
    r = client.post(
        f"/tenants/{tenant_id}/contacts/",
        json={"name": "איש קשר של A", "phone": "050-0000000"},
    )
    assert r.status_code == 201
    contact_a_id = r.json()["id"]

    # Tenant B tries to read Tenant A's contact — must get 404
    r = client.get(f"/tenants/{tenant_b_id}/contacts/{contact_a_id}")
    assert r.status_code == 404

    # Tenant B tries to update Tenant A's contact — must get 404
    r = client.put(
        f"/tenants/{tenant_b_id}/contacts/{contact_a_id}",
        json={"phone": "099-9999999"},
    )
    assert r.status_code == 404

    # Tenant B tries to delete Tenant A's contact — must get 404
    r = client.delete(f"/tenants/{tenant_b_id}/contacts/{contact_a_id}")
    assert r.status_code == 404

    # Tenant B's contact list must be empty
    r = client.get(f"/tenants/{tenant_b_id}/contacts/")
    assert r.json() == []
