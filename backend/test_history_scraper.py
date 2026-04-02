import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.price import PriceHistory
from app.scrapers.history_scraper import scrape_historical_prices
from app.database import Base

# Assuming standard sqlite
engine = create_engine('sqlite:///portfolio.db')
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

print("Starting custom test...")
scrape_historical_prices(db)
db.close()
