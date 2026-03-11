"""add role and status to users

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-03-11 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'c2d3e4f5a6b7'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('role', sa.String(), nullable=True))
    op.add_column('users', sa.Column('status', sa.String(), nullable=True))
    # Set defaults for existing rows — first user becomes super_admin, rest become admin
    op.execute("""
        UPDATE users SET role = 'super_admin'
        WHERE role IS NULL
          AND id = (SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1)
    """)
    op.execute("UPDATE users SET role = 'admin' WHERE role IS NULL")
    op.execute("UPDATE users SET status = 'active' WHERE status IS NULL")


def downgrade():
    op.drop_column('users', 'status')
    op.drop_column('users', 'role')
