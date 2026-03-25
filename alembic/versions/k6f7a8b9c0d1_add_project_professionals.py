"""add project_professionals table

Revision ID: k6f7a8b9c0d1
Revises: j5e6f7a8b9c0
Create Date: 2026-03-25

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from app.models import GUID

revision: str = 'k6f7a8b9c0d1'
down_revision: Union[str, None] = 'j5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'project_professionals',
        sa.Column('id', GUID(), primary_key=True),
        sa.Column('tenant_id', GUID(), nullable=False),
        sa.Column('project_id', GUID(), nullable=False),
        sa.Column('contact_id', GUID(), nullable=False),
        sa.Column('profession', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', GUID(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('project_professionals')
