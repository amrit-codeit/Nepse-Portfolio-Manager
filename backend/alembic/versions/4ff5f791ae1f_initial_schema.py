"""initial_schema

Revision ID: 4ff5f791ae1f
Revises: 
Create Date: 2026-05-09 08:50:56.375204

Baseline migration — stamps the current database schema as the starting
point for Alembic-managed migrations.  No destructive changes are made
to existing tables.  Legacy tables (equity_transactions, sip_transactions,
equity_holdings, sip_holdings) are left in place; they can be cleaned up
in a future migration if desired.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ff5f791ae1f'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Baseline — no schema changes.  The existing DB is already at this revision."""
    pass


def downgrade() -> None:
    """Cannot downgrade past the baseline."""
    pass
