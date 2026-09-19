# ==========================================
# NextLite Voice V3 - Control Plane API Dockerfile
# Production Multi-Stage Container
# ==========================================

FROM python:3.11-slim as builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Final runtime stage
FROM python:3.11-slim as runner

WORKDIR /app

# Install runtime dependencies & curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create dedicated non-root user
RUN groupadd -g 1001 nextlite && \
    useradd -u 1001 -g nextlite -m -s /bin/bash nextlite

# Copy installed python packages from builder
COPY --from=builder /root/.local /home/nextlite/.local

# Copy application source code
COPY --chown=nextlite:nextlite app/ /app/app/

USER nextlite
ENV PATH=/home/nextlite/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3001", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]
