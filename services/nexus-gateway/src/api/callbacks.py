"""
pacs.002 Callback Delivery Module

Handles asynchronous delivery of ISO 20022 pacs.002 status reports
to the callback endpoints registered by Source IPS during pacs.008 submission.

Includes HMAC signature authentication for callback security.
"""

import os
import httpx
import asyncio
import hmac
import hashlib
import base64
import warnings
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4
import logging

logger = logging.getLogger(__name__)

# In production, this should be loaded from environment/secret management
# For sandbox, we use a default shared secret (MUST be changed in production)
_DEV_SHARED_SECRET = "nexus-sandbox-shared-secret-change-in-production"
DEFAULT_SHARED_SECRET = os.environ.get("NEXUS_CALLBACK_SECRET", _DEV_SHARED_SECRET)

# Warn if using dev secret
if DEFAULT_SHARED_SECRET == _DEV_SHARED_SECRET:
    warnings.warn(
        "SECURITY: Using development callback shared secret. "
        "Set NEXUS_CALLBACK_SECRET environment variable for production.",
        stacklevel=2
    )

# pacs.002 XML Template
PACS002_TEMPLATE = '''<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.10">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{creation_datetime}</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlEndToEndId>{uetr}</OrgnlEndToEndId>
      <TxSts>{status}</TxSts>
      <StsRsnInf>
        <Rsn>
          <Cd>{reason_code}</Cd>
        </Rsn>
        <AddtlInf>{additional_info}</AddtlInf>
      </StsRsnInf>
      <OrgnlTxRef>
        <IntrBkSttlmAmt Ccy="{currency}">{amount}</IntrBkSttlmAmt>
      </OrgnlTxRef>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>'''


def generate_callback_signature(
    payload: str,
    uetr: str,
    timestamp: str,
    shared_secret: str = DEFAULT_SHARED_SECRET
) -> str:
    """
    Generate HMAC-SHA256 signature for callback authentication.
    
    The signature is computed over: timestamp + uetr + payload
    This ensures message integrity and authenticates the sender.
    
    Args:
        payload: The callback payload (XML or JSON)
        uetr: Universal End-to-End Transaction Reference
        timestamp: ISO 8601 timestamp
        shared_secret: Shared secret for HMAC
        
    Returns:
        Base64-encoded HMAC-SHA256 signature
    """
    message = f"{timestamp}:{uetr}:{payload}"
    signature = hmac.new(
        shared_secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).digest()
    return base64.b64encode(signature).decode('utf-8')


def verify_callback_signature(
    payload: str,
    uetr: str,
    timestamp: str,
    signature: str,
    shared_secret: str = DEFAULT_SHARED_SECRET
) -> bool:
    """
    Verify HMAC-SHA256 signature for incoming callback.
    
    Args:
        payload: The callback payload
        uetr: Universal End-to-End Transaction Reference
        timestamp: ISO 8601 timestamp
        signature: Base64-encoded signature to verify
        shared_secret: Shared secret for HMAC
        
    Returns:
        True if signature is valid, False otherwise
    """
    expected = generate_callback_signature(payload, uetr, timestamp, shared_secret)
    return hmac.compare_digest(expected, signature)


def generate_pacs002_xml(
    uetr: str,
    status: str,  # ACCC (accepted) or RJCT (rejected)
    reason_code: Optional[str] = None,
    additional_info: Optional[str] = None,
    currency: str = "USD",
    amount: str = "0.00"
) -> str:
    """Generate ISO 20022 pacs.002 Payment Status Report XML."""
    
    msg_id = f"PSR{uuid4().hex[:12].upper()}"
    creation_datetime = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    
    return PACS002_TEMPLATE.format(
        msg_id=msg_id,
        creation_datetime=creation_datetime,
        uetr=uetr,
        status=status,
        reason_code=reason_code or ("" if status == "ACCC" else "NARR"),
        additional_info=additional_info or "",
        currency=currency,
        amount=amount
    )


async def deliver_pacs002_callback(
    callback_url: str,
    uetr: str,
    status: str,
    reason_code: Optional[str] = None,
    additional_info: Optional[str] = None,
    currency: str = "USD",
    amount: str = "0.00",
    max_retries: int = 3,
    shared_secret: Optional[str] = None
) -> bool:
    """
    Deliver pacs.002 status report to the registered callback endpoint.
    
    Includes HMAC-SHA256 signature for authentication and integrity.
    
    Args:
        callback_url: The pacs002Endpoint registered during pacs.008 submission
        uetr: Universal End-to-End Transaction Reference
        status: ACCC (accepted) or RJCT (rejected)
        reason_code: ISO 20022 ExternalStatusReason1Code (e.g., BE23, AM04)
        additional_info: Human-readable description
        max_retries: Number of retry attempts
        shared_secret: Shared secret for HMAC signature (uses default if not provided)
        
    Returns:
        True if delivery successful, False otherwise
    """
    
    if not callback_url:
        logger.warning(f"No callback URL for UETR {uetr}, skipping pacs.002 delivery")
        return False
    
    secret = shared_secret or DEFAULT_SHARED_SECRET
    
    pacs002_xml = generate_pacs002_xml(
        uetr=uetr,
        status=status,
        reason_code=reason_code,
        additional_info=additional_info,
        currency=currency,
        amount=amount
    )
    
    # Generate signature
    timestamp = datetime.now(timezone.utc).isoformat()
    signature = generate_callback_signature(pacs002_xml, uetr, timestamp, secret)
    
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    callback_url,
                    content=pacs002_xml,
                    headers={
                        "Content-Type": "application/xml",
                        "X-UETR": uetr,
                        "X-Message-Type": "pacs.002",
                        "X-Transaction-Status": status,
                        "X-Callback-Timestamp": timestamp,
                        "X-Callback-Signature": signature,
                        "X-Callback-Version": "1",
                    }
                )
                
                if response.status_code in (200, 201, 202):
                    logger.info(f"pacs.002 delivered for {uetr}: {status} -> {callback_url}")
                    return True
                else:
                    logger.warning(f"pacs.002 delivery failed for {uetr}: HTTP {response.status_code}")
                    
        except Exception as e:
            logger.error(f"pacs.002 delivery error for {uetr} (attempt {attempt + 1}): {e}")
            
        # Wait before retry
        if attempt < max_retries - 1:
            await asyncio.sleep(2 ** attempt)  # Exponential backoff
    
    return False


async def schedule_pacs002_delivery(
    callback_url: str,
    uetr: str,
    status: str,
    reason_code: Optional[str] = None,
    additional_info: Optional[str] = None,
    delay_seconds: float = 0.5
):
    """
    Schedule pacs.002 delivery as background task with optional delay.
    Simulates realistic async processing time.
    """
    await asyncio.sleep(delay_seconds)
    await deliver_pacs002_callback(
        callback_url=callback_url,
        uetr=uetr,
        status=status,
        reason_code=reason_code,
        additional_info=additional_info
    )


# =============================================================================
# Quote Acceptance Notifications (FXP Trade Notifications)
# =============================================================================

async def notify_fxp_trade(
    callback_url: str,
    fxp_bic: str,
    quote_id: str,
    uetr: str,
    source_currency: str,
    destination_currency: str,
    amount: str,
    rate: str,
    max_retries: int = 3,
    shared_secret: Optional[str] = None
) -> bool:
    """
    Send trade notification to FXP when their rate is selected.
    
    Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers
    
    Args:
        callback_url: FXP's registered trade notification endpoint
        fxp_bic: BIC of the FXP
        quote_id: ID of the selected quote
        uetr: Universal End-to-End Transaction Reference
        source_currency: Source currency code
        destination_currency: Destination currency code
        amount: Transaction amount
        rate: Applied exchange rate
        max_retries: Number of retry attempts
        shared_secret: Shared secret for HMAC signature
        
    Returns:
        True if notification delivered successfully, False otherwise
    """
    if not callback_url:
        logger.warning(f"No trade callback URL for FXP {fxp_bic}, skipping notification")
        return False
    
    secret = shared_secret or DEFAULT_SHARED_SECRET
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Build notification payload (JSON for trade notifications)
    notification = {
        "eventType": "TRADE_NOTIFICATION",
        "timestamp": timestamp,
        "fxpBic": fxp_bic,
        "quoteId": quote_id,
        "uetr": uetr,
        "sourceCurrency": source_currency,
        "destinationCurrency": destination_currency,
        "amount": amount,
        "rate": rate,
    }
    
    payload = str(notification)  # Convert to string for signing
    signature = generate_callback_signature(payload, uetr, timestamp, secret)
    
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    callback_url,
                    json=notification,
                    headers={
                        "Content-Type": "application/json",
                        "X-UETR": uetr,
                        "X-Event-Type": "TRADE_NOTIFICATION",
                        "X-Callback-Timestamp": timestamp,
                        "X-Callback-Signature": signature,
                        "X-Callback-Version": "1",
                    }
                )
                
                if response.status_code in (200, 201, 202):
                    logger.info(f"Trade notification delivered for {quote_id} to FXP {fxp_bic}")
                    return True
                else:
                    logger.warning(f"Trade notification failed for {quote_id}: HTTP {response.status_code}")
                    
        except Exception as e:
            logger.error(f"Trade notification error for {quote_id} (attempt {attempt + 1}): {e}")
            
        if attempt < max_retries - 1:
            await asyncio.sleep(2 ** attempt)
    
    return False


# =============================================================================
# Callback Testing
# =============================================================================

async def test_callback_endpoint(
    callback_url: str,
    shared_secret: Optional[str] = None
) -> dict:
    """
    Test a callback endpoint by sending a ping request.
    
    Args:
        callback_url: The URL to test
        shared_secret: Optional secret for HMAC (uses default if not provided)
    
    Returns:
        Dict with success status and response details
    """
    # Use provided secret or fall back to default
    secret = shared_secret or DEFAULT_SHARED_SECRET
    timestamp = datetime.now(timezone.utc).isoformat()
    uetr = str(uuid4())
    
    ping_payload = '{"eventType": "PING", "timestamp": "' + timestamp + '"}'
    signature = generate_callback_signature(ping_payload, uetr, timestamp, secret)
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                callback_url,
                content=ping_payload,
                headers={
                    "Content-Type": "application/json",
                    "X-UETR": uetr,
                    "X-Event-Type": "PING",
                    "X-Callback-Timestamp": timestamp,
                    "X-Callback-Signature": signature,
                }
            )
            
            return {
                "success": response.status_code in (200, 201, 202),
                "statusCode": response.status_code,
                "responseBody": response.text[:500] if response.text else None,
                "latencyMs": response.elapsed.total_seconds() * 1000 if hasattr(response, 'elapsed') else None
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "errorType": type(e).__name__
        }


# Error code descriptions for frontend display
ERROR_CODE_DESCRIPTIONS = {
    "ACCC": "Accepted Settlement Completed",
    "AB04": "Quote expired - exchange rate guarantee lapsed",
    "AM02": "Amount exceeds IPS transaction limit",
    "AM04": "Insufficient funds in debtor account",
    "AC04": "Closed account - recipient account has been closed",
    "BE23": "Account/Proxy invalid - not registered in PDO",
    "RR04": "Regulatory block - AML/CFT screening failed",
    "RC11": "Invalid SAP - settlement access provider not registered",
    "DUPL": "Duplicate payment - UETR already exists",
    "AGNT": "Agent incorrect - PSP not onboarded to Nexus",
    "FF05": "Invalid currency for corridor",
    "NARR": "Narrative - see additional information",
}


def get_error_description(code: str) -> str:
    """Get human-readable description for ISO 20022 status reason code."""
    return ERROR_CODE_DESCRIPTIONS.get(code, f"Unknown error code: {code}")
