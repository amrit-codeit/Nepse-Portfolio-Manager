import pytest
import os
from app.services.history_parser import parse_meroshare_csv
from app.services.dp_parser import parse_niblsf_csv, reconcile_dp_statement
from app.models.member import Member
from app.models.transaction import Transaction

def test_history_parser(db_session, seed_companies):
    member = Member(id=1, name="Test Member")
    db_session.add(member)
    db_session.commit()
    
    csv_path = os.path.join(os.path.dirname(__file__), '../../fixtures/test_history.csv')
    with open(csv_path, 'r') as f:
        csv_content = f.read()
        
    result = parse_meroshare_csv(db_session, csv_content, member_id=1)
    
    assert result["created"] == 4
    
    txns = db_session.query(Transaction).filter_by(member_id=1).order_by(Transaction.id).all()
    assert len(txns) == 4
    assert txns[0].symbol == "NABIL"
    assert txns[0].txn_type == "BUY"
    assert txns[0].quantity == 100
    
    assert txns[1].txn_type == "SELL"
    assert txns[1].quantity == 50
    
    assert txns[2].symbol == "NTC"
    assert txns[2].txn_type == "IPO"

def test_dp_parser(db_session, seed_companies):
    member = Member(id=1, name="Test Member")
    db_session.add(member)
    db_session.commit()
    
    csv_content = "P,2024-01-01,10.0,100.0,1000,25,other\nP,2024-02-01,10.0,50.0,500,25,other"
        
    records = parse_niblsf_csv(csv_content)
    result = reconcile_dp_statement(db_session, 1, "NABIL", records)
    
    assert result["new_added"] == 2
    
    txns = db_session.query(Transaction).filter_by(member_id=1).all()
    assert len(txns) == 2
    assert txns[0].symbol == "NABIL"
    assert txns[0].txn_type == "BUY"
    assert txns[0].quantity == 100
