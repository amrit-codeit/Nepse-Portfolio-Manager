"""
Uvicorn runner script.
Launches the FastAPI app with log_config=None to avoid the known
Windows reload subprocess logging formatter crash (uvicorn 0.34.x).
"""

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["app"],
        log_config=None,
    )
