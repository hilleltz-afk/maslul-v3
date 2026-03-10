from fastapi.testclient import TestClient


def test_project_stage_task_crud(app, tenant_id):
    client = TestClient(app)

    # Create project
    r = client.post(f"/tenants/{tenant_id}/projects/", json={"gush": "123", "helka": "456", "name": "proj"})
    assert r.status_code == 201
    project_id = r.json()["id"]

    # Create stage
    r = client.post(
        f"/tenants/{tenant_id}/stages/", json={"project_id": project_id, "name": "stage A", "handling_authority": "office"}
    )
    assert r.status_code == 201
    stage_id = r.json()["id"]

    # Create task
    r = client.post(
        f"/tenants/{tenant_id}/tasks/",
        json={
            "project_id": project_id,
            "stage_id": stage_id,
            "title": "task1",
            "priority": "high",
            "status": "open",
        },
    )
    assert r.status_code == 201
    task_id = r.json()["id"]

    # Update task
    r = client.put(
        f"/tenants/{tenant_id}/tasks/{task_id}",
        json={"status": "done"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "done"

    # Delete task (soft)
    r = client.delete(f"/tenants/{tenant_id}/tasks/{task_id}")
    assert r.status_code == 204

    # Ensure task is gone from list
    r = client.get(f"/tenants/{tenant_id}/tasks/")
    assert r.status_code == 200
    assert all(t["id"] != task_id for t in r.json())
