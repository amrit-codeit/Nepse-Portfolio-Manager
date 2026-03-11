"""Application configuration using pydantic-settings."""

from pydantic_settings import BaseSettings
from pathlib import Path


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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
