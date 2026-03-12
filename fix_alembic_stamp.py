"""
One-time fix: if alembic_version is at 2a0708229abc but the DB already has all
old tables (tenants, google_id column, etc.), stamp to b1c2d3e4f5a6 so that
only the new migrations (role/status, budget/comments) will run.
"""
import os
import subprocess

db_url = os.getenv("DATABASE_URL", "")
if not db_url or db_url.startswith("sqlite"):
    print("fix_alembic_stamp: SQLite detected, skipping.")
    exit(0)

try:
    import psycopg2
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute("SELECT version_num FROM alembic_version")
    row = cur.fetchone()
    current = row[0] if row else None
    print(f"fix_alembic_stamp: current version = {current}")

    if current == "2a0708229abc":
        # Check if tables beyond initial already exist (i.e., google_id column)
        cur.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='users' AND column_name='google_id'"
        )
        has_google_id = cur.fetchone()

        if has_google_id:
            cur.execute("UPDATE alembic_version SET version_num = 'b1c2d3e4f5a6'")
            conn.commit()
            print("fix_alembic_stamp: stamped to b1c2d3e4f5a6")
        else:
            print("fix_alembic_stamp: google_id not found, no stamp needed")

    cur.close()
    conn.close()
except Exception as e:
    print(f"fix_alembic_stamp error: {e}")
