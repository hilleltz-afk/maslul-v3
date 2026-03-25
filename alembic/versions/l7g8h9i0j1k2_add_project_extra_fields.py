"""add project description, company_name, company_id

Revision ID: l7g8h9i0j1k2
Revises: k6f7a8b9c0d1
Create Date: 2026-03-25

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "l7g8h9i0j1k2"
down_revision: Union[str, None] = "k6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("projects", sa.Column("company_name", sa.String(), nullable=True))
    op.add_column("projects", sa.Column("company_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "company_id")
    op.drop_column("projects", "company_name")
    op.drop_column("projects", "description")
