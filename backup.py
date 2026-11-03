"""
Daily database backup — uploads JSON dump to Google Drive.
Run via Railway Cron Job: 0 3 * * *  (3am UTC every day)
"""
import json
import logging
import os
import datetime
import tempfile

import psycopg2
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("backup")

FOLDER_ID = os.environ.get("BACKUP_DRIVE_FOLDER_ID", "1APIXrMH1QjNsc_cwGm2KcAStSUXmOlf7")
KEEP_LAST = 7  # number of backups to keep in Drive


def dump_database(database_url: str) -> str:
    conn = psycopg2.connect(database_url)
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
        )
        tables = [row["tablename"] for row in cur.fetchall()]
        dump: dict = {}
        for table in tables:
            cur.execute(f'SELECT * FROM "{table}"')
            dump[table] = [dict(row) for row in cur.fetchall()]
        return json.dumps(dump, default=str, ensure_ascii=False, indent=2)
    finally:
        conn.close()


def upload_to_drive(content: str, filename: str) -> str:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaInMemoryUpload

    sa_json = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]
    sa_info = json.loads(sa_json)
    creds = service_account.Credentials.from_service_account_info(
        sa_info, scopes=["https://www.googleapis.com/auth/drive"]
    )
    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    media = MediaInMemoryUpload(content.encode("utf-8"), mimetype="application/json")
    file_meta = {"name": filename, "parents": [FOLDER_ID]}
    result = service.files().create(body=file_meta, media_body=media, fields="id,name").execute()
    log.info(f"Uploaded: {result['name']} (id={result['id']})")

    # Delete old backups — keep only KEEP_LAST
    existing = (
        service.files()
        .list(
            q=f"'{FOLDER_ID}' in parents and name contains 'maslul-backup' and trashed=false",
            fields="files(id,name,createdTime)",
            orderBy="createdTime desc",
        )
        .execute()
        .get("files", [])
    )
    for old in existing[KEEP_LAST:]:
        service.files().delete(fileId=old["id"]).execute()
        log.info(f"Deleted old backup: {old['name']}")

    return result["id"]


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        log.error("DATABASE_URL not set — aborting")
        raise SystemExit(1)

    sa_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        log.error("GOOGLE_SERVICE_ACCOUNT_JSON not set — aborting")
        raise SystemExit(1)

    log.info("Starting database backup…")
    dump = dump_database(database_url)
    size_kb = len(dump.encode()) // 1024
    log.info(f"Dump ready — {size_kb} KB")

    date_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    filename = f"maslul-backup-{date_str}.json"
    upload_to_drive(dump, filename)
    log.info("Backup complete.")


if __name__ == "__main__":
    main()
