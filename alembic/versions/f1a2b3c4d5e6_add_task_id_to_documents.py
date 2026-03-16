"""add task_id to documents

Revision ID: f1a2b3c4d5e6
Revises: e77d079a4661
Create Date: 2026-03-16 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e77d079a4661'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('task_id', sa.String(36), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'task_id')
