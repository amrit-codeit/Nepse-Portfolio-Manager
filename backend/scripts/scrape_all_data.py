"""
Script to batch scrape BOTH fundamental and historical technical (price) data
for ALL listed scrips in the database.
"""
import asyncio
import sys
import os
import time

# Add the parent directory to sys.path to allow importing from 'app'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, init_db
from app.models.company import Company
from app.scrapers.fundamental_scraper import scrape_fundamentals
from app.scrapers.history_scraper import scrape_historical_prices

async def main():
    init_db()
    db = SessionLocal()
    try:
        # Get all symbols from the companies table
        company_records = db.query(Company.symbol).filter(Company.status == 'Active').all()
        # Fallback if no status field is populated properly
        if not company_records:
             company_records = db.query(Company.symbol).all()
             
        symbols = [s[0] for s in company_records if s[0]]
        
        if not symbols:
            print("No symbols found in the companies table. Please run the company list scraper first.")
            return

        print(f"Found {len(symbols)} unique symbols in database.")
        print("Starting batch scraping (Fundamentals + Historical Prices) for ALL companies...")
        print("WARNING: This will take a long time and generates heavy traffic. Rate limiting (sleep) is enforced.")
        print("-" * 60)

        for i, symbol in enumerate(symbols):
            print(f"[{i+1}/{len(symbols)}] Processing {symbol}...")
            
            # 1. Scrape Fundamentals
            print(f"   -> Fetching fundamental data...")
            try:
                await scrape_fundamentals(symbol, db)
            except Exception as e:
                print(f"  [ERROR] Failed fundamental scrape for {symbol}: {e}")
            
            # Small delay before technicals
            time.sleep(2)
            
            # 2. Scrape Technicals (Price History)
            print(f"   -> Fetching historical price data...")
            try:
                # Target specific symbol. Scraper handles updating from the last scraped date.
                scrape_historical_prices(db, target_symbol=symbol)
            except Exception as e:
                print(f"  [ERROR] Failed historical price scrape for {symbol}: {e}")
                
            # Additional delay to avoid Cloudflare/NepseAlpha IP bans
            time.sleep(3)
        
        print("-" * 60)
        print("Master batch scraping completed successfully.")

    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
