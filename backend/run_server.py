"""
Uvicorn runner script.
Launches the FastAPI app with log_config=None to avoid the known
Windows reload subprocess logging formatter crash (uvicorn 0.34.x).
"""

import os

try:
    import uvicorn
    from dotenv import load_dotenv
except ImportError:
    print("\n[ERROR] 'uvicorn' or 'python-dotenv' is not installed in the virtual environment.")
    print("[FIX] Please run 'setup.bat' to install all required dependencies.")
    print("      Or manually: venv\\Scripts\\pip install uvicorn fastapi python-dotenv\n")
    input("Press Enter to exit...")
    exit(1)

if __name__ == "__main__":
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    load_dotenv(env_path)
    port = int(os.environ.get("PORT", 6767))

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        reload_dirs=["app"],
        log_config=None,
    )
