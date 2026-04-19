"""
Nepal Portfolio Manager — FastAPI Application Entry Point.

A personal portfolio management system for the Nepali stock market.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os
from pathlib import Path

from app.config import settings
from app.database import init_db, SessionLocal
from app.services.fee_calculator import seed_fee_config
from app.services.backup_service import create_database_backup
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
from app.api.dividends import router as dividends_router
from app.api.groups import router as groups_router
from app.api.analysis import router as analysis_router
from app.api.stock_detail import router as stock_detail_router
from app.api.calculator import router as calculator_router
from app.api.screener import router as screener_router
from app.api.market_context import router as market_context_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Startup
    print(f"[START] Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    init_db()

    # Seed default fee configuration
    db = SessionLocal()
    try:
        seed_fee_config(db)
        print("[OK] Fee configuration seeded")
    finally:
        db.close()

    # Run database backup at startup (device may be asleep at scheduled 23:55 NPT)
    create_database_backup()
    print("[OK] Startup backup check complete")

    # Start background scheduler
    start_scheduler()

    yield

    # Shutdown
    stop_scheduler()
    print("[EXIT] Shutting down...")


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
app.include_router(dividends_router)
app.include_router(groups_router)
app.include_router(analysis_router)
app.include_router(stock_detail_router)
app.include_router(calculator_router)
app.include_router(screener_router)
app.include_router(market_context_router)


@app.get("/api/health")
def health():
    """Health check for frontend."""
    return {"status": "ok"}

# =========================================================================
# Serve React Frontend (Single Page Application)
# =========================================================================
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"

if frontend_dist.exists() and (frontend_dist / "index.html").exists():
    # Mount static assets
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")
    
    # Optional files like vite.svg, favicon.ico in root of dist
    for static_file in frontend_dist.glob("*.*"):
        if static_file.is_file() and static_file.name != "index.html":
            app.mount(f"/{static_file.name}", StaticFiles(directory=frontend_dist, check_dir=False), name=static_file.name)

    # Catch-all to serve index.html for React Router
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            return {"detail": "Not Found"}
        return FileResponse(frontend_dist / "index.html")
else:
    @app.get("/")
    def no_frontend():
        return {"app": settings.APP_NAME, "status": "running", "warning": "Frontend build not statically deployed."}
