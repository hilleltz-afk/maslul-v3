"""
סקריפט אתחול — יוצר Tenant ומשתמש ראשון במערכת.
הרץ פעם אחת בלבד: python seed.py
"""
from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal, Base, engine
from app import models
import uuid

# צור את כל הטבלאות אם לא קיימות
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# בדוק אם כבר קיים tenant
existing_tenant = db.query(models.Tenant).filter(models.Tenant.name == "Hadas Capital").first()
if existing_tenant:
    tenant = existing_tenant
    print(f"OK Tenant קיים: {tenant.name} ({tenant.id})")
else:
    tenant = models.Tenant(id=str(uuid.uuid4()), name="Hadas Capital")
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    print(f"OK נוצר Tenant: {tenant.name} ({tenant.id})")

# בדוק אם המשתמש כבר קיים
EMAIL = "hillel_tz@hadas-capital.com"
existing_user = db.query(models.User).filter(models.User.email == EMAIL).first()
if existing_user:
    print(f"OK משתמש קיים: {existing_user.name} ({existing_user.email})")
else:
    user = models.User(
        id=str(uuid.uuid4()),
        tenant_id=str(tenant.id),
        email=EMAIL,
        name="הלל",
    )
    db.add(user)
    db.commit()
    print(f"OK נוצר משתמש: {user.name} ({user.email})")

db.close()
print("\nהכל מוכן! עכשיו אפשר להיכנס עם Google:")
print("   http://localhost:8000/auth/login")
