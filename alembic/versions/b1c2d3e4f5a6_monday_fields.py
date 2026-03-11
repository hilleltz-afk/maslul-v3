"""monday fields — color to stages, dates/custom_fields to tasks, expanded contacts

Revision ID: b1c2d3e4f5a6
Revises: a3f1b2c4d5e6
Create Date: 2026-03-11
"""
from alembic import op
import sqlalchemy as sa

revision = 'b1c2d3e4f5a6'
down_revision = 'a3f1b2c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- stages: color ---
    op.add_column('stages', sa.Column('color', sa.String(), nullable=True))

    # --- tasks: תאריכים + custom_fields ---
    op.add_column('tasks', sa.Column('start_date', sa.DateTime(), nullable=True))
    op.add_column('tasks', sa.Column('end_date', sa.DateTime(), nullable=True))
    op.add_column('tasks', sa.Column('custom_fields', sa.Text(), nullable=True))

    # --- contacts: שדות מורחבים ---
    op.add_column('contacts', sa.Column('profession', sa.String(), nullable=True))
    op.add_column('contacts', sa.Column('office_name', sa.String(), nullable=True))
    op.add_column('contacts', sa.Column('mobile_phone', sa.String(), nullable=True))
    op.add_column('contacts', sa.Column('notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('stages', 'color')
    op.drop_column('tasks', 'start_date')
    op.drop_column('tasks', 'end_date')
    op.drop_column('tasks', 'custom_fields')
    op.drop_column('contacts', 'profession')
    op.drop_column('contacts', 'office_name')
    op.drop_column('contacts', 'mobile_phone')
    op.drop_column('contacts', 'notes')
