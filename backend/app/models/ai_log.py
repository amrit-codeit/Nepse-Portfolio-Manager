from sqlalchemy import Column, Integer, String, DateTime, Float
from datetime import datetime, timezone
from app.database import Base

class AIUsageLog(Base):
    """Audit log for AI model usage (M-5)."""
    __tablename__ = "ai_usage_logs"
    
    id = Column(Integer, primary_key=True)
    provider = Column(String, nullable=False)  # "groq", "nvidia", "ollama"
    model = Column(String, nullable=False)
    endpoint = Column(String, nullable=False)  # "value_verdict", "trading_verdict", "portfolio"
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    duration_seconds = Column(Float, default=0.0)
    status = Column(String, default="success")  # "success", "failed"
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<AIUsageLog({self.provider}/{self.model} -> {self.status})>"
