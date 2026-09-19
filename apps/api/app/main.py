import os
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from .config import settings
from .logging import logger
from .db import init_db, close_db, get_redis, AsyncSessionLocal
from .routers import auth, agents, internal, knowledge, client, receptionist, admin, whatsapp_integration

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting NextLite Python Control Plane...")
    
    # 1. Validate production security credentials
    settings.validate_production_security()
    
    # 2. Initialize Database & Base Tables
    await init_db()
    logger.info("PostgreSQL Database schema initialized.")
    
    # 3. Test Redis Connectivity
    redis_client = await get_redis()
    try:
        await redis_client.ping()
        logger.info("Redis connection established.")
    except Exception as e:
        logger.warning(f"Redis ping notice: {e}. Running without Redis cache.")
        
    yield
    
    logger.info("Shutting down NextLite Python Control Plane...")
    await close_db()
    logger.info("Cleanup completed.")

app = FastAPI(
    title="NextLite Voice V3 Control Plane API",
    version="3.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGIN.split(",") if settings.CORS_ORIGIN != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc) if settings.NODE_ENV == "development" else "Internal server error"},
    )

@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    corr_id = request.headers.get("x-correlation-id", str(uuid.uuid4()))
    request.state.correlation_id = corr_id
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.opt(exception=exc).error(f"Unhandled server error: {exc}")
        response = JSONResponse(
            status_code=500,
            content={"detail": str(exc) if settings.NODE_ENV == "development" else "Internal server error"},
        )
        origin = request.headers.get("origin")
        if origin:
            allowed_origins = settings.CORS_ORIGIN.split(",") if settings.CORS_ORIGIN != "*" else ["*"]
            if "*" in allowed_origins or origin in allowed_origins:
                response.headers["access-control-allow-origin"] = origin
                response.headers["access-control-allow-credentials"] = "true"
    response.headers["x-correlation-id"] = corr_id
    response.headers["ngrok-skip-browser-warning"] = "true"
    return response

@app.get("/api/health")
async def health_check():
    """Liveness probe: verifies service process is alive."""
    return {
        "status": "ok",
        "service": "nextlite-control-plane-python",
        "version": "3.0.0",
        "environment": settings.NODE_ENV,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/ready")
async def ready_check():
    """Readiness probe: verifies database and cache connectivity."""
    db_status = "connected"
    redis_status = "connected"
    
    # Active Database Ping
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception as db_err:
        logger.error(f"Readiness check DB failed: {db_err}")
        db_status = "disconnected"
        
    # Active Redis Ping
    try:
        r = await get_redis()
        await r.ping()
    except Exception as redis_err:
        logger.warning(f"Readiness check Redis warning: {redis_err}")
        redis_status = "disconnected"

    if db_status != "connected":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "not_ready", "database": db_status, "redis": redis_status}
        )

    return {
        "status": "ready",
        "ready": True,
        "database": db_status,
        "redis": redis_status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(internal.router)
app.include_router(knowledge.router)
app.include_router(client.router)
app.include_router(receptionist.router)
app.include_router(admin.router)
app.include_router(whatsapp_integration.router)
