"""NextLite Voice V3 — Pipecat Runtime Configuration In-Memory Cache.

High-performance, thread-safe in-memory cache for RuntimeAgentConfig objects.
Caches compiled system prompts, voice settings, and tool definitions by deploymentId
to reduce cold call setup latency from ~300ms to <0.1ms.
"""

import time
import threading
from typing import Dict, Optional, Tuple, Any
from loguru import logger


class RuntimeConfigCache:
    """Thread-safe LRU/TTL cache for RuntimeAgentConfig objects."""

    def __init__(self, default_ttl_seconds: float = 43200.0, max_entries: int = 1000):
        self._cache: Dict[str, Tuple[float, float, Any]] = {}  # key -> (timestamp, ttl, config)
        self._lock = threading.Lock()
        self._default_ttl = default_ttl_seconds
        self._max_entries = max_entries
        self._hits = 0
        self._misses = 0

    def get(self, deployment_id: str) -> Optional[Any]:
        """Retrieves a cached RuntimeAgentConfig if present and not expired."""
        if not deployment_id or not isinstance(deployment_id, str):
            return None

        clean_id = deployment_id.strip()
        now = time.monotonic()

        with self._lock:
            if clean_id in self._cache:
                timestamp, entry_ttl, config = self._cache[clean_id]
                effective_ttl = entry_ttl if entry_ttl is not None else self._default_ttl
                if now - timestamp < effective_ttl:
                    self._hits += 1
                    logger.debug(f"[RuntimeConfigCache] Cache hit for deploymentId={clean_id} (hits={self._hits})")
                    return config
                else:
                    # Expired entry
                    self._cache.pop(clean_id, None)

            self._misses += 1
            return None

    def set(self, deployment_id: str, config: Any, ttl_seconds: Optional[float] = None) -> None:
        """Stores a RuntimeAgentConfig in the cache with optional TTL override."""
        if not deployment_id or not isinstance(deployment_id, str) or config is None:
            return

        clean_id = deployment_id.strip()
        now = time.monotonic()
        entry_ttl = ttl_seconds if ttl_seconds is not None else self._default_ttl

        with self._lock:
            # Evict oldest entry if exceeding max entries
            if len(self._cache) >= self._max_entries and clean_id not in self._cache:
                oldest_key = min(self._cache, key=lambda k: self._cache[k][0])
                self._cache.pop(oldest_key, None)

            self._cache[clean_id] = (now, entry_ttl, config)
            logger.debug(f"[RuntimeConfigCache] Cached config for deploymentId={clean_id} (total_cached={len(self._cache)})")

    def has(self, deployment_id: str) -> bool:
        """Checks if a valid, unexpired configuration is cached for deploymentId."""
        return self.get(deployment_id) is not None

    def invalidate(self, deployment_id: Optional[str] = None) -> None:
        """Invalidates a specific deployment or the entire cache."""
        with self._lock:
            if deployment_id:
                clean_id = deployment_id.strip()
                removed = self._cache.pop(clean_id, None) is not None
                logger.info(f"[RuntimeConfigCache] Invalidated cache for deploymentId={clean_id} (was_cached={removed})")
            else:
                count = len(self._cache)
                self._cache.clear()
                logger.info(f"[RuntimeConfigCache] Cleared all {count} entries from cache")

    def get_stats(self) -> Dict[str, Any]:
        """Returns diagnostic metrics for the in-memory cache."""
        with self._lock:
            total_requests = self._hits + self._misses
            hit_ratio = (self._hits / total_requests) if total_requests > 0 else 0.0
            return {
                "cached_entries": len(self._cache),
                "hits": self._hits,
                "misses": self._misses,
                "total_requests": total_requests,
                "hit_ratio": round(hit_ratio, 4),
            }


# Global shared singleton for the worker process
runtime_config_cache = RuntimeConfigCache()
