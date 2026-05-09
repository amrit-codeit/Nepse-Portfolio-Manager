from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import bcrypt
import secrets
from datetime import datetime, timedelta, timezone
from app.config import settings

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# In-memory token store: {token: expiry_timestamp}
TOKEN_STORE = {}

class LoginRequest(BaseModel):
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest):
    try:
        if bcrypt.checkpw(data.password.encode('utf-8'), settings.MASTER_PASSWORD.encode('utf-8')):
            token = secrets.token_urlsafe(32)
            expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
            TOKEN_STORE[token] = expiry
            return LoginResponse(access_token=token, expires_in=15 * 60)
    except ValueError:
        pass
    raise HTTPException(status_code=401, detail="Invalid master password")

@router.post("/logout")
def logout(token: str = Depends(oauth2_scheme)):
    if token in TOKEN_STORE:
        del TOKEN_STORE[token]
    return {"status": "success", "message": "Logged out"}

def verify_token(token: str = Depends(oauth2_scheme)):
    expiry = TOKEN_STORE.get(token)
    if not expiry or datetime.now(timezone.utc) > expiry:
        if token in TOKEN_STORE:
            del TOKEN_STORE[token]
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Extend token expiry on use to match frontend inactivity timeout
    TOKEN_STORE[token] = datetime.now(timezone.utc) + timedelta(minutes=15)
    return token
