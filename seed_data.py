"""
seed_data.py — נתוני דוגמה למערכת מסלול
הרץ: DATABASE_URL="..." python seed_data.py
"""
from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal
from app import models
from datetime import datetime, timedelta, timezone
import uuid

db = SessionLocal()

# שלוף tenant קיים
tenant = db.query(models.Tenant).filter(models.Tenant.name == "Hadas Capital").first()
if not tenant:
    print("ERROR: לא נמצא Tenant. הרץ קודם seed.py")
    exit(1)

user = db.query(models.User).filter(models.User.email == "hillel_tz@hadas-capital.com").first()
tid = str(tenant.id)
uid = str(user.id) if user else None

def new_id(): return str(uuid.uuid4())
def now(): return datetime.now(timezone.utc)

# ---------- פרויקטים ----------
projects_data = [
    ("רמת אביב גימל — מגדל מגורים", "6100", "120"),
    ("נווה שרת — בניין מסחרי", "7250", "45"),
    ("הרצליה פיתוח — קומפלקס משרדים", "5500", "88"),
]
projects = []
for name, gush, helka in projects_data:
    existing = db.query(models.Project).filter(
        models.Project.tenant_id == tid,
        models.Project.name == name,
        models.Project.deleted_at.is_(None),
    ).first()
    if existing:
        projects.append(existing)
        print(f"  פרויקט קיים: {name}")
    else:
        p = models.Project(id=new_id(), tenant_id=tid, name=name, gush=gush, helka=helka, created_by=uid)
        db.add(p)
        db.flush()
        projects.append(p)
        print(f"  + פרויקט: {name}")

db.commit()

# ---------- שלבים + משימות ----------
stages_tasks = [
    ("היתר בנייה", "עירייה", [
        ("הגשת בקשה להיתר", "high", "in_progress"),
        ("קבלת אישור תנועה", "medium", "todo"),
        ("חתימת שכנים", "low", "done"),
    ]),
    ("תכנון אדריכלי", "משרד האדריכלים", [
        ("הכנת שרטוטים — קומה א", "high", "in_progress"),
        ("אישור תב\"ע", "high", "todo"),
    ]),
    ("ביצוע", "קבלן ראשי", [
        ("יציקת יסודות", "high", "todo"),
        ("עבודות חשמל קומה 1-3", "medium", "todo"),
    ]),
]

for proj in projects[:2]:  # רק 2 פרויקטים ראשונים כדי לא לנפח
    for stage_name, authority, tasks in stages_tasks:
        stage = db.query(models.Stage).filter(
            models.Stage.tenant_id == tid,
            models.Stage.project_id == str(proj.id),
            models.Stage.name == stage_name,
            models.Stage.deleted_at.is_(None),
        ).first()
        if not stage:
            stage = models.Stage(
                id=new_id(), tenant_id=tid, project_id=str(proj.id),
                name=stage_name, handling_authority=authority, created_by=uid,
            )
            db.add(stage)
            db.flush()

        for title, priority, status in tasks:
            exists = db.query(models.Task).filter(
                models.Task.tenant_id == tid,
                models.Task.stage_id == str(stage.id),
                models.Task.title == title,
                models.Task.deleted_at.is_(None),
            ).first()
            if not exists:
                db.add(models.Task(
                    id=new_id(), tenant_id=tid,
                    project_id=str(proj.id), stage_id=str(stage.id),
                    title=title, priority=priority, status=status,
                    assignee_id=uid, created_by=uid,
                ))

db.commit()
print("  + שלבים ומשימות נוצרו")

# ---------- אנשי קשר ----------
contacts_data = [
    ("אברהם כהן", "050-1234567", "avraham@gmail.com"),
    ("שרה לוי", "052-9876543", "sarah.levi@hadas-capital.com"),
    ("דוד מזרחי — עו\"ד", "054-1112233", "mazrahi.law@gmail.com"),
    ("רונית אדריכלות בע\"מ", "03-5556677", "ronit@arch.co.il"),
    ("עיריית תל אביב — מח' רישוי", None, "rishuytlv@tel-aviv.gov.il"),
]
for name, phone, email in contacts_data:
    if not db.query(models.Contact).filter(
        models.Contact.tenant_id == tid,
        models.Contact.name == name,
        models.Contact.deleted_at.is_(None),
    ).first():
        db.add(models.Contact(id=new_id(), tenant_id=tid, name=name, phone=phone, email=email, created_by=uid))

db.commit()
print("  + אנשי קשר נוצרו")

# ---------- מסמכים ----------
docs_data = [
    ("היתר בנייה — רמת אביב גימל", "/docs/permit_ramat_aviv.pdf", now() + timedelta(days=45)),
    ("חוזה קבלן ראשי", "/docs/contract_main.pdf", now() + timedelta(days=180)),
    ("ביטוח אתר בנייה", "/docs/insurance_site.pdf", now() + timedelta(days=12)),  # פג בקרוב!
    ("אישור תב\"ע", "/docs/taba.pdf", now() + timedelta(days=365)),
    ("פרוטוקול ישיבת דיירים", "/docs/meeting_notes.pdf", None),
    ("תשריט קומה 3", "/docs/floor3_plan.pdf", now() - timedelta(days=5)),  # פג תוקף!
]
for name, path, expiry in docs_data:
    if not db.query(models.Document).filter(
        models.Document.tenant_id == tid,
        models.Document.name == name,
        models.Document.deleted_at.is_(None),
    ).first():
        db.add(models.Document(
            id=new_id(), tenant_id=tid,
            project_id=str(projects[0].id),
            name=name, path=path,
            expiry_date=expiry,
            created_by=uid,
        ))

db.commit()
print("  + מסמכים נוצרו")

# ---------- Email Pipeline ----------
pipeline_data = [
    ("avraham.cohen@gmail.com", "עדכון לגבי היתר הבנייה", "שלום, רציתי לעדכן שהגשנו את הבקשה לעירייה אתמול..."),
    ("sarah.levi@contractor.co.il", "הצעת מחיר — יציקת יסודות", "מצורפת הצעת מחיר לעבודות יציקה בסך 850,000 ש\"ח..."),
    ("newsletter@realestate.co.il", "ניוזלטר שוק הנדל\"ן — מרץ 2026", "שוק הנדל\"ן: עלייה של 3% במחירים..."),
]
for sender, subject, body in pipeline_data:
    if not db.query(models.EmailPipelineItem).filter(
        models.EmailPipelineItem.tenant_id == tid,
        models.EmailPipelineItem.subject == subject,
        models.EmailPipelineItem.deleted_at.is_(None),
    ).first():
        db.add(models.EmailPipelineItem(
            id=new_id(), tenant_id=tid,
            sender=sender, subject=subject,
            body_preview=body[:200], full_body=body,
            triage_is_relevant=1,
            triage_confidence=0.9,
            status=models.EmailPipelineStatus.PENDING,
            created_by=uid,
        ))

db.commit()
print("  + Email pipeline נוצר")

db.close()
print("\nDone! נתוני דוגמה נוצרו בהצלחה.")
