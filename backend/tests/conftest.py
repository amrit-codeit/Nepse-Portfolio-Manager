import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from httpx import AsyncClient, ASGITransport

from app.database import Base
from app.main import app
from app.models.company import Company
from app.models.price import FeeConfig

# In-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    """Provides a fresh, empty in-memory database session for each test."""
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # Drop all tables after the test
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
async def test_client(db_session):
    """Provides an async HTTP client for FastAPI integration tests."""
    from app.database import get_db
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def seed_companies(db_session):
    """Seeds a few NEPSE companies into the test database."""
    companies = [
        Company(symbol="NABIL", name="Nabil Bank Limited", sector="Commercial Banks", instrument="Equity"),
        Company(symbol="NTC", name="Nepal Telecom", sector="Others", instrument="Equity"),
        Company(symbol="CIT", name="Citizen Investment Trust", sector="Investment", instrument="Equity"),
    ]
    db_session.add_all(companies)
    db_session.commit()
    for c in companies:
        db_session.refresh(c)
    return companies
