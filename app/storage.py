import os
import uuid
import boto3
from botocore.config import Config

R2_ACCOUNT_ID     = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID  = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_KEY     = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET         = os.getenv("R2_BUCKET", "maslul-docs")
R2_PUBLIC_URL     = os.getenv("R2_PUBLIC_URL", "")  # https://pub-xxx.r2.dev

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
    return _client


def upload_file(content: bytes, original_filename: str) -> str:
    """Upload file to R2, return public URL."""
    ext = os.path.splitext(original_filename)[1]
    key = f"docs/{uuid.uuid4()}{ext}"
    _get_client().put_object(
        Bucket=R2_BUCKET,
        Key=key,
        Body=content,
        ContentDisposition=f'inline; filename="{original_filename}"',
    )
    return f"{R2_PUBLIC_URL}/{key}"


def delete_file(public_url: str) -> None:
    """Delete file from R2 by its public URL."""
    if not R2_PUBLIC_URL or not public_url.startswith(R2_PUBLIC_URL):
        return
    key = public_url[len(R2_PUBLIC_URL):].lstrip("/")
    try:
        _get_client().delete_object(Bucket=R2_BUCKET, Key=key)
    except Exception:
        pass


def r2_configured() -> bool:
    return bool(R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_KEY and R2_PUBLIC_URL)
