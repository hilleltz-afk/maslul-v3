"""add budget_entries, task_comments, project.budget_total

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-03-11 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from app.models import GUID

revision = 'd3e4f5a6b7c8'
down_revision = 'c2d3e4f5a6b7'
branch_labels = None
depends_on = None


def upgrade():
    # Add budget_total to projects
    op.add_column('projects', sa.Column('budget_total', sa.Float(), nullable=True))
    op.add_column('projects', sa.Column('address', sa.String(), nullable=True))

    # Budget entries
    op.create_table(
        'budget_entries',
        sa.Column('id', GUID(), primary_key=True),
        sa.Column('tenant_id', GUID(), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('project_id', GUID(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=False),
        sa.Column('vendor', sa.String(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('entry_date', sa.DateTime(), nullable=True),
        sa.Column('is_planned', sa.Integer(), nullable=False, server_default='0'),  # 0=actual, 1=planned
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', GUID(), sa.ForeignKey('users.id'), nullable=True),
    )

    # Task comments
    op.create_table(
        'task_comments',
        sa.Column('id', GUID(), primary_key=True),
        sa.Column('tenant_id', GUID(), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('task_id', GUID(), sa.ForeignKey('tasks.id'), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', GUID(), sa.ForeignKey('users.id'), nullable=True),
    )


def downgrade():
    op.drop_table('task_comments')
    op.drop_table('budget_entries')
    op.drop_column('projects', 'address')
    op.drop_column('projects', 'budget_total')
