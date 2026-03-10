"""add email_pipeline table

Revision ID: 176c7ff655e1
Revises: e77d079a4661
Create Date: 2026-03-10 12:30:26.585550

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from app.models import GUID


# revision identifiers, used by Alembic.
revision: str = '176c7ff655e1'
down_revision: Union[str, None] = 'e77d079a4661'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'email_pipeline',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('tenant_id', GUID(), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('gmail_message_id', sa.String(), nullable=True),
        sa.Column('sender', sa.String(), nullable=False),
        sa.Column('subject', sa.String(), nullable=False),
        sa.Column('body_preview', sa.Text(), nullable=True),
        sa.Column('full_body', sa.Text(), nullable=True),
        sa.Column('triage_is_relevant', sa.Integer(), nullable=True),
        sa.Column('triage_confidence', sa.Float(), nullable=True),
        sa.Column('triage_reason', sa.Text(), nullable=True),
        sa.Column('suggested_project_id', GUID(), sa.ForeignKey('projects.id'), nullable=True),
        sa.Column('project_match_confidence', sa.Float(), nullable=True),
        sa.Column('suggested_task_name', sa.String(), nullable=True),
        sa.Column('suggested_priority', sa.String(), nullable=True),
        sa.Column('suggested_assignee', sa.String(), nullable=True),
        sa.Column('suggested_due_date', sa.DateTime(), nullable=True),
        sa.Column('has_attachments', sa.Integer(), nullable=True),
        sa.Column('budget_mentioned', sa.Float(), nullable=True),
        sa.Column('analysis_notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('created_task_id', GUID(), sa.ForeignKey('tasks.id'), nullable=True),
        sa.Column('reviewed_by', GUID(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', GUID(), sa.ForeignKey('users.id'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('email_pipeline')
