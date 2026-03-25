"""Project Template router — CRUD + apply to project."""
from datetime import datetime, timezone, timedelta
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..deps import get_current_user_id, get_db

router = APIRouter(prefix="/tenants/{tenant_id}/templates", tags=["templates"])


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_template_or_404(db: Session, tenant_id: UUID, template_id: UUID) -> models.ProjectTemplate:
    t = (
        db.query(models.ProjectTemplate)
        .filter(
            models.ProjectTemplate.id == template_id,
            models.ProjectTemplate.tenant_id == tenant_id,
            models.ProjectTemplate.deleted_at.is_(None),
        )
        .first()
    )
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="טמפלייט לא נמצא")
    return t


def _load_template_full(db: Session, template: models.ProjectTemplate) -> schemas.ProjectTemplateRead:
    """Load template with nested stages + tasks."""
    stages = (
        db.query(models.TemplateStage)
        .filter(
            models.TemplateStage.template_id == template.id,
            models.TemplateStage.deleted_at.is_(None),
        )
        .order_by(models.TemplateStage.order)
        .all()
    )
    stage_reads = []
    for s in stages:
        tasks = (
            db.query(models.TemplateTask)
            .filter(
                models.TemplateTask.template_stage_id == s.id,
                models.TemplateTask.deleted_at.is_(None),
            )
            .order_by(models.TemplateTask.order)
            .all()
        )
        stage_reads.append(schemas.TemplateStageRead(
            id=s.id,
            template_id=s.template_id,
            name=s.name,
            handling_authority=s.handling_authority or "",
            color=s.color,
            order=s.order,
            estimated_days=s.estimated_days,
            tasks=[schemas.TemplateTaskRead(
                id=t.id,
                template_stage_id=t.template_stage_id,
                title=t.title,
                description=t.description,
                priority=t.priority,
                order=t.order,
                assignee_role=t.assignee_role,
            ) for t in tasks],
        ))
    return schemas.ProjectTemplateRead(
        id=template.id,
        tenant_id=template.tenant_id,
        name=template.name,
        description=template.description,
        stages=stage_reads,
        created_at=template.created_at,
        created_by=template.created_by,
    )


# ── Template CRUD ──────────────────────────────────────────────────────────

@router.post("/", response_model=schemas.ProjectTemplateRead, status_code=status.HTTP_201_CREATED)
def create_template(
    tenant_id: UUID,
    body: schemas.ProjectTemplateCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    now = datetime.now(timezone.utc)
    template = models.ProjectTemplate(
        id=uuid4(),
        tenant_id=tenant_id,
        name=body.name,
        description=body.description,
        created_at=now,
        updated_at=now,
        created_by=user_id,
    )
    db.add(template)
    db.flush()

    for si, stage_in in enumerate(body.stages):
        stage = models.TemplateStage(
            id=uuid4(),
            template_id=template.id,
            name=stage_in.name,
            handling_authority=stage_in.handling_authority,
            color=stage_in.color,
            order=stage_in.order if stage_in.order else si,
            estimated_days=stage_in.estimated_days,
            created_at=now,
            updated_at=now,
        )
        db.add(stage)
        db.flush()

        for ti, task_in in enumerate(stage_in.tasks):
            task = models.TemplateTask(
                id=uuid4(),
                template_stage_id=stage.id,
                title=task_in.title,
                description=task_in.description,
                priority=task_in.priority,
                order=task_in.order if task_in.order else ti,
                assignee_role=task_in.assignee_role,
                created_at=now,
                updated_at=now,
            )
            db.add(task)

    db.commit()
    db.refresh(template)
    return _load_template_full(db, template)


@router.get("/", response_model=list[schemas.ProjectTemplateRead])
def list_templates(tenant_id: UUID, db: Session = Depends(get_db)):
    templates = (
        db.query(models.ProjectTemplate)
        .filter(
            models.ProjectTemplate.tenant_id == tenant_id,
            models.ProjectTemplate.deleted_at.is_(None),
        )
        .order_by(models.ProjectTemplate.name)
        .all()
    )
    return [_load_template_full(db, t) for t in templates]


@router.get("/{template_id}", response_model=schemas.ProjectTemplateRead)
def get_template(tenant_id: UUID, template_id: UUID, db: Session = Depends(get_db)):
    t = _get_template_or_404(db, tenant_id, template_id)
    return _load_template_full(db, t)


@router.put("/{template_id}", response_model=schemas.ProjectTemplateRead)
def update_template(
    tenant_id: UUID,
    template_id: UUID,
    body: schemas.ProjectTemplateUpdate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    t = _get_template_or_404(db, tenant_id, template_id)
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    crud.update_entity(db, t, data, changed_by=user_id)
    db.commit()
    db.refresh(t)
    return _load_template_full(db, t)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    tenant_id: UUID,
    template_id: UUID,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    t = _get_template_or_404(db, tenant_id, template_id)
    crud.soft_delete_entity(db, t, changed_by=user_id)
    db.commit()
    return None


# ── Stage CRUD within template ─────────────────────────────────────────────

@router.post("/{template_id}/stages", response_model=schemas.TemplateStageRead, status_code=status.HTTP_201_CREATED)
def add_stage(
    tenant_id: UUID,
    template_id: UUID,
    body: schemas.TemplateStageCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    _get_template_or_404(db, tenant_id, template_id)
    now = datetime.now(timezone.utc)
    stage = models.TemplateStage(
        id=uuid4(),
        template_id=template_id,
        name=body.name,
        handling_authority=body.handling_authority,
        color=body.color,
        order=body.order,
        estimated_days=body.estimated_days,
        created_at=now,
        updated_at=now,
    )
    db.add(stage)
    db.flush()
    for ti, task_in in enumerate(body.tasks):
        db.add(models.TemplateTask(
            id=uuid4(),
            template_stage_id=stage.id,
            title=task_in.title,
            description=task_in.description,
            priority=task_in.priority,
            order=task_in.order if task_in.order else ti,
            assignee_role=task_in.assignee_role,
            created_at=now,
            updated_at=now,
        ))
    db.commit()
    db.refresh(stage)
    tasks = db.query(models.TemplateTask).filter(
        models.TemplateTask.template_stage_id == stage.id,
        models.TemplateTask.deleted_at.is_(None),
    ).order_by(models.TemplateTask.order).all()
    return schemas.TemplateStageRead(
        id=stage.id, template_id=stage.template_id, name=stage.name,
        handling_authority=stage.handling_authority or "", color=stage.color,
        order=stage.order, estimated_days=stage.estimated_days,
        tasks=[schemas.TemplateTaskRead(
            id=t.id, template_stage_id=t.template_stage_id, title=t.title,
            description=t.description, priority=t.priority, order=t.order,
        ) for t in tasks],
    )


@router.put("/{template_id}/stages/{stage_id}", response_model=schemas.TemplateStageRead)
def update_stage(
    tenant_id: UUID, template_id: UUID, stage_id: UUID,
    body: schemas.TemplateStageUpdate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    _get_template_or_404(db, tenant_id, template_id)
    stage = db.query(models.TemplateStage).filter(
        models.TemplateStage.id == stage_id,
        models.TemplateStage.template_id == template_id,
        models.TemplateStage.deleted_at.is_(None),
    ).first()
    if not stage:
        raise HTTPException(404, "שלב לא נמצא")
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    crud.update_entity(db, stage, data, changed_by=user_id)
    db.commit()
    db.refresh(stage)
    tasks = db.query(models.TemplateTask).filter(
        models.TemplateTask.template_stage_id == stage.id,
        models.TemplateTask.deleted_at.is_(None),
    ).order_by(models.TemplateTask.order).all()
    return schemas.TemplateStageRead(
        id=stage.id, template_id=stage.template_id, name=stage.name,
        handling_authority=stage.handling_authority or "", color=stage.color,
        order=stage.order, estimated_days=stage.estimated_days,
        tasks=[schemas.TemplateTaskRead(
            id=t.id, template_stage_id=t.template_stage_id, title=t.title,
            description=t.description, priority=t.priority, order=t.order,
        ) for t in tasks],
    )


@router.delete("/{template_id}/stages/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stage(
    tenant_id: UUID, template_id: UUID, stage_id: UUID,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    _get_template_or_404(db, tenant_id, template_id)
    stage = db.query(models.TemplateStage).filter(
        models.TemplateStage.id == stage_id,
        models.TemplateStage.template_id == template_id,
        models.TemplateStage.deleted_at.is_(None),
    ).first()
    if not stage:
        raise HTTPException(404, "שלב לא נמצא")
    crud.soft_delete_entity(db, stage, changed_by=user_id)
    db.commit()
    return None


# ── Task CRUD within stage ─────────────────────────────────────────────────

@router.post("/{template_id}/stages/{stage_id}/tasks", response_model=schemas.TemplateTaskRead, status_code=status.HTTP_201_CREATED)
def add_task(
    tenant_id: UUID, template_id: UUID, stage_id: UUID,
    body: schemas.TemplateTaskCreate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    _get_template_or_404(db, tenant_id, template_id)
    now = datetime.now(timezone.utc)
    task = models.TemplateTask(
        id=uuid4(),
        template_stage_id=stage_id,
        title=body.title,
        description=body.description,
        priority=body.priority,
        order=body.order,
        assignee_role=body.assignee_role,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.put("/{template_id}/stages/{stage_id}/tasks/{task_id}", response_model=schemas.TemplateTaskRead)
def update_task(
    tenant_id: UUID, template_id: UUID, stage_id: UUID, task_id: UUID,
    body: schemas.TemplateTaskUpdate,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    _get_template_or_404(db, tenant_id, template_id)
    task = db.query(models.TemplateTask).filter(
        models.TemplateTask.id == task_id,
        models.TemplateTask.template_stage_id == stage_id,
        models.TemplateTask.deleted_at.is_(None),
    ).first()
    if not task:
        raise HTTPException(404, "משימה לא נמצאה")
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    crud.update_entity(db, task, data, changed_by=user_id)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{template_id}/stages/{stage_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    tenant_id: UUID, template_id: UUID, stage_id: UUID, task_id: UUID,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    _get_template_or_404(db, tenant_id, template_id)
    task = db.query(models.TemplateTask).filter(
        models.TemplateTask.id == task_id,
        models.TemplateTask.template_stage_id == stage_id,
        models.TemplateTask.deleted_at.is_(None),
    ).first()
    if not task:
        raise HTTPException(404, "משימה לא נמצאה")
    crud.soft_delete_entity(db, task, changed_by=user_id)
    db.commit()
    return None


# ── Apply template to project ──────────────────────────────────────────────

@router.post("/{template_id}/apply", status_code=status.HTTP_201_CREATED)
def apply_template(
    tenant_id: UUID,
    template_id: UUID,
    body: schemas.ApplyTemplateRequest,
    db: Session = Depends(get_db),
    user_id: str | None = Depends(get_current_user_id),
):
    """
    יוצר שלבים ומשימות בפרויקט על פי הטמפלייט.
    רק המשימות שב-selected_task_ids נוצרות.
    אם estimated_days + start_date סופקו — מחשב due_date לכל שלב.
    """
    _get_template_or_404(db, tenant_id, template_id)

    # Verify project belongs to tenant
    project = db.query(models.Project).filter(
        models.Project.id == body.project_id,
        models.Project.tenant_id == tenant_id,
        models.Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(404, "פרויקט לא נמצא")

    selected = set(str(tid) for tid in body.selected_task_ids)

    # Parse start date
    cursor_date: datetime | None = None
    if body.start_date:
        try:
            cursor_date = datetime.strptime(body.start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    stages = (
        db.query(models.TemplateStage)
        .filter(
            models.TemplateStage.template_id == template_id,
            models.TemplateStage.deleted_at.is_(None),
        )
        .order_by(models.TemplateStage.order)
        .all()
    )

    now = datetime.now(timezone.utc)
    created_stages = 0
    created_tasks = 0

    # Build profession → user_id map from project_professionals
    # profession → contact → user (matched by email)
    proj_profs = db.query(models.ProjectProfessional).filter(
        models.ProjectProfessional.project_id == str(body.project_id),
        models.ProjectProfessional.deleted_at.is_(None),
    ).all()
    profession_to_user: dict[str, str] = {}
    for pp in proj_profs:
        contact = db.query(models.Contact).filter(
            models.Contact.id == pp.contact_id,
            models.Contact.deleted_at.is_(None),
        ).first()
        if not contact or not contact.email:
            continue
        user = db.query(models.User).filter(
            models.User.email == contact.email,
            models.User.tenant_id == str(tenant_id),
            models.User.deleted_at.is_(None),
        ).first()
        if user:
            profession_to_user[pp.profession.strip()] = str(user.id)

    for ts in stages:
        template_tasks = (
            db.query(models.TemplateTask)
            .filter(
                models.TemplateTask.template_stage_id == ts.id,
                models.TemplateTask.deleted_at.is_(None),
            )
            .order_by(models.TemplateTask.order)
            .all()
        )

        # Only create stage if at least one task is selected
        selected_tasks = [t for t in template_tasks if str(t.id) in selected]
        if not selected_tasks:
            if cursor_date and ts.estimated_days:
                cursor_date += timedelta(days=ts.estimated_days)
            continue

        # Calculate stage end date
        stage_end: datetime | None = None
        if cursor_date and ts.estimated_days:
            stage_end = cursor_date + timedelta(days=ts.estimated_days)

        stage = models.Stage(
            id=uuid4(),
            tenant_id=tenant_id,
            project_id=body.project_id,
            name=ts.name,
            handling_authority=ts.handling_authority or "",
            color=ts.color or "#011e41",
            created_at=now,
            updated_at=now,
            created_by=user_id,
        )
        db.add(stage)
        db.flush()
        created_stages += 1

        for tt in selected_tasks:
            # Auto-assign by profession if possible
            assignee = None
            if tt.assignee_role:
                assignee = profession_to_user.get(tt.assignee_role.strip())
            task = models.Task(
                id=uuid4(),
                tenant_id=tenant_id,
                project_id=body.project_id,
                stage_id=stage.id,
                title=tt.title,
                description=tt.description,
                priority=tt.priority,
                status="in_progress",
                assignee_id=assignee,
                start_date=cursor_date,
                end_date=stage_end,
                created_at=now,
                updated_at=now,
                created_by=user_id,
            )
            db.add(task)
            created_tasks += 1

        if cursor_date and ts.estimated_days:
            cursor_date += timedelta(days=ts.estimated_days)

    db.commit()
    return {
        "ok": True,
        "created_stages": created_stages,
        "created_tasks": created_tasks,
    }
