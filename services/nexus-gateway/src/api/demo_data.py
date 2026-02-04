"""
Demo Data Management API Endpoints

Provides endpoints for managing test/demo data created by the interactive demo.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timedelta, timezone

from ..db import get_db

router = APIRouter()


# =============================================================================
# DELETE /demo-data - Purge Demo/Test Data
# =============================================================================

@router.delete(
    "",
    tags=["Demo Data"],
    summary="Purge demo/test data",
    description="""
    Purge payments and related data created by the interactive demo.
    
    Options:
    - **age_hours**: Delete data older than N hours (default: 0 = all demo data)
    - **dry_run**: If true, return counts without deleting
    
    This removes:
    - Payments table records
    - Payment events
    - Related quotes (optional)
    """,
)
async def purge_demo_data(
    age_hours: int = Query(
        0,
        ge=0,
        description="Delete demo data older than N hours. 0 = all demo data."
    ),
    include_quotes: bool = Query(
        True,
        alias="includeQuotes",
        description="Also delete associated quotes"
    ),
    dry_run: bool = Query(
        False,
        alias="dryRun",
        description="Preview what would be deleted without actually deleting"
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Purge demo data from the database."""
    
    # Calculate cutoff time
    if age_hours > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=age_hours)
        time_condition = f"created_at < '{cutoff.isoformat()}'"
    else:
        time_condition = "1=1"  # All records
    
    # Count records to delete
    counts = {}
    
    # Count payments
    payments_query = f"SELECT COUNT(*) FROM payments WHERE {time_condition}"
    result = await db.execute(text(payments_query))
    counts["payments"] = result.scalar() or 0
    
    # Count payment_events
    events_query = f"""
        SELECT COUNT(*) FROM payment_events 
        WHERE payment_uetr IN (SELECT uetr FROM payments WHERE {time_condition})
    """
    result = await db.execute(text(events_query))
    counts["payment_events"] = result.scalar() or 0
    
    # Count quotes if requested
    if include_quotes:
        quotes_query = f"SELECT COUNT(*) FROM quotes WHERE {time_condition}"
        result = await db.execute(text(quotes_query))
        counts["quotes"] = result.scalar() or 0
    
    # If dry run, just return counts
    if dry_run:
        return {
            "dryRun": True,
            "wouldDelete": counts,
            "ageHours": age_hours,
            "message": "No data was deleted (dry run mode)"
        }
    
    # Actually delete the data
    deleted = {}
    
    # Delete payment_events first (foreign key constraint)
    events_delete = f"""
        DELETE FROM payment_events 
        WHERE payment_uetr IN (SELECT uetr FROM payments WHERE {time_condition})
    """
    result = await db.execute(text(events_delete))
    deleted["payment_events"] = result.rowcount
    
    # Delete payments
    payments_delete = f"DELETE FROM payments WHERE {time_condition}"
    result = await db.execute(text(payments_delete))
    deleted["payments"] = result.rowcount
    
    # Delete quotes if requested
    if include_quotes:
        quotes_delete = f"DELETE FROM quotes WHERE {time_condition}"
        result = await db.execute(text(quotes_delete))
        deleted["quotes"] = result.rowcount
    
    await db.commit()
    
    return {
        "dryRun": False,
        "deleted": deleted,
        "ageHours": age_hours,
        "message": f"Successfully purged {deleted['payments']} payments and related data"
    }


# =============================================================================
# GET /demo-data/stats - Get Demo Data Statistics
# =============================================================================

@router.get(
    "/stats",
    tags=["Demo Data"],
    summary="Get demo data statistics",
    description="Get counts and statistics of demo data in the database.",
)
async def get_demo_data_stats(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get statistics about demo data."""
    
    stats = {}
    
    # Count payments
    result = await db.execute(text("SELECT COUNT(*) FROM payments"))
    stats["totalPayments"] = result.scalar() or 0
    
    # Count by status
    result = await db.execute(text("""
        SELECT status, COUNT(*) as count 
        FROM payments 
        GROUP BY status
    """))
    stats["paymentsByStatus"] = {row[0]: row[1] for row in result.fetchall()}
    
    # Count quotes
    result = await db.execute(text("SELECT COUNT(*) FROM quotes"))
    stats["totalQuotes"] = result.scalar() or 0
    
    # Count payment events
    result = await db.execute(text("SELECT COUNT(*) FROM payment_events"))
    stats["totalEvents"] = result.scalar() or 0
    
    # Oldest payment
    result = await db.execute(text("SELECT MIN(created_at) FROM payments"))
    oldest = result.scalar()
    stats["oldestPayment"] = oldest.isoformat() if oldest else None
    
    # Most recent payment
    result = await db.execute(text("SELECT MAX(created_at) FROM payments"))
    newest = result.scalar()
    stats["newestPayment"] = newest.isoformat() if newest else None
    
    return stats
