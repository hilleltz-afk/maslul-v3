from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI

from .routers import api_router

app = FastAPI(title="Maslul API", version="1.0.0")
app.include_router(api_router)

@app.get("/")
def read_root():
    return {"message": "ברוכים הבאים ל-API של מסלול"}