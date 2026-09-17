import json
import time
import uuid
from typing import Optional
import httpx
from loguru import logger
from ..config import settings


async def invalidate_worker_cache(
    deployment_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    version_number: Optional[int] = None,
) -> None:
    """Notifies all Pipecat worker processes to invalidate local runtime config caches via Redis Pub/Sub and clears Redis snapshots."""
    # 1. Clear Redis Snapshot Cache if deployment_id provided
    try:
        from ..db import redis_client
        if deployment_id:
            clean_dep_id = deployment_id.strip()
            cache_key = f"runtime:snapshot:active:{clean_dep_id}"
            lock_key = f"runtime:lock:{clean_dep_id}"
            await redis_client.delete(cache_key, lock_key)
            logger.info(f"[CacheInvalidation] Cleared Redis snapshot key '{cache_key}'")
    except Exception as e:
        logger.warning(f"[CacheInvalidation] Could not delete Redis snapshot key: {e}")

    # 2. Publish Broadcast Event via Redis Pub/Sub
    try:
        from ..db import redis_client
        event_payload = {
            "event_id": str(uuid.uuid4()),
            "event_type": "CACHE_INVALIDATED",
            "deployment_id": deployment_id.strip() if deployment_id else None,
            "tenant_id": tenant_id.strip() if tenant_id else None,
            "agent_id": agent_id.strip() if agent_id else None,
            "version_number": version_number,
            "timestamp": time.time(),
        }
        await redis_client.publish("nextlite:cache:invalidate", json.dumps(event_payload))
        logger.info(
            f"[CacheInvalidation] Published Redis Pub/Sub invalidation event on 'nextlite:cache:invalidate' "
            f"(deploymentId={deployment_id or 'all'}, tenantId={tenant_id or 'all'})"
        )
    except Exception as e:
        logger.warning(f"[CacheInvalidation] Notice: Could not publish Redis invalidation event: {e}")

    # 3. Secondary HTTP Fallback for local/standalone worker compatibility
    try:
        worker_url = settings.PIPECAT_URL or "http://localhost:8080"
        async with httpx.AsyncClient(timeout=3.0) as http_client:
            params = {"all": "true"} if not deployment_id else {"deploymentId": deployment_id}
            await http_client.post(f"{worker_url}/internal/cache/invalidate", params=params)
            logger.info(f"[CacheInvalidation] HTTP fallback invalidated worker config cache (deploymentId={deployment_id})")
    except Exception as e:
        logger.debug(f"[CacheInvalidation] HTTP fallback notice: {e}")

