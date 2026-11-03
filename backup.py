"""
Daily database backup — uploads JSON dump to Google Drive.
Run via Railway Cron Job: 0 3 * * *  (3am UTC every day)
"""
import json
import logging
import os
import datetime

import psycopg2
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("backup")

FOLDER_ID = os.environ.get("BACKUP_DRIVE_FOLDER_ID", "1APIXrMH1QjNsc_cwGm2KcAStSUXmOlf7")
KEEP_LAST = 7


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


def get_drive_credentials():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    creds = Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_DRIVE_REFRESH_TOKEN"],
        client_id=os.environ["GOOGLE_BACKUP_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_BACKUP_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/drive.file"],
    )
    creds.refresh(Request())
    return creds


def upload_to_drive(content: str, filename: str) -> str:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaInMemoryUpload

    creds = get_drive_credentials()
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
    for var in ("GOOGLE_DRIVE_REFRESH_TOKEN", "GOOGLE_BACKUP_CLIENT_ID", "GOOGLE_BACKUP_CLIENT_SECRET"):
        if not os.environ.get(var):
            log.error(f"{var} not set — aborting")
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
