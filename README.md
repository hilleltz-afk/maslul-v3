# Maslul MVP (Phase 1)

AI-powered office management for real-estate planning.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
```

## Run

```bash
python -m uvicorn app.main:app --reload
```

API docs:
- http://127.0.0.1:8000/docs

## Tests

```bash
python -m pytest -q
```
