import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, Cookie
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..models import User, Tenant, RefreshToken, UserRole
from ..schemas import RegisterRequest, LoginRequest
from ..auth import (
    hash_password, compare_password, generate_token_pair,
    get_refresh_token_expiry, get_current_user_payload
)
from ..repositories import UserRepository, TenantRepository

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, response: Response, session: AsyncSession = Depends(get_db)):
    user_repo = UserRepository(session)
    tenant_repo = TenantRepository(session)

    existing = await user_repo.get_by_email(req.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # 1. Create Tenant
    slug = req.tenant_name.lower().replace(" ", "-") + "-" + str(uuid.uuid4())[:6]
    tenant = Tenant(name=req.tenant_name, slug=slug)
    await tenant_repo.create(tenant)

    # 2. Create User
    pwd_hash = hash_password(req.password)
    user = User(
        tenantId=tenant.id,
        email=req.email.lower().strip(),
        passwordHash=pwd_hash,
        role=UserRole.CLIENT_OWNER,
        emailVerified=False
    )
    await user_repo.create(user)

    # 3. Generate Tokens
    token_pair = generate_token_pair(str(user.id), str(tenant.id), user.role.value)
    await user_repo.create_refresh_token(
        user.id, token_pair["refreshToken"], get_refresh_token_expiry()
    )
    await session.commit()

    # Set httpOnly cookie
    response.set_cookie(
        key="refreshToken",
        value=token_pair["refreshToken"],
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 86400
    )

    return {
        "accessToken": token_pair["accessToken"],
        "user": {
            "id": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "tenantId": str(tenant.id),
            "tenantName": tenant.name
        }
    }

@router.post("/login")
async def login(req: LoginRequest, response: Response, session: AsyncSession = Depends(get_db)):
    user_repo = UserRepository(session)
    tenant_repo = TenantRepository(session)

    user = await user_repo.get_by_email(req.email)
    if not user or not compare_password(req.password, user.passwordHash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    tenant_name = ""
    if user.tenantId:
        tenant = await tenant_repo.get_by_id(user.tenantId)
        tenant_name = tenant.name if tenant else ""

    token_pair = generate_token_pair(str(user.id), str(user.tenantId) if user.tenantId else None, user.role.value)
    await user_repo.create_refresh_token(
        user.id, token_pair["refreshToken"], get_refresh_token_expiry()
    )
    await session.commit()

    response.set_cookie(
        key="refreshToken",
        value=token_pair["refreshToken"],
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 86400
    )

    return {
        "accessToken": token_pair["accessToken"],
        "user": {
            "id": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "tenantId": str(user.tenantId) if user.tenantId else None,
            "tenantName": tenant_name
        }
    }

@router.post("/refresh")
async def refresh_token(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db)
):
    user_repo = UserRepository(session)
    tenant_repo = TenantRepository(session)

    # Check cookie or JSON body
    token = request.cookies.get("refreshToken")
    if not token:
        try:
            body = await request.json()
            token = body.get("refreshToken")
        except Exception:
            token = None

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )

    rt = await user_repo.get_refresh_token(token)
    if not rt or rt.expiresAt < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    user = await user_repo.get_by_id(rt.userId)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Rotate refresh token
    await user_repo.revoke_refresh_token(token)
    new_token_pair = generate_token_pair(str(user.id), str(user.tenantId) if user.tenantId else None, user.role.value)
    await user_repo.create_refresh_token(
        user.id, new_token_pair["refreshToken"], get_refresh_token_expiry()
    )
    await session.commit()

    response.set_cookie(
        key="refreshToken",
        value=new_token_pair["refreshToken"],
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 86400
    )

    return {
        "accessToken": new_token_pair["accessToken"]
    }

@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db)
):
    token = request.cookies.get("refreshToken")
    if token:
        user_repo = UserRepository(session)
        await user_repo.revoke_refresh_token(token)
        await session.commit()

    response.delete_cookie("refreshToken")
    return {"message": "Logged out successfully"}

@router.get("/me")
async def get_me(
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    user_repo = UserRepository(session)
    user_id = uuid.UUID(payload["userId"])
    user = await user_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "tenantId": str(user.tenantId) if user.tenantId else None
        }
    }

