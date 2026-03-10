from fastapi.testclient import TestClient


def test_audit_log_created_for_tenant_changes(app):
    client = TestClient(app)

    # Create tenant
    r = client.post("/tenants/", json={"name": "tenant-audit"})
    assert r.status_code == 201
    tenant_id = r.json()["id"]

    # Update tenant
    r = client.put(f"/tenants/{tenant_id}", json={"name": "tenant-audit-2"})
    assert r.status_code == 200

    # Soft delete tenant
    r = client.delete(f"/tenants/{tenant_id}")
    assert r.status_code == 204

    # Ensure audit logs exist
    r = client.get("/tenants/")
    assert r.status_code == 200

    # Direct DB query for audit logs
    from app import database
    from app import models

    session = database.SessionLocal()
    logs = session.query(models.AuditLog).filter(models.AuditLog.table_name == "tenants").all()
    session.close()

    assert any(log.action == models.AuditAction.CREATE for log in logs)
    assert any(log.action == models.AuditAction.UPDATE for log in logs)
    assert any(log.action == models.AuditAction.DELETE for log in logs)
