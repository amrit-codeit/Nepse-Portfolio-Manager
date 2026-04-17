"""
Script to trigger fundamental scraping for all symbols in the Company table.
"""
import asyncio
import sys
import os

# Add the parent directory to sys.path to allow importing from 'app'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, init_db
from app.models.company import Company
from app.scrapers.fundamental_scraper import scrape_fundamentals

async def main():
    init_db()
    db = SessionLocal()
    try:
        # Get all symbols from the companies table
        company_records = db.query(Company.symbol).all()
        symbols = [s[0] for s in company_records if s[0]]
        
        if not symbols:
            print("No symbols found in the companies table.")
            return

        print(f"Found {len(symbols)} unique symbols in database: {', '.join(symbols[:10])}...")
        print("Starting batch fundamental scraping for ALL companies...")
        print("-" * 60)

        for i, symbol in enumerate(symbols):
            print(f"[{i+1}/{len(symbols)}] Processing {symbol}...")
            try:
                await scrape_fundamentals(symbol, db)
            except Exception as e:
                print(f"  [ERROR] Failed to scrape {symbol}: {e}")
            
            # scrape_fundamentals already includes a 3s delay at the end
        
        print("-" * 60)
        print("Batch scraping completed successfully.")

    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
