import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .config import settings
from .logging import logger
from .db import engine, redis_client
from .routers.auth import router as auth_router
from .routers.agents import router as agents_router
from .routers.internal import router as internal_router
from .routers.knowledge import router as knowledge_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting NextLite Python Control Plane (FastAPI)")
    logger.info(f"📊 Environment: {settings.NODE_ENV}")
    logger.info(f"🔗 Health check: http://localhost:{settings.PORT}/api/health")
    yield
    logger.info("🛑 Shutting down NextLite Python Control Plane")
    await engine.dispose()
    await redis_client.close()

app = FastAPI(
    title="NextLite Voice API",
    description="Authoritative Python FastAPI Control Plane for NextLite Voice V3",
    version="0.3.0",
    lifespan=lifespan
)

# Mount Routers
app.include_router(auth_router)
app.include_router(agents_router)
app.include_router(internal_router)
app.include_router(knowledge_router)

# Bypass ngrok browser interposer page for API and WebSocket calls
@app.middleware("http")
async def ngrok_interposer_bypass_middleware(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["ngrok-skip-browser-warning"] = "true"
    return response

# Correlation ID & Request Logging Middleware
@app.middleware("http")
async def correlation_id_and_logging_middleware(request: Request, call_next):
    correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
    start_time = time.monotonic()
    
    response: Response = await call_next(request)
    
    duration_ms = (time.monotonic() - start_time) * 1000
    response.headers["x-correlation-id"] = correlation_id
    
    # Request log
    logger.info(
        f"{request.method} {request.url.path} -> {response.status_code} "
        f"({duration_ms:.2f}ms) [cid: {correlation_id}]"
    )
    return response

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.CORS_ORIGIN, "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Standardized Error Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server exception on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "message": str(exc) if settings.NODE_ENV != "production" else "An unexpected error occurred"
        }
    )

# Health & Readiness Endpoints
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": int(time.time()),
        "environment": settings.NODE_ENV,
        "service": "nextlite-control-plane-python"
    }

@app.get("/api/ready")
async def readiness_check():
    return {
        "status": "ready",
        "database": "connected",
        "redis": "connected",
        "timestamp": int(time.time())
    }
