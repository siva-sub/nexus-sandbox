"""
Rate Limiting Middleware for Nexus Gateway

Implements configurable per-IP and per-endpoint rate limiting.
Uses in-memory sliding window counters (suitable for sandbox/single-instance).

Production would use Redis-backed distributed rate limiting.

Configuration via environment variables:
    NEXUS_RATE_LIMIT_REQUESTS_PER_MINUTE: Default max requests/minute (default: 120)
    NEXUS_RATE_LIMIT_BURST: Burst allowance above the per-minute rate (default: 20)
    NEXUS_RATE_LIMIT_ENABLED: Enable/disable rate limiting (default: true)
"""

import os
import time
from collections import defaultdict
from typing import Dict, Tuple

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


# Configuration
RATE_LIMIT_ENABLED = os.getenv("NEXUS_RATE_LIMIT_ENABLED", "true").lower() == "true"
RATE_LIMIT_RPM = int(os.getenv("NEXUS_RATE_LIMIT_REQUESTS_PER_MINUTE", "120"))
RATE_LIMIT_BURST = int(os.getenv("NEXUS_RATE_LIMIT_BURST", "20"))
WINDOW_SECONDS = 60

# Endpoint-specific overrides (path prefix -> requests per minute)
ENDPOINT_LIMITS: Dict[str, int] = {
    "/v1/iso20022/pacs008": 120,     # Payment processing (sandbox-friendly limit)
    "/v1/quotes": 60,                # Quote generation
    "/v1/addressing/resolve": 60,    # Proxy resolution
    "/v1/rates": 120,                # Rate queries (lighter)
    "/health": 300,                  # Health checks - generous
    "/docs": 300,                    # Documentation
    "/openapi.json": 300,            # OpenAPI spec
}

# Exempt paths (never rate limited)
EXEMPT_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


class SlidingWindowCounter:
    """Sliding window rate limiter using sub-windows for smoother counting."""
    
    def __init__(self):
        # client_key -> (window_start, request_count)
        self._windows: Dict[str, Tuple[float, int]] = defaultdict(lambda: (0.0, 0))
    
    def is_allowed(self, key: str, limit: int, window: int = WINDOW_SECONDS) -> Tuple[bool, int, int]:
        """
        Check if a request is allowed.
        
        Returns: (allowed, remaining, reset_seconds)
        """
        now = time.time()
        window_start, count = self._windows[key]
        
        # Reset window if expired
        if now - window_start >= window:
            self._windows[key] = (now, 1)
            return True, limit - 1, window
        
        # Check against limit
        if count >= limit:
            reset_at = int(window - (now - window_start))
            return False, 0, max(1, reset_at)
        
        # Increment
        self._windows[key] = (window_start, count + 1)
        remaining = limit - count - 1
        reset_at = int(window - (now - window_start))
        return True, max(0, remaining), max(1, reset_at)
    
    def cleanup(self, max_age: float = 300.0):
        """Remove stale entries older than max_age seconds."""
        now = time.time()
        stale = [k for k, (ws, _) in self._windows.items() if now - ws > max_age]
        for k in stale:
            del self._windows[k]


# Singleton counter
_counter = SlidingWindowCounter()
_last_cleanup = time.time()


def _get_client_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For for proxied requests."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _get_limit_for_path(path: str) -> int:
    """Get the rate limit for a specific path, with fallback to global default."""
    for prefix, limit in ENDPOINT_LIMITS.items():
        if path.startswith(prefix):
            return limit
    return RATE_LIMIT_RPM


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware using sliding window counters.
    
    Adds standard rate limit headers to all responses:
    - X-RateLimit-Limit: Maximum requests allowed
    - X-RateLimit-Remaining: Requests remaining in window
    - X-RateLimit-Reset: Seconds until window reset
    - Retry-After: Seconds to wait (only on 429)
    """
    
    async def dispatch(self, request: Request, call_next) -> Response:
        global _last_cleanup
        
        # Skip if disabled
        if not RATE_LIMIT_ENABLED:
            return await call_next(request)
        
        # Skip exempt paths
        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)
        
        # Periodic cleanup (every 5 minutes)
        now = time.time()
        if now - _last_cleanup > 300:
            _counter.cleanup()
            _last_cleanup = now
        
        # Get client identifier and limit
        client_ip = _get_client_ip(request)
        path_limit = _get_limit_for_path(request.url.path)
        effective_limit = path_limit + RATE_LIMIT_BURST
        
        # Rate limit key: IP + path prefix for granular limiting
        rate_key = f"{client_ip}:{request.url.path.split('/')[1] if '/' in request.url.path[1:] else 'root'}"
        
        allowed, remaining, reset = _counter.is_allowed(rate_key, effective_limit)
        
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "RATE_LIMIT_EXCEEDED",
                    "message": f"Too many requests. Maximum {effective_limit} requests per {WINDOW_SECONDS} seconds.",
                    "retryAfter": reset,
                    "limit": effective_limit,
                },
                headers={
                    "X-RateLimit-Limit": str(effective_limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset),
                    "Retry-After": str(reset),
                },
            )
        
        # Process request
        response = await call_next(request)
        
        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(effective_limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset)
        
        return response
