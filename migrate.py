"""
Idempotent migration script for Railway PostgreSQL.
Uses IF NOT EXISTS everywhere — safe to run on every startup.
Bypasses alembic's version tracking issues.
"""
import os
import sys
import psycopg2

HEAD = "f5a6b7c8d9e0"

db_url = os.getenv("DATABASE_URL", "")

if not db_url or db_url.startswith("sqlite"):
    # Local dev with SQLite — use alembic normally
    import subprocess
    r = subprocess.run(["python", "-m", "alembic", "upgrade", "head"])
    sys.exit(r.returncode)

db_url = db_url.replace("postgres://", "postgresql://", 1)

DDL = [
    # ---- Phase 1: initial schema (safe with IF NOT EXISTS) ----
    """CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        email VARCHAR UNIQUE NOT NULL,
        name VARCHAR NOT NULL,
        google_id VARCHAR UNIQUE,
        role VARCHAR NOT NULL DEFAULT 'member',
        status VARCHAR NOT NULL DEFAULT 'active',
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
    """CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        gush VARCHAR NOT NULL,
        helka VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        address VARCHAR,
        budget_total FLOAT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
    """CREATE TABLE IF NOT EXISTS project_aliases (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        project_id VARCHAR(36) REFERENCES projects(id) NOT NULL,
        alias VARCHAR NOT NULL,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
    """CREATE TABLE IF NOT EXISTS stages (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        project_id VARCHAR(36) REFERENCES projects(id) NOT NULL,
        name VARCHAR NOT NULL,
        handling_authority VARCHAR NOT NULL,
        color VARCHAR DEFAULT '#011e41',
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
    """CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        project_id VARCHAR(36) REFERENCES projects(id) NOT NULL,
        stage_id VARCHAR(36) REFERENCES stages(id) NOT NULL,
        assignee_id VARCHAR(36),
        title VARCHAR NOT NULL,
        description TEXT,
        priority VARCHAR NOT NULL,
        status VARCHAR NOT NULL,
        rejection_count INTEGER DEFAULT 0,
        blocked_by VARCHAR(36),
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        custom_fields TEXT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
    """CREATE TABLE IF NOT EXISTS contacts (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        name VARCHAR NOT NULL,
        phone VARCHAR,
        email VARCHAR,
        profession VARCHAR,
        office_name VARCHAR,
        mobile_phone VARCHAR,
        notes TEXT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
    """CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        project_id VARCHAR(36),
        name VARCHAR NOT NULL,
        path VARCHAR NOT NULL,
        expiry_date TIMESTAMP,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
    """CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        table_name VARCHAR NOT NULL,
        record_id VARCHAR(36) NOT NULL,
        field_name VARCHAR NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by VARCHAR(36),
        changed_at TIMESTAMP,
        action VARCHAR NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS email_pipeline (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        gmail_message_id VARCHAR,
        sender VARCHAR NOT NULL,
        subject VARCHAR NOT NULL,
        body_preview TEXT,
        full_body TEXT,
        triage_is_relevant INTEGER,
        triage_confidence FLOAT,
        triage_reason TEXT,
        suggested_project_id VARCHAR(36),
        project_match_confidence FLOAT,
        suggested_task_name VARCHAR,
        suggested_priority VARCHAR,
        suggested_assignee VARCHAR,
        suggested_due_date TIMESTAMP,
        has_attachments INTEGER,
        budget_mentioned FLOAT,
        analysis_notes TEXT,
        status VARCHAR NOT NULL DEFAULT 'PENDING',
        created_task_id VARCHAR(36),
        reviewed_by VARCHAR(36),
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
    # ---- New columns (ADD COLUMN IF NOT EXISTS) ----
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'member'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'active'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_refresh_token VARCHAR",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS address VARCHAR",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_total FLOAT",
    "ALTER TABLE stages ADD COLUMN IF NOT EXISTS color VARCHAR DEFAULT '#011e41'",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMP",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_date TIMESTAMP",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS custom_fields TEXT",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_by VARCHAR(36)",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rejection_count INTEGER DEFAULT 0",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS contact_id VARCHAR(36)",
    "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profession VARCHAR",
    "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS office_name VARCHAR",
    "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS mobile_phone VARCHAR",
    "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT",
    # ---- New tables ----
    """CREATE TABLE IF NOT EXISTS budget_entries (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        project_id VARCHAR(36) REFERENCES projects(id) NOT NULL,
        category VARCHAR NOT NULL,
        description VARCHAR NOT NULL,
        vendor VARCHAR,
        amount FLOAT NOT NULL,
        entry_date TIMESTAMP,
        is_planned INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
    """CREATE TABLE IF NOT EXISTS task_comments (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        task_id VARCHAR(36) REFERENCES tasks(id) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
    """CREATE TABLE IF NOT EXISTS quotes (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        project_id VARCHAR(36) REFERENCES projects(id),
        vendor VARCHAR,
        title VARCHAR NOT NULL,
        total_amount FLOAT,
        pdf_filename VARCHAR,
        ai_extracted_data TEXT,
        status VARCHAR NOT NULL DEFAULT 'pending_review',
        notes TEXT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
    """CREATE TABLE IF NOT EXISTS payment_milestones (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) REFERENCES tenants(id) NOT NULL,
        quote_id VARCHAR(36) REFERENCES quotes(id) NOT NULL,
        project_id VARCHAR(36) REFERENCES projects(id),
        description VARCHAR NOT NULL,
        amount FLOAT NOT NULL,
        due_date TIMESTAMP,
        paid_at TIMESTAMP,
        is_paid INTEGER DEFAULT 0,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by VARCHAR(36)
    )""",
]

try:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    for sql in DDL:
        try:
            cur.execute(sql)
            conn.commit()
        except Exception as e:
            conn.rollback()
            # Only log unexpected errors
            msg = str(e).strip()
            if "already exists" not in msg and "duplicate column" not in msg.lower():
                print(f"DDL warning: {msg[:120]}")

    # Set alembic_version to HEAD
    cur.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name='alembic_version'"
    )
    if not cur.fetchone():
        cur.execute(
            "CREATE TABLE alembic_version "
            "(version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
        )
        conn.commit()

    cur.execute("SELECT version_num FROM alembic_version")
    row = cur.fetchone()
    if row:
        cur.execute("UPDATE alembic_version SET version_num = %s", (HEAD,))
    else:
        cur.execute("INSERT INTO alembic_version VALUES (%s)", (HEAD,))
    conn.commit()

    print(f"migrate.py: OK — alembic_version = {HEAD}")
    cur.close()
    conn.close()
    sys.exit(0)

except Exception as e:
    print(f"migrate.py FATAL: {e}")
    sys.exit(1)
