import re
import uuid
import jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from ..config import settings

def parse_duration_seconds(duration: str) -> int:
    match = re.match(r"^(\d+)([smhd])$", duration.strip())
    if not match:
        return 7 * 86400
    val = int(match.group(1))
    unit = match.group(2)
    if unit == "s":
        return val
    elif unit == "m":
        return val * 60
    elif unit == "h":
        return val * 3600
    elif unit == "d":
        return val * 86400
    return 7 * 86400

def generate_access_token(user_id: str, tenant_id: Optional[str], role: str) -> str:
    exp_seconds = parse_duration_seconds(settings.JWT_EXPIRES_IN)
    payload = {
        "userId": str(user_id),
        "tenantId": str(tenant_id) if tenant_id else None,
        "role": role,
        "exp": datetime.utcnow() + timedelta(seconds=exp_seconds),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

def generate_refresh_token() -> str:
    return str(uuid.uuid4())

def get_refresh_token_expiry() -> datetime:
    exp_seconds = parse_duration_seconds(settings.JWT_REFRESH_EXPIRES_IN)
    return datetime.utcnow() + timedelta(seconds=exp_seconds)

def verify_access_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as e:
        raise ValueError(f"Invalid access token: {e}")

def generate_token_pair(user_id: str, tenant_id: Optional[str], role: str) -> Dict[str, Any]:
    access_token = generate_access_token(user_id, tenant_id, role)
    refresh_token = generate_refresh_token()
    return {
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "expiresIn": settings.JWT_EXPIRES_IN
    }