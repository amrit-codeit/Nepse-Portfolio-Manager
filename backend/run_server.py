"""
Uvicorn runner script.
Launches the FastAPI app with log_config=None to avoid the known
Windows reload subprocess logging formatter crash (uvicorn 0.34.x).
"""

try:
    import uvicorn
except ImportError:
    print("\n[ERROR] 'uvicorn' is not installed in the virtual environment.")
    print("[FIX] Please run 'setup.bat' to install all required dependencies.")
    print("      Or manually: venv\\Scripts\\pip install uvicorn fastapi\n")
    input("Press Enter to exit...")
    exit(1)

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=6767,
        reload=True,
        reload_dirs=["app"],
        log_config=None,
    )
