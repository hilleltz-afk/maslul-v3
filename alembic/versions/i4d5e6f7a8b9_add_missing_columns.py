"""add contact_id to tasks, gmail_refresh_token to users

Revision ID: i4d5e6f7a8b9
Revises: h3c4d5e6f7a8
Create Date: 2026-03-24

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'i4d5e6f7a8b9'
down_revision: Union[str, None] = 'h3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('contact_id', sa.String(36), nullable=True))
    op.add_column('users', sa.Column('gmail_refresh_token', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('tasks', 'contact_id')
    op.drop_column('users', 'gmail_refresh_token')
