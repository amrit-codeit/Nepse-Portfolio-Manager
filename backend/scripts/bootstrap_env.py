"""
Environment file bootstrap script.
Called by setup.bat to create or patch .env with all required keys.
Ensures MASTER_PASSWORD, ENCRYPTION_KEY, and all other critical keys exist.
Exits with code 1 on failure so setup.bat can halt.
"""
import sys
import os
from pathlib import Path


def ensure_env(env_path: Path):
    """Guarantee that the .env file exists and contains all critical keys."""
    # Parse existing .env into an ordered dict
    existing = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
            s = line.strip()
            if s and not s.startswith("#") and "=" in s:
                k, v = s.split("=", 1)
                existing[k.strip()] = v.strip()

    created_fresh = not env_path.exists() or len(existing) == 0

    # Ensure base keys with sensible defaults
    defaults = {
        "DEBUG": "True",
        "DATABASE_URL": "sqlite:///./portfolio.db",
        "PORT": "6767",
        "VITE_PORT": "3055",
    }
    for k, v in defaults.items():
        existing.setdefault(k, v)

    # Generate ENCRYPTION_KEY if missing or still a placeholder
    enc_key = existing.get("ENCRYPTION_KEY", "")
    if not enc_key or enc_key == "your_encryption_key_here":
        try:
            from cryptography.fernet import Fernet
            existing["ENCRYPTION_KEY"] = Fernet.generate_key().decode()
            print("[OK] Generated new ENCRYPTION_KEY")
        except ImportError:
            print("[ERROR] 'cryptography' package not installed. Cannot generate ENCRYPTION_KEY.")
            return False

    # Generate MASTER_PASSWORD if missing
    if not existing.get("MASTER_PASSWORD"):
        try:
            import bcrypt
            hashed = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
            existing["MASTER_PASSWORD"] = hashed
            print("[OK] Generated default MASTER_PASSWORD (password: admin123)")
        except ImportError:
            print("[ERROR] 'bcrypt' package not installed. Cannot generate MASTER_PASSWORD.")
            print("[FIX]  Run: venv\\Scripts\\pip install bcrypt")
            return False

    # Write the final .env
    with open(env_path, "w", encoding="utf-8") as f:
        for k, v in existing.items():
            f.write(f"{k}={v}\n")

    # Final validation — verify the file was actually written correctly
    verify = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s and not s.startswith("#") and "=" in s:
            k, v = s.split("=", 1)
            verify[k.strip()] = v.strip()

    errors = []
    if not verify.get("ENCRYPTION_KEY"):
        errors.append("ENCRYPTION_KEY")
    if not verify.get("MASTER_PASSWORD"):
        errors.append("MASTER_PASSWORD")

    if errors:
        print(f"[ERROR] .env validation failed. Missing: {', '.join(errors)}")
        return False

    status = "created" if created_fresh else "verified/patched"
    print(f"[OK] .env {status} successfully ({len(verify)} keys)")
    return True


if __name__ == "__main__":
    # Resolve .env relative to this script's location (backend/scripts/ -> project root)
    # But also accept a path argument from setup.bat
    if len(sys.argv) > 1:
        env_path = Path(sys.argv[1])
    else:
        env_path = Path(__file__).parent.parent.parent / ".env"

    print(f"[INFO] Target .env path: {env_path.resolve()}")

    if not ensure_env(env_path):
        sys.exit(1)
