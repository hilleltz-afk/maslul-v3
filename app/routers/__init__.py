from fastapi import APIRouter

from . import ai, auth, budget, comments, contacts, documents, pipeline, projects, project_aliases, stages, tasks, tenants, users

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(tenants.router)
api_router.include_router(users.router)
api_router.include_router(projects.router)
api_router.include_router(project_aliases.router)
api_router.include_router(stages.router)
api_router.include_router(tasks.router)
api_router.include_router(contacts.router)
api_router.include_router(documents.router)
api_router.include_router(ai.router)
api_router.include_router(pipeline.router)
api_router.include_router(budget.router)
api_router.include_router(comments.router)
