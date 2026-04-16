"""Application configuration using pydantic-settings."""
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
from dotenv import load_dotenv

# Force load .env from the backend root
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    APP_NAME: str = "Nepal Portfolio Manager"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite:///./portfolio.db"

    # Encryption key for MeroShare credentials (Fernet key)
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ENCRYPTION_KEY: str = ""

    # Password for protecting credential editing in the frontend
    MASTER_PASSWORD: str = "admin123"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Scraper settings
    NEPSE_COMPANY_URL: str = "https://nepalstock.com/company"
    NAV_URL: str = "https://www.sharesansar.com/mutual-fund-navs"
    MEROSHARE_URL: str = "https://meroshare.cdsc.com.np/#/login"

    # AI / Ollama Settings (Local)
    OLLAMA_URL: str = "http://localhost:11434/api/generate"
    DEFAULT_OLLAMA_MODEL: str = "qwen2.5:3b-instruct-q4_0"
    AVAILABLE_OLLAMA_MODELS: list[str] = ["qwen2.5:3b-instruct-q4_0", "gemma4:e2b", "llama3:8b", "deepseek-r1:1.5b"]
    OLLAMA_TIMEOUT: float = 300.0

    # AI / Groq Cloud API (Free tier — https://console.groq.com)
    GROQ_API_KEY: str = ""  # Set in .env — NEVER commit this
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    AVAILABLE_CLOUD_MODELS: list[str] = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"]

    model_config = SettingsConfigDict(
        env_file=env_path,
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

# Debug: verify GROQ_API_KEY loading (masked)
if not settings.GROQ_API_KEY:
    print(f"[WARN] GROQ_API_KEY not found in {env_path}")
else:
    masked_key = settings.GROQ_API_KEY[:7] + "..." + settings.GROQ_API_KEY[-4:]
    print(f"[INFO] GROQ_API_KEY loaded successfully: {masked_key}")
