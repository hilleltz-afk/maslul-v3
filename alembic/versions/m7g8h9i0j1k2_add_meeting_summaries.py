"""add meeting_summaries table

Revision ID: m7g8h9i0j1k2
Revises: l7g8h9i0j1k2
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'm7g8h9i0j1k2'
down_revision = 'l7g8h9i0j1k2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'meeting_summaries',
        sa.Column('id', sa.CHAR(36), primary_key=True),
        sa.Column('tenant_id', sa.CHAR(36), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('project_id', sa.CHAR(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('raw_text', sa.Text(), nullable=True),
        sa.Column('meeting_date', sa.String(), nullable=True),
        sa.Column('participants', sa.Text(), nullable=True),
        sa.Column('overview', sa.Text(), nullable=True),
        sa.Column('decisions', sa.Text(), nullable=True),
        sa.Column('action_items', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='draft'),
        sa.Column('document_id', sa.CHAR(36), nullable=True),
        sa.Column('created_by', sa.CHAR(36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_table('meeting_summaries')
