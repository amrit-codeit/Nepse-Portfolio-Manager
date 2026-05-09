import pytest
from app.models.member import Member
from app.models.transaction import Transaction, TransactionType
from app.models.holding import Holding
from app.models.price import LivePrice
from app.api.auth import TOKEN_STORE
from datetime import date

@pytest.fixture
def auth_token(test_client):
    """Fixture to log in and get an auth token for tests."""
    # We just simulate login directly since test_client is async and requires event loop
    # or we can manually insert a token.
    token = "test_token_123"
    from datetime import datetime, timezone, timedelta
    TOKEN_STORE[token] = datetime.now(timezone.utc) + timedelta(days=1)
    return token

@pytest.mark.asyncio
async def test_portfolio_summary_api(test_client, db_session, seed_companies, auth_token):
    # Setup data
    member = Member(id=1, name="Test Member")
    db_session.add(member)
    db_session.commit()
    
    holding = Holding(
        member_id=1,
        company_id=seed_companies[0].id,
        symbol="NABIL",
        current_qty=100,
        wacc=500.0,
        tax_wacc=500.0,
        total_investment=50000.0
    )
    db_session.add(holding)
    
    price = LivePrice(symbol="NABIL", ltp=600.0, company_id=seed_companies[0].id)
    db_session.add(price)
    db_session.commit()
    
    # Request
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = await test_client.get("/api/v1/portfolio/summary?member_id=1", headers=headers)
    
    assert response.status_code == 200
    data = response.json()
    assert data["member_id"] == 1
    assert data["total_investment"] == 50000.0
    assert data["current_value"] == 60000.0
    assert data["unrealized_pnl"] == 10000.0
    assert data["holdings_count"] == 1
    assert len(data["holdings"]) == 1
    assert data["holdings"][0]["symbol"] == "NABIL"

@pytest.mark.asyncio
async def test_portfolio_summary_unauthorized(test_client, db_session):
    response = await test_client.get("/api/v1/portfolio/summary?member_id=1")
    assert response.status_code == 401
