"""
Shared ISO 20022 Utility Functions

This module contains shared helper functions used by multiple
ISO 20022 message handlers (pacs.008, acmt.023, pain.001, etc.).
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from decimal import Decimal
from typing import Optional
import json


async def store_payment(
    db: AsyncSession,
    uetr: str,
    quote_id: Optional[str],
    source_psp_bic: str,
    destination_psp_bic: str,
    debtor_name: str,
    debtor_account: str,
    creditor_name: str,
    creditor_account: str,
    source_currency: str,
    destination_currency: str,
    source_amount: str,
    exchange_rate: Optional[str],
    status: str
):
    """Store payment record matching schema."""
    query = text("""
        INSERT INTO payments (
            uetr, quote_id, source_psp_bic, destination_psp_bic,
            debtor_name, debtor_account, creditor_name, creditor_account,
            source_currency, destination_currency, interbank_settlement_amount,
            exchange_rate, status, initiated_at, updated_at
        ) VALUES (
            :uetr, :quote_id, :source_psp_bic, :destination_psp_bic,
            :debtor_name, :debtor_account, :creditor_name, :creditor_account,
            :source_currency, :destination_currency, :interbank_settlement_amount,
            :exchange_rate, :status, NOW(), NOW()
        )
        ON CONFLICT (uetr, initiated_at) DO UPDATE SET
            status = EXCLUDED.status,
            updated_at = NOW()
    """)
    
    await db.execute(query, {
        "uetr": uetr,
        "quote_id": quote_id,
        "source_psp_bic": source_psp_bic or "MOCKPSGSG",
        "destination_psp_bic": destination_psp_bic or "MOCKTHBK",
        "debtor_name": debtor_name or "Demo Sender",
        "debtor_account": debtor_account or "DEMO-SENDER-ACCT",
        "creditor_name": creditor_name or "Demo Recipient",
        "creditor_account": creditor_account or "DEMO-RECIPIENT-ACCT",
        "source_currency": source_currency or "SGD",
        "destination_currency": destination_currency or "THB",
        "interbank_settlement_amount": Decimal(source_amount) if source_amount else Decimal("0"),
        "exchange_rate": Decimal(exchange_rate) if exchange_rate else None,
        "status": status,
    })
    await db.commit()


async def store_payment_event(
    db: AsyncSession,
    uetr: str,
    event_type: str,
    actor: str,
    data: dict,
    pacs008_xml: str = None,
    pacs002_xml: str = None,
    acmt023_xml: str = None,
    acmt024_xml: str = None,
    camt054_xml: str = None,
    camt103_xml: str = None,
    pain001_xml: str = None,
    pacs004_xml: str = None,
    pacs028_xml: str = None,
    camt056_xml: str = None,
    camt029_xml: str = None
):
    """Store payment event with actor details and optional ISO 20022 messages."""
    query = text("""
        INSERT INTO payment_events (
            event_id, uetr, event_type, actor, data, version, occurred_at,
            pacs008_message, pacs002_message, acmt023_message, acmt024_message,
            camt054_message, camt103_message, pain001_message,
            pacs004_message, pacs028_message, camt056_message, camt029_message
        ) VALUES (
            gen_random_uuid(), :uetr, :event_type, :actor, :data, 1, NOW(),
            :pacs008_message, :pacs002_message, :acmt023_message, :acmt024_message,
            :camt054_message, :camt103_message, :pain001_message,
            :pacs004_message, :pacs028_message, :camt056_message, :camt029_message
        )
    """)
    
    await db.execute(query, {
        "uetr": uetr,
        "event_type": event_type,
        "actor": actor,
        "data": json.dumps(data),
        "pacs008_message": pacs008_xml,
        "pacs002_message": pacs002_xml,
        "acmt023_message": acmt023_xml,
        "acmt024_message": acmt024_xml,
        "camt054_message": camt054_xml,
        "camt103_message": camt103_xml,
        "pain001_message": pain001_xml,
        "pacs004_message": pacs004_xml,
        "pacs028_message": pacs028_xml,
        "camt056_message": camt056_xml,
        "camt029_message": camt029_xml,
    })
    await db.commit()
