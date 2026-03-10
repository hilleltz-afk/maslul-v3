"""add google_id to users

Revision ID: a3f1b2c4d5e6
Revises: 176c7ff655e1
Create Date: 2026-03-10 13:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a3f1b2c4d5e6'
down_revision: Union[str, None] = '176c7ff655e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('google_id', sa.String(), nullable=True))
    op.create_index('ix_users_google_id_unique', 'users', ['google_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_users_google_id_unique', table_name='users')
    op.drop_column('users', 'google_id')
