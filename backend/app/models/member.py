"""Member and MeroShare credential models."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Table
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base

member_group_association = Table(
    'member_group_association',
    Base.metadata,
    Column('group_id', Integer, ForeignKey('member_groups.id', ondelete="CASCADE"), primary_key=True),
    Column('member_id', Integer, ForeignKey('members.id', ondelete="CASCADE"), primary_key=True)
)


class Member(Base):
    """Family member who holds shares."""
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    display_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    last_sync_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(
        timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    credentials = relationship(
        "MeroshareCredential", back_populates="member", uselist=False, cascade="all, delete-orphan")
    holdings = relationship(
        "Holding", back_populates="member", cascade="all, delete-orphan")
    transactions = relationship(
        "Transaction", back_populates="member", cascade="all, delete-orphan")
    groups = relationship(
        "MemberGroup", secondary=member_group_association, back_populates="members")

    def __repr__(self):
        return f"<Member(id={self.id}, name='{self.name}')>"


class MeroshareCredential(Base):
    """Encrypted MeroShare credentials for a member."""
    __tablename__ = "meroshare_credentials"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey(
        "members.id", ondelete="CASCADE"), nullable=False, unique=True)
    # e.g., "GLOBAL IME CAPITAL LIMITED (11200)"
    dp = Column(String(200), nullable=False)
    username = Column(String(50), nullable=False)       # DMAT number
    password_encrypted = Column(Text, nullable=False)   # Fernet encrypted
    crn = Column(String(50), nullable=True)
    txn_pin = Column(String(20), nullable=True)
    apply_unit = Column(Integer, default=10)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(
        timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    member = relationship("Member", back_populates="credentials")

    def __repr__(self):
        return f"<MeroshareCredential(member_id={self.member_id}, dp='{self.dp}')>"

class MemberGroup(Base):
    """Custom grouping of members for portfolio aggregation."""
    __tablename__ = "member_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    members = relationship(
        "Member", secondary=member_group_association, back_populates="groups")

    def __repr__(self):
        return f"<MemberGroup(id={self.id}, name='{self.name}')>"
