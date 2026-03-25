"""add assignee_role to template_tasks

Revision ID: j5e6f7a8b9c0
Revises: i4d5e6f7a8b9
Create Date: 2026-03-25

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'j5e6f7a8b9c0'
down_revision: Union[str, None] = 'i4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('template_tasks', sa.Column('assignee_role', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('template_tasks', 'assignee_role')
