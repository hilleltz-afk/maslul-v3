from fastapi.testclient import TestClient


def test_tenant_crud(app):
    client = TestClient(app)

    # Create tenant
    r = client.post("/tenants/", json={"name": "tenant1"})
    assert r.status_code == 201
    tenant = r.json()
    assert tenant["name"] == "tenant1"
    tenant_id = tenant["id"]

    # Read tenant
    r = client.get(f"/tenants/{tenant_id}")
    assert r.status_code == 200
    assert r.json()["id"] == tenant_id

    # Update tenant
    r = client.put(f"/tenants/{tenant_id}", json={"name": "tenant1-updated"})
    assert r.status_code == 200
    assert r.json()["name"] == "tenant1-updated"

    # Soft delete tenant
    r = client.delete(f"/tenants/{tenant_id}")
    assert r.status_code == 204

    # Deleted tenant should not be found
    r = client.get(f"/tenants/{tenant_id}")
    assert r.status_code == 404
