import os
import tempfile

import pytest
import sqlalchemy as sa

from app import main


@pytest.fixture(scope="session")
def test_db_url(tmp_path_factory):
    db_file = tmp_path_factory.mktemp("data") / "test.db"
    url = f"sqlite:///{db_file}"
    os.environ["DATABASE_URL"] = url
    return url


@pytest.fixture(scope="session")
def app(test_db_url):
    # Ensure database uses test DB and schema exists.
    from importlib import reload

    # Reload modules that depend on DATABASE_URL.
    reload(main)

    from app import database

    database.Base.metadata.create_all(bind=database.engine)
    return main.app


@pytest.fixture(autouse=True)
def cleanup_db(app):
    # Rollback between tests by truncating all tables.
    from app import database

    with database.engine.begin() as conn:
        for table in reversed(database.Base.metadata.sorted_tables):
            conn.execute(sa.delete(table))
    yield
    with database.engine.begin() as conn:
        for table in reversed(database.Base.metadata.sorted_tables):
            conn.execute(sa.delete(table))


@pytest.fixture
def tenant_id(app):
    from fastapi.testclient import TestClient

    client = TestClient(app)
    r = client.post("/tenants/", json={"name": "tenant-test"})
    return r.json()["id"]
