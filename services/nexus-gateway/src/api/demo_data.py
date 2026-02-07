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
    
    # Calculate cutoff time - use parameterized queries to prevent SQL injection
    cutoff = datetime.now(timezone.utc) - timedelta(hours=age_hours) if age_hours > 0 else None
    
    # Count records to delete using parameterized queries
    counts = {}
    
    # Count payments - use proper parameter binding
    if cutoff:
        payments_count_query = text("SELECT COUNT(*) FROM payments WHERE created_at < :cutoff")
        result = await db.execute(payments_count_query.bindparams(cutoff=cutoff))
    else:
        result = await db.execute(text("SELECT COUNT(*) FROM payments"))
    counts["payments"] = result.scalar() or 0
    
    # Count payment_events using subquery with parameterized cutoff
    if cutoff:
        events_count_query = text("""
            SELECT COUNT(*) FROM payment_events 
            WHERE uetr IN (SELECT uetr FROM payments WHERE created_at < :cutoff)
        """)
        result = await db.execute(events_count_query.bindparams(cutoff=cutoff))
    else:
        result = await db.execute(text("""
            SELECT COUNT(*) FROM payment_events 
            WHERE uetr IN (SELECT uetr FROM payments)
        """))
    counts["payment_events"] = result.scalar() or 0
    
    # Count quotes if requested
    if include_quotes:
        if cutoff:
            quotes_count_query = text("SELECT COUNT(*) FROM quotes WHERE created_at < :cutoff")
            result = await db.execute(quotes_count_query.bindparams(cutoff=cutoff))
        else:
            result = await db.execute(text("SELECT COUNT(*) FROM quotes"))
        counts["quotes"] = result.scalar() or 0
    
    # If dry run, just return counts
    if dry_run:
        return {
            "dryRun": True,
            "wouldDelete": counts,
            "ageHours": age_hours,
            "message": "No data was deleted (dry run mode)"
        }
    
    # Actually delete the data using parameterized queries
    deleted = {}
    
    # Delete payment_events first (foreign key constraint)
    if cutoff:
        events_delete_query = text("""
            DELETE FROM payment_events 
            WHERE uetr IN (SELECT uetr FROM payments WHERE created_at < :cutoff)
        """)
        result = await db.execute(events_delete_query.bindparams(cutoff=cutoff))
    else:
        result = await db.execute(text("""
            DELETE FROM payment_events 
            WHERE uetr IN (SELECT uetr FROM payments)
        """))
    deleted["payment_events"] = result.rowcount
    
    # Delete payments
    if cutoff:
        payments_delete_query = text("DELETE FROM payments WHERE created_at < :cutoff")
        result = await db.execute(payments_delete_query.bindparams(cutoff=cutoff))
    else:
        result = await db.execute(text("DELETE FROM payments"))
    deleted["payments"] = result.rowcount
    
    # Delete quotes if requested
    if include_quotes:
        if cutoff:
            quotes_delete_query = text("DELETE FROM quotes WHERE created_at < :cutoff")
            result = await db.execute(quotes_delete_query.bindparams(cutoff=cutoff))
        else:
            result = await db.execute(text("DELETE FROM quotes"))
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
