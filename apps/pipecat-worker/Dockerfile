FROM python:3.11-slim

WORKDIR /app

# Install system audio dependencies if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files
COPY pyproject.toml /app/

ENV PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

# Install python dependencies with resilient network timeout
RUN pip install --no-cache-dir --default-timeout=120 --retries=10 .

# Copy application source
COPY app/ /app/app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
