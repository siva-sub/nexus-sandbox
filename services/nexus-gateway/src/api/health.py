from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis
import time

from ..db import get_db
from ..config import settings

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Health check endpoint for container orchestration.
    
    Returns basic health status of the gateway.
    """
    return {
        "status": "healthy",
        "service": "nexus-gateway",
        "timestamp": time.time()
    }


@router.get("/health/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """
    Readiness check - verifies dependencies are available.
    """
    checks = {
        "database": "fail",
        "redis": "fail",
    }
    
    # Check Database
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        pass
        
    # Check Redis
    try:
        r = redis.from_url(settings.redis_url)
        await r.ping()
        checks["redis"] = "ok"
        await r.close()
    except Exception:
        pass

    status = "ready" if all(v == "ok" for v in checks.values()) else "not_ready"
    
    return {
        "status": status,
        "checks": checks
    }
