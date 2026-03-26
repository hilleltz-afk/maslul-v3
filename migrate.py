"""
Idempotent migration script for Railway PostgreSQL.
Uses IF NOT EXISTS everywhere — safe to run on every startup.
Bypasses alembic's version tracking issues.
"""
import os
import sys
import psycopg2

HEAD = "k6f7a8b9c0d1"

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
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS task_id VARCHAR(36)",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS stage_id VARCHAR(36)",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_name VARCHAR",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_id VARCHAR",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS contact_id VARCHAR(36)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_refresh_token VARCHAR",
    "ALTER TABLE template_tasks ADD COLUMN IF NOT EXISTS assignee_role VARCHAR",
    # ---- Fix: allow re-inviting after soft-delete (partial unique index on email) ----
    "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_unique ON users(email) WHERE deleted_at IS NULL",
    # ---- project_members ----
    """CREATE TABLE IF NOT EXISTS project_members (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        project_id UUID NOT NULL,
        user_id UUID NOT NULL,
        role VARCHAR NOT NULL DEFAULT 'member',
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by UUID
    )""",
    # ---- New tables: drop if wrong type (VARCHAR instead of UUID), recreate with UUID ----
    # budget_entries
    """DO $$ BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='budget_entries' AND column_name='id'
              AND data_type='character varying'
        ) THEN DROP TABLE IF EXISTS budget_entries CASCADE; END IF;
    END $$""",
    """CREATE TABLE IF NOT EXISTS budget_entries (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        project_id UUID NOT NULL,
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
        created_by UUID
    )""",
    # task_comments
    """DO $$ BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='task_comments' AND column_name='id'
              AND data_type='character varying'
        ) THEN DROP TABLE IF EXISTS task_comments CASCADE; END IF;
    END $$""",
    """CREATE TABLE IF NOT EXISTS task_comments (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        task_id UUID NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by UUID
    )""",
    # quotes
    """DO $$ BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='quotes' AND column_name='id'
              AND data_type='character varying'
        ) THEN DROP TABLE IF EXISTS payment_milestones CASCADE;
             DROP TABLE IF EXISTS quotes CASCADE; END IF;
    END $$""",
    """CREATE TABLE IF NOT EXISTS quotes (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        project_id UUID,
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
        created_by UUID
    )""",
    # payment_milestones
    """DO $$ BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='payment_milestones' AND column_name='id'
              AND data_type='character varying'
        ) THEN DROP TABLE IF EXISTS payment_milestones CASCADE; END IF;
    END $$""",
    """CREATE TABLE IF NOT EXISTS payment_milestones (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        quote_id UUID NOT NULL,
        project_id UUID,
        description VARCHAR NOT NULL,
        amount FLOAT NOT NULL,
        due_date TIMESTAMP,
        paid_at TIMESTAMP,
        is_paid INTEGER DEFAULT 0,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by UUID
    )""",
    # project_professionals
    """CREATE TABLE IF NOT EXISTS project_professionals (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        project_id UUID NOT NULL,
        contact_id UUID NOT NULL,
        profession VARCHAR NOT NULL,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by UUID
    )""",
    # professions
    """CREATE TABLE IF NOT EXISTS professions (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        name VARCHAR NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP,
        deleted_at TIMESTAMP
    )""",
    # project_templates
    """CREATE TABLE IF NOT EXISTS project_templates (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        name VARCHAR NOT NULL,
        description TEXT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_by UUID
    )""",
    """CREATE TABLE IF NOT EXISTS template_stages (
        id UUID PRIMARY KEY,
        template_id UUID NOT NULL REFERENCES project_templates(id),
        name VARCHAR NOT NULL,
        handling_authority VARCHAR NOT NULL DEFAULT '',
        color VARCHAR DEFAULT '#011e41',
        "order" INTEGER NOT NULL DEFAULT 0,
        estimated_days INTEGER,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS template_tasks (
        id UUID PRIMARY KEY,
        template_stage_id UUID NOT NULL REFERENCES template_stages(id),
        title VARCHAR NOT NULL,
        description TEXT,
        priority VARCHAR NOT NULL DEFAULT 'medium',
        "order" INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP
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
