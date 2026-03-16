from dotenv import load_dotenv
load_dotenv()

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .routers import api_router

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="Maslul API", version="1.0.0")

# CORS — מאפשר קריאות מה-frontend (JWT בלבד, לא cookies)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/")
def read_root():
    return {"message": "ברוכים הבאים ל-API של מסלול"}

@app.get("/debug/r2")
def debug_r2():
    from . import storage
    import os
    try:
        client = storage._get_client()
        client.list_objects_v2(Bucket=storage.R2_BUCKET, MaxKeys=1)
        return {"ok": True, "bucket": storage.R2_BUCKET, "account": storage.R2_ACCOUNT_ID[:8] + "..."}
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "account_id_len": len(storage.R2_ACCOUNT_ID),
            "key_id_prefix": storage.R2_ACCESS_KEY_ID[:8] if storage.R2_ACCESS_KEY_ID else None,
            "secret_len": len(storage.R2_SECRET_KEY),
            "bucket": storage.R2_BUCKET,
        }
