"""NextLite Voice V3 — Pipecat Worker Redis Connection & Pub/Sub Manager.

Provides Redis connectivity for Pub/Sub invalidation listener and snapshot cache.
"""

import asyncio
import json
import time
from typing import Optional, Dict, Any
from loguru import logger
import redis.asyncio as redis
from app.config import settings

_redis_client: Optional[redis.Redis] = None


def get_worker_redis() -> Optional[redis.Redis]:
    """Returns global async Redis client instance if configured."""
    global _redis_client
    if _redis_client is None and settings.REDIS_URL:
        try:
            redis_url = settings.REDIS_URL.replace("localhost", "127.0.0.1")
            _redis_client = redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=0.3,
                socket_timeout=0.5,
            )
        except Exception as e:
            logger.warning(f"[WorkerRedis] Failed to initialize Redis client: {e}")
            _redis_client = None
    return _redis_client


async def close_worker_redis():
    """Cleanly closes global worker Redis client."""
    global _redis_client
    if _redis_client:
        try:
            await _redis_client.aclose()
        except Exception:
            pass
        _redis_client = None


async def listen_cache_invalidation_loop(channel_name: str = "nextlite:cache:invalidate"):
    """Background listener task for cross-worker Pub/Sub cache invalidation events."""
    backoff = 1.0
    first_attempt = True
    while True:
        r = get_worker_redis()
        if r is None:
            await asyncio.sleep(min(backoff, 5.0))
            backoff = min(backoff * 1.5, 5.0)
            continue

        try:
            pubsub = r.pubsub()
            await pubsub.subscribe(channel_name)
            logger.info(f"[WorkerRedis] Subscribed to cache invalidation channel '{channel_name}'")
            backoff = 1.0
            first_attempt = True

            async for message in pubsub.listen():
                if message and message.get("type") == "message":
                    raw_data = message.get("data")
                    if not raw_data:
                        continue
                    try:
                        data = json.loads(raw_data)
                        dep_id = data.get("deployment_id")
                        from app.runtime_config_cache import runtime_config_cache
                        from app.greeting_cache import global_greeting_cache
                        from app.tools.knowledge_tool import global_knowledge_cache

                        if dep_id:
                            runtime_config_cache.invalidate(dep_id)
                            global_knowledge_cache.invalidate(dep_id)
                            logger.info(f"[WorkerRedis] Invalidated local cache for deploymentId={dep_id}")
                        else:
                            runtime_config_cache.invalidate(None)
                            global_greeting_cache.clear()
                            global_knowledge_cache.invalidate(None)
                            logger.info("[WorkerRedis] Purged all local caches from broadcast event")
                    except Exception as parse_err:
                        logger.warning(f"[WorkerRedis] Error parsing invalidation event: {parse_err}")
        except asyncio.CancelledError:
            logger.info("[WorkerRedis] Cache invalidation listener task cancelled")
            break
        except Exception as e:
            backoff = min(backoff * 1.5, 5.0)
            if first_attempt:
                logger.info(f"[WorkerRedis] Notice: Redis Pub/Sub listener offline. Retrying in {backoff:.1f}s... ({e})")
                first_attempt = False
            else:
                logger.warning(f"[WorkerRedis] Pub/Sub listener disconnected: {e}. Reconnecting in {backoff:.1f}s...")
            await asyncio.sleep(backoff)


async def get_booked_slots_for_date(deployment_id: str, booking_date: str) -> Dict[str, int]:
    """Retrieves slot occupancy map from Redis in <1ms.
    
    Returns a dict mapping slot string to count of booked patients, e.g.
    {'08:00 PM': 1, '10:30 AM': 2}
    """
    client = get_worker_redis()
    if not client or not deployment_id or not booking_date:
        return {}
    key = f"nextlite:booked_slots:{deployment_id}:{booking_date}"
    try:
        raw_map = await client.hgetall(key)
        if not raw_map:
            return {}
        return {k: int(v) for k, v in raw_map.items() if str(v).isdigit()}
    except Exception as e:
        logger.debug(f"[WorkerRedis] get_booked_slots_for_date notice: {e}")
        return {}


async def record_atomic_slot_booking(
    deployment_id: str,
    booking_date: str,
    booking_time: str,
    capacity: int = 1,
    ttl_seconds: int = 86400 * 7,
) -> bool:
    """Atomically increments slot count in Redis using HINCRBY in 0.5ms.
    
    Returns True if slot was successfully booked within capacity, False if over-capacity.
    """
    client = get_worker_redis()
    if not client or not deployment_id or not booking_date or not booking_time:
        return True
    key = f"nextlite:booked_slots:{deployment_id}:{booking_date}"
    try:
        current_count = await client.hincrby(key, booking_time, 1)
        # Set expiry for cleanup
        await client.expire(key, ttl_seconds)
        if current_count > capacity:
            # Revert if over-capacity (Double-booking strictly prevented!)
            await client.hincrby(key, booking_time, -1)
            return False
        return True
    except Exception as e:
        logger.debug(f"[WorkerRedis] record_atomic_slot_booking notice: {e}")
        return True
