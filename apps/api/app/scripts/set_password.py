import asyncio
import sys
from sqlalchemy import select, update
from ..db import AsyncSessionLocal
from ..models import User, Tenant, UserRole
from ..auth.password import hash_password

async def set_user_password(email: str, new_password: str):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        
        hashed = hash_password(new_password)
        
        if user:
            user.passwordHash = hashed
            user.emailVerified = True
            await session.commit()
            print(f"[OK] Successfully updated password for existing user: {email}")
        else:
            # Create tenant if not exists
            t_res = await session.execute(select(Tenant).where(Tenant.slug == "nextlite-admin"))
            tenant = t_res.scalar_one_or_none()
            if not tenant:
                tenant = Tenant(name="NextLite Admin", slug="nextlite-admin", status="active")
                session.add(tenant)
                await session.flush()
            
            new_user = User(
                tenantId=tenant.id,
                email=email,
                passwordHash=hashed,
                role=UserRole.ADMIN if "admin" in email else UserRole.CLIENT_OWNER,
                emailVerified=True
            )
            session.add(new_user)
            await session.commit()
            print(f"[OK] Created new user: {email} under tenant: {tenant.name}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python -m apps.api.app.scripts.set_password <email> <password>")
        print("Example: python -m apps.api.app.scripts.set_password admin@nextlite.local admin123456")
        sys.exit(1)
    
    email_arg = sys.argv[1]
    pass_arg = sys.argv[2]
    asyncio.run(set_user_password(email_arg, pass_arg))
