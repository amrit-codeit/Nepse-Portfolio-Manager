import sys
import os
import csv
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert

# Add the project root to sys.path so we can import from app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import engine, Base, SessionLocal
from app.models.price import CommodityPrice

def load_data(csv_filepath):
    print("Creating tables if they don't exist...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    try:
        with open(csv_filepath, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            records = []
            for row in reader:
                date_str = row['date']
                gold_price = row['gold_price']
                silver_price = row['silver_price']
                
                try:
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
                except ValueError:
                    continue
                    
                gold_price = float(gold_price) if gold_price else None
                silver_price = float(silver_price) if silver_price else None
                
                records.append({
                    "date": date_obj,
                    "gold_price": gold_price,
                    "silver_price": silver_price
                })
            
            print(f"Loaded {len(records)} records from CSV.")
            
            for record in records:
                stmt = insert(CommodityPrice).values(record)
                on_conflict_stmt = stmt.on_conflict_do_update(
                    index_elements=['date'],
                    set_={
                        'gold_price': stmt.excluded.gold_price,
                        'silver_price': stmt.excluded.silver_price,
                        'updated_at': datetime.now()
                    }
                )
                
                db.execute(on_conflict_stmt)
            
            db.commit()
            print("Successfully loaded commodity prices into the database.")
                
    except Exception as e:
        print(f"Error loading data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == '__main__':
    csv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../scratch/gold_silver_prices_5y.csv'))
    load_data(csv_path)
