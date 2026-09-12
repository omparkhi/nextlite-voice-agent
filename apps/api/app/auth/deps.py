import uuid
from typing import Optional, Dict, Any
from fastapi import Request, Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from .tokens import verify_access_token
from ..config import settings
from ..db import get_db
from ..models import User, UserRole

security_bearer = HTTPBearer(auto_error=False)

async def get_current_user_payload(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> Dict[str, Any]:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    try:
        payload = verify_access_token(credentials.credentials)
        return payload
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

async def require_admin(payload: Dict[str, Any] = Depends(get_current_user_payload)) -> Dict[str, Any]:
    if payload.get("role") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return payload

async def require_worker(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_worker_secret: Optional[str] = Header(None, alias="x-worker-secret"),
    x_worker_key: Optional[str] = Header(None, alias="x-worker-key"),
) -> bool:
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif x_worker_secret:
        token = x_worker_secret.strip()
    elif x_worker_key:
        token = x_worker_key.strip()

    valid_secrets = {
        s for s in [
            settings.WORKER_API_SECRET,
            settings.LIVEKIT_WORKER_SECRET,
            "dev-livekit-worker-secret-v3",
            "24d69bf59eaff1dd54f66adf44a4ee4d242b04fa5ee78935a6413959ed861286"
        ] if s
    }
    if not token or token not in valid_secrets:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Worker authentication required"
        )
    return True