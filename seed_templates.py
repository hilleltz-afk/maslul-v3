"""
Seed שני טמפלייטים מ-"תרשים עבודה - תכנון רישוי - מאסטר.xlsx":
  1. תכנון תב"ע
  2. הליך רישוי

הרץ פעם אחת (idempotent — בודק אם כבר קיים):
  python seed_templates.py
"""
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./maslul.db").replace("postgres://", "postgresql://", 1)
TENANT_ID = "f5e358da-ebfd-47ad-9ee0-3bb638089a1a"

args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=args)
Session = sessionmaker(bind=engine)

from app.models import ProjectTemplate, TemplateStage, TemplateTask

TEMPLATES = [
    {
        "name": "תכנון תב\"ע",
        "description": "הליך תכנון תוכנית בניין עיר — מקדמי עד מתן תוקף",
        "stages": [
            {
                "name": "מקדמי",
                "handling_authority": "יזם / משרד תכנון",
                "color": "#1a3c6e",
                "estimated_days": 60,
                "tasks": [
                    {"title": "בחירת יועצים", "priority": "high"},
                    {"title": "מדידה", "priority": "high"},
                    {"title": "פרוגרמה", "priority": "medium"},
                ],
            },
            {
                "name": "תנאי סף תב\"ע",
                "handling_authority": "ועדה מקומית",
                "color": "#2e5fa3",
                "estimated_days": 70,
                "tasks": [
                    {"title": "תקנון", "priority": "high"},
                    {"title": "נספח בינוי", "priority": "high"},
                    {"title": "נספח תנועה", "priority": "medium"},
                    {"title": "מצב קיים ומוצע", "priority": "medium"},
                ],
            },
            {
                "name": "דיון תב\"ע",
                "handling_authority": "ועדה מקומית",
                "color": "#4a7fc1",
                "estimated_days": 150,
                "tasks": [
                    {"title": "הכנת חומרים לדיון", "priority": "high"},
                    {"title": "המלצת המקומית", "priority": "high"},
                ],
            },
            {
                "name": "הפקדה",
                "handling_authority": "ועדה מחוזית",
                "color": "#6699cc",
                "estimated_days": 90,
                "tasks": [
                    {"title": "תיקון מסמכים", "priority": "high"},
                    {"title": "פרסום להפקדה", "priority": "medium"},
                ],
            },
            {
                "name": "דיון מחוזי",
                "handling_authority": "ועדה מחוזית",
                "color": "#85aacc",
                "estimated_days": 30,
                "tasks": [
                    {"title": "תיקון מסמכים לאחר הפקדה", "priority": "high"},
                    {"title": "פרסום ברשומות", "priority": "medium"},
                ],
            },
            {
                "name": "מתן תוקף",
                "handling_authority": "ועדה מחוזית",
                "color": "#a3c2e0",
                "estimated_days": 60,
                "tasks": [
                    {"title": "קבלת תוקף תב\"ע", "priority": "high"},
                ],
            },
        ],
    },
    {
        "name": "הליך רישוי",
        "description": "הליך קבלת היתר בניה — מתיק מידע עד הפקת היתר",
        "stages": [
            {
                "name": "תיק מידע",
                "handling_authority": "הרשות המקומית",
                "color": "#1a6e3c",
                "estimated_days": 21,
                "tasks": [
                    {"title": "מדידה לרישוי", "priority": "high"},
                    {"title": "הגשת בקשה לתיק מידע", "priority": "high"},
                    {"title": "מינוי יועצים", "priority": "high"},
                ],
            },
            {
                "name": "פתיחת תיק",
                "handling_authority": "הרשות המקומית",
                "color": "#2e8a57",
                "estimated_days": 150,
                "tasks": [
                    {"title": "קווי בניין", "priority": "high"},
                    {"title": "טופס 1", "priority": "high"},
                    {"title": "חישובים סטטיים", "priority": "high"},
                    {"title": "תשלום מקדמה", "priority": "high"},
                    {"title": "רשות עתיקות", "priority": "medium"},
                    {"title": "אישור חח\"י", "priority": "high"},
                    {"title": "אישור בזק", "priority": "medium"},
                    {"title": "טפסי השבחה", "priority": "high"},
                    {"title": "בעלויות", "priority": "medium"},
                    {"title": "תעודות עו\"ב ומהנדס", "priority": "high"},
                ],
            },
            {
                "name": "תנאי סף רישוי",
                "handling_authority": "גורמים מאשרים",
                "color": "#4aad78",
                "estimated_days": 30,
                "tasks": [
                    {"title": "שפ\"ע", "priority": "high"},
                    {"title": "איכות הסביבה", "priority": "high"},
                    {"title": "תושיה דרכים", "priority": "medium"},
                    {"title": "תושיה תנועה", "priority": "medium"},
                    {"title": "שימור", "priority": "medium"},
                    {"title": "חוו\"ד אדריכל העיר", "priority": "high"},
                    {"title": "תברואה", "priority": "medium"},
                    {"title": "בניה ירוקה", "priority": "medium"},
                ],
            },
            {
                "name": "דיון רישוי",
                "handling_authority": "ועדת רישוי",
                "color": "#6dc99a",
                "estimated_days": 180,
                "tasks": [
                    {"title": "הכנת חומרים לדיון רישוי", "priority": "high"},
                    {"title": "אישור גורמים", "priority": "high"},
                ],
            },
            {
                "name": "אישור גורמים",
                "handling_authority": "גורמים מאשרים",
                "color": "#8eddb8",
                "estimated_days": 30,
                "tasks": [
                    {"title": "פקע\"ר", "priority": "high"},
                    {"title": "כב\"א", "priority": "high"},
                    {"title": "גיחון", "priority": "high"},
                    {"title": "הערת אזהרה", "priority": "medium"},
                    {"title": "גז", "priority": "medium"},
                    {"title": "נגישות", "priority": "high"},
                    {"title": "חוזה מעבדה", "priority": "medium"},
                    {"title": "היטל סלילה", "priority": "high"},
                    {"title": "היטל השבחה", "priority": "high"},
                    {"title": "אגרות בניה", "priority": "high"},
                    {"title": "תיקון תכניות סופי", "priority": "high"},
                ],
            },
            {
                "name": "הפקת היתר",
                "handling_authority": "הרשות המקומית",
                "color": "#b0ecd4",
                "estimated_days": None,
                "tasks": [
                    {"title": "הפקת היתר בניה", "priority": "high"},
                ],
            },
        ],
    },
]


def seed():
    db = Session()
    try:
        for tmpl_data in TEMPLATES:
            existing = db.query(ProjectTemplate).filter(
                ProjectTemplate.tenant_id == TENANT_ID,
                ProjectTemplate.name == tmpl_data["name"],
                ProjectTemplate.deleted_at.is_(None),
            ).first()
            if existing:
                print(f"  קיים: {tmpl_data['name']} — דילוג")
                continue

            now = datetime.now(timezone.utc)
            tmpl = ProjectTemplate(
                id=uuid.uuid4(),
                tenant_id=TENANT_ID,
                name=tmpl_data["name"],
                description=tmpl_data.get("description"),
                created_at=now,
                updated_at=now,
            )
            db.add(tmpl)
            db.flush()

            for si, stage_data in enumerate(tmpl_data["stages"]):
                stage = TemplateStage(
                    id=uuid.uuid4(),
                    template_id=tmpl.id,
                    name=stage_data["name"],
                    handling_authority=stage_data.get("handling_authority", ""),
                    color=stage_data.get("color", "#011e41"),
                    order=si,
                    estimated_days=stage_data.get("estimated_days"),
                    created_at=now,
                    updated_at=now,
                )
                db.add(stage)
                db.flush()

                for ti, task_data in enumerate(stage_data["tasks"]):
                    task = TemplateTask(
                        id=uuid.uuid4(),
                        template_stage_id=stage.id,
                        title=task_data["title"],
                        priority=task_data.get("priority", "medium"),
                        order=ti,
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(task)

            db.commit()
            n_stages = len(tmpl_data["stages"])
            n_tasks = sum(len(s["tasks"]) for s in tmpl_data["stages"])
            print(f"  OK: {tmpl_data['name']} -- {n_stages} stages, {n_tasks} tasks")

    finally:
        db.close()


if __name__ == "__main__":
    print("Seeding templates...")
    seed()
    print("Done.")
