"""
One-time fix: if Postgres already has the old tables but alembic_version is
missing or stale, stamp to b1c2d3e4f5a6 so only the new migrations run.
"""
import os
import psycopg2

db_url = os.getenv("DATABASE_URL", "")
if not db_url or db_url.startswith("sqlite"):
    print("fix_alembic_stamp: SQLite — skipping.")
    raise SystemExit(0)

db_url = db_url.replace("postgres://", "postgresql://", 1)

TARGET = "b1c2d3e4f5a6"

try:
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    # Check if tenants table exists (i.e. DB was already populated)
    cur.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name='tenants'"
    )
    has_tenants = cur.fetchone()

    if not has_tenants:
        print("fix_alembic_stamp: fresh DB — nothing to do.")
        cur.close(); conn.close()
        raise SystemExit(0)

    # Check if alembic_version table exists
    cur.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name='alembic_version'"
    )
    has_av = cur.fetchone()

    if not has_av:
        # Create alembic_version and insert target revision
        cur.execute(
            "CREATE TABLE alembic_version "
            "(version_num VARCHAR(32) NOT NULL, "
            "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
        )
        cur.execute(
            "INSERT INTO alembic_version (version_num) VALUES (%s)", (TARGET,)
        )
        conn.commit()
        print(f"fix_alembic_stamp: created alembic_version and stamped to {TARGET}")
    else:
        cur.execute("SELECT version_num FROM alembic_version")
        row = cur.fetchone()
        current = row[0] if row else None
        print(f"fix_alembic_stamp: current = {current}")

        if current in (None, "2a0708229abc"):
            if current is None:
                cur.execute(
                    "INSERT INTO alembic_version (version_num) VALUES (%s)", (TARGET,)
                )
            else:
                cur.execute(
                    "UPDATE alembic_version SET version_num = %s", (TARGET,)
                )
            conn.commit()
            print(f"fix_alembic_stamp: stamped to {TARGET}")
        else:
            print(f"fix_alembic_stamp: already at {current} — no action needed.")

    cur.close()
    conn.close()

except SystemExit:
    raise
except Exception as e:
    print(f"fix_alembic_stamp ERROR: {e}")
    raise SystemExit(1)
