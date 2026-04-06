"""
Script to trigger fundamental scraping for all symbols currently in the portfolio holdings.
"""
import asyncio
import sys
import os

# Add the parent directory to sys.path to allow importing from 'app'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, init_db
from app.models.holding import Holding
from app.scrapers.fundamental_scraper import scrape_fundamentals

async def main():
    # Initialize DB (creates tables if missing)
    init_db()
    
    db = SessionLocal()
    try:
        # Get unique symbols that have active holdings
        portfolio_symbols = db.query(Holding.symbol).filter(Holding.current_qty > 0).distinct().all()
        symbols = [s[0] for s in portfolio_symbols if s[0]]
        
        if not symbols:
            print("No symbols with active holdings found in portfolio.")
            return

        print(f"Found {len(symbols)} unique symbols in portfolio: {', '.join(symbols)}")
        print("Starting batch fundamental scraping...")
        print("-" * 60)

        for i, symbol in enumerate(symbols):
            print(f"[{i+1}/{len(symbols)}] Processing {symbol}...")
            try:
                await scrape_fundamentals(symbol, db)
                # Success message is printed inside scrape_fundamentals
            except Exception as e:
                print(f"  [ERROR] Failed to scrape {symbol}: {e}")
            
            # Small extra delay between symbols (scrape_fundamentals already has 3s)
            if i < len(symbols) - 1:
                await asyncio.sleep(2)
        
        print("-" * 60)
        print("Batch scraping completed successfully.")

    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
