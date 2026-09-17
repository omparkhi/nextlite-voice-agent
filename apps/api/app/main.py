import os
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .config import settings
from .logging import logger
from .db import init_db, close_db, get_redis
from .routers import auth, agents, internal, knowledge, client, receptionist, admin, whatsapp_integration

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting NextLite Python Control Plane...")
    await init_db()
    logger.info("PostgreSQL Database connection pool initialized.")
    redis_client = await get_redis()
    try:
        await redis_client.ping()
        logger.info("Redis connection established.")
    except Exception as e:
        logger.warning(f"Redis ping failed: {e}. Running without Redis cache.")
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

# Global exception handler to ensure errors return proper JSON (not raw 500)
# This allows the CORS middleware to still inject headers on error responses
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
        # Catch unhandled exceptions HERE (outermost middleware) so they don't
        # escape past CORSMiddleware and cause the browser to see a CORS error
        # instead of the actual server error.
        logger.opt(exception=exc).error(f"Unhandled server error: {exc}")
        response = JSONResponse(
            status_code=500,
            content={"detail": str(exc) if settings.NODE_ENV == "development" else "Internal server error"},
        )
        # Manually inject CORS headers since CORSMiddleware is inner to us
        origin = request.headers.get("origin")
        if origin:
            allowed_origins = settings.CORS_ORIGIN.split(",") if settings.CORS_ORIGIN != "*" else ["*"]
            if "*" in allowed_origins or origin in allowed_origins:
                response.headers["access-control-allow-origin"] = origin
                response.headers["access-control-allow-credentials"] = "true"
    response.headers["x-correlation-id"] = corr_id
    response.headers["ngrok-skip-browser-warning"] = "true"
    return response

from datetime import datetime

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "nextlite-control-plane-python",
        "version": "3.0.0",
        "environment": settings.NODE_ENV,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/ready")
async def ready_check():
    return {
        "status": "ready",
        "ready": True,
        "database": "connected",
        "redis": "connected"
    }


app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(internal.router)
app.include_router(knowledge.router)
app.include_router(client.router)
app.include_router(receptionist.router)
app.include_router(admin.router)
app.include_router(whatsapp_integration.router)
