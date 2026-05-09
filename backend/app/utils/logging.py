"""
Structured logging configuration using structlog (H-3).

Provides machine-readable JSON logs to a rotating file and pretty-printed
console output for development. Financial mutations, scraper runs, and AI
calls should use the logger from this module.

Usage:
    from app.utils.logging import get_logger
    logger = get_logger(__name__)
    logger.info("transaction.created", symbol="NABIL", qty=100, member_id=1)
"""

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

import structlog
from app.config import settings


def setup_logging() -> None:
    """Configure structlog with JSON file output and console output.

    Call once during app startup (in main.py lifespan).
    """
    log_level = getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO)

    # Ensure logs directory exists
    log_dir = Path(__file__).parent.parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / "app.log"

    # Standard library handlers
    handlers: list[logging.Handler] = []

    # Rotating file handler — JSON lines
    file_handler = RotatingFileHandler(
        str(log_file),
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(log_level)
    handlers.append(file_handler)

    # Console handler — pretty for dev, JSON for prod
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    handlers.append(console_handler)

    # Configure standard logging
    logging.basicConfig(
        format="%(message)s",
        level=log_level,
        handlers=handlers,
        force=True,
    )

    # Structlog processors
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.DEBUG:
        # Pretty console output for development
        renderer = structlog.dev.ConsoleRenderer()
    else:
        # JSON output for production / file
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Apply structlog formatter to all handlers
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )
    for handler in handlers:
        handler.setFormatter(formatter)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Return a structlog logger bound to the given module name."""
    return structlog.get_logger(name)
