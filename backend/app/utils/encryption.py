"""Encryption utility for storing MeroShare credentials securely."""

from cryptography.fernet import Fernet
from app.config import settings


def get_fernet() -> Fernet:
    """Get Fernet instance using the configured encryption key."""
    key = settings.ENCRYPTION_KEY
    if not key:
        raise ValueError(
            "ENCRYPTION_KEY not configured. Generate one with:\n"
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode())


def encrypt_value(plain_text: str) -> str:
    """Encrypt a string value."""
    f = get_fernet()
    return f.encrypt(plain_text.encode()).decode()


def decrypt_value(encrypted_text: str) -> str:
    """Decrypt an encrypted string value."""
    f = get_fernet()
    return f.decrypt(encrypted_text.encode()).decode()
