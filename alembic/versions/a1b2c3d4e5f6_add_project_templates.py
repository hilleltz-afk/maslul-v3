"""add project templates

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-03-22 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from app.models import GUID

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = ("d3e4f5a6b7c8", "f1a2b3c4d5e6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_templates",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("tenant_id", GUID(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", GUID(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_table(
        "template_stages",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("template_id", GUID(), sa.ForeignKey("project_templates.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("handling_authority", sa.String(), nullable=False, server_default=""),
        sa.Column("color", sa.String(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("estimated_days", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "template_tasks",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("template_stage_id", GUID(), sa.ForeignKey("template_stages.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(), nullable=False, server_default="medium"),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("template_tasks")
    op.drop_table("template_stages")
    op.drop_table("project_templates")
