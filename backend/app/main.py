"""
Nepal Portfolio Manager — FastAPI Application Entry Point.

A personal portfolio management system for the Nepali stock market.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import init_db, SessionLocal
from app.services.fee_calculator import seed_fee_config
from app.utils.scheduler import start_scheduler, stop_scheduler

from app.api.members import router as members_router
from app.api.companies import router as companies_router
from app.api.transactions import router as transactions_router
from app.api.portfolio import router as portfolio_router
from app.api.scraper import router as scraper_router
from app.api.config_api import router as config_router
from app.api.prices import router as prices_router
from app.api.ipo import router as ipo_router
from app.api.insights import router as insights_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Startup
    print(f"🚀 Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    init_db()

    # Seed default fee configuration
    db = SessionLocal()
    try:
        seed_fee_config(db)
        print("✅ Fee configuration seeded")
    finally:
        db.close()

    # Start background scheduler
    start_scheduler()

    yield

    # Shutdown
    stop_scheduler()
    print("👋 Shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Personal portfolio management system for the Nepali stock market",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(members_router)
app.include_router(companies_router)
app.include_router(transactions_router)
app.include_router(portfolio_router)
app.include_router(scraper_router)
app.include_router(config_router)
app.include_router(prices_router)
app.include_router(ipo_router)
app.include_router(insights_router)


@app.get("/")
def root():
    """Health check endpoint."""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
    }


@app.get("/api/health")
def health():
    """Health check for frontend."""
    return {"status": "ok"}
