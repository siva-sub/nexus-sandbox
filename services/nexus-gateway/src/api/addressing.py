"""
Addressing API - Proxy Resolution (acmt.023 / acmt.024)

Reference: https://docs.nexusglobalpayments.org/payment-setup/step-2-verify-recipient
Reference: NotebookLM 2026-02-03 - Addressing & Proxy Resolution (acmt)

This module implements recipient verification using Proxy Directory Operators (PDOs).
- acmt.023: Identification Verification Request (Source PSP -> Nexus -> PDO)
- acmt.024: Identification Verification Report (PDO -> Nexus -> Source PSP)
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
import uuid
import json
from datetime import datetime, timezone
from sqlalchemy import text
from ..db import get_db
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/v1", tags=["Addressing"])

# =============================================================================
# Models
# =============================================================================

from .schemas import ProxyResolutionRequest, ProxyResolutionResponse

# =============================================================================
# Endpoints
# =============================================================================

@router.post(
    "/addressing/resolve",
    response_model=ProxyResolutionResponse,
    summary="Resolve Proxy to Account Details (acmt.023/024)",
    description="""
    Resolves a proxy (like a mobile number) to a beneficiary name and account details.
    
    This simulates the acmt.023 -> acmt.024 flow where Nexus queries the 
    Destination Proxy Directory Operator (PDO).
    """
)
async def resolve_proxy(request: ProxyResolutionRequest, db: AsyncSession = Depends(get_db)):
    """
    Resolve proxy to account details using acmt.023/024 flow.
    
    In sandbox mode, uses a demo lookup table. Real Nexus routes to Destination PDO.
    
    Unhappy Flows (per NotebookLM spec):
    - BE23: Account Proxy Invalid (proxy not registered)
    - AC01: Incorrect Account Number
    - AB08: Offline Creditor Agent
    """
    correlation_id = str(uuid.uuid4())
    processed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    msg_id_suffix = correlation_id[:8].upper()
    
    # 1. Store acmt.023 request event (XSD: acmt.023.001.04)
    acmt023_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.023.001.04">
  <IdVrfctnReq>
    <Assgnmt>
      <MsgId>REQ-{msg_id_suffix}</MsgId>
      <CreDtTm>{processed_at}</CreDtTm>
      <Assgnr>
        <Agt><FinInstnId><BICFI>SRCPSPSGSG</BICFI></FinInstnId></Agt>
      </Assgnr>
      <Assgne>
        <Agt><FinInstnId><BICFI>NEXUSGWXXX</BICFI></FinInstnId></Agt>
      </Assgne>
    </Assgnmt>
    <Vrfctn>
      <Id>{correlation_id}</Id>
      <PtyAndAcctId>
        <Acct>
          <Prxy>
            <Tp><Cd>{request.proxy_type}</Cd></Tp>
            <Id>{request.proxy_value}</Id>
          </Prxy>
        </Acct>
      </PtyAndAcctId>
    </Vrfctn>
  </IdVrfctnReq>
</Document>"""

    await store_addressing_event(
        db=db,
        event_type="ADDRESSING_REQUESTED",
        actor="SOURCE_PSP",
        correlation_id=correlation_id,
        data={
            "proxy": request.proxy_value, 
            "proxyType": request.proxy_type,
            "structuredData": request.structured_data
        },
        acmt023_xml=acmt023_xml  # Store in dedicated column for Message Observatory
    )

    # 2. Attempt DB lookup in proxy_registrations table
    # Reference: proxy_registrations schema from 001_initial_schema.sql
    proxy_query = text("""
        SELECT 
            account_number,
            'CACC' as account_type,
            bank_bic as agent_bic,
            creditor_name as beneficiary_name,
            creditor_name_masked as display_name,
            bank_name
        FROM proxy_registrations
        WHERE proxy_value = :proxy_value
        AND proxy_type = :proxy_type
        AND country_code = :country_code
        AND status = 'ACTIVE'
    """)
    
    # If ACCT type, ensure we use the account number from structured data if available
    lookup_value = request.proxy_value
    if request.proxy_type == "ACCT" and request.structured_data:
        lookup_value = request.structured_data.get("accountNumber", request.proxy_value)
    
    val = lookup_value.lstrip("+")
    result = await db.execute(proxy_query, {
        "proxy_value": val,
        "proxy_type": request.proxy_type,
        "country_code": request.destination_country.upper()
    })
    row = result.fetchone()
    
    # Check for explicit unhappy flow triggers (test data)
    # Pattern: +XX9999999999 triggers BE23
    is_not_found_test = val.endswith("9999999999")
    
    if row and not is_not_found_test:
        # Happy flow: Proxy found
        res_data = {
            "accountNumber": row.account_number,
            "accountType": row.account_type,
            "agentBic": row.agent_bic,
            "beneficiaryName": row.beneficiary_name,
            "displayName": row.display_name,
            "status": "VALIDATED"
        }
        verification_result = "true"
        reason_block = ""
    elif is_not_found_test:
        # Unhappy flow: BE23 - Account Proxy Invalid (for testing)
        res_data = {
            "accountNumber": "",
            "accountType": "",
            "agentBic": "",
            "beneficiaryName": "",
            "displayName": "",
            "status": "NOT_FOUND"
        }
        verification_result = "false"
        reason_block = "<Rsn><Cd>BE23</Cd></Rsn>"
    else:
        # Sandbox fallback: generate synthetic but valid data
        res_data = {
            "accountNumber": f"{request.destination_country.upper()}88888{val[-4:]}",
            "accountType": "CACC",
            "agentBic": f"SNBX{request.destination_country.upper()}XX",
            "beneficiaryName": "Sandbox Demo User",
            "displayName": "Demo User",
            "status": "VALIDATED"
        }
        verification_result = "true"
        reason_block = ""

    # 3. Generate XSD-compliant acmt.024.001.04 response
    # Based on VerificationReport5 complex type from XSD
    updated_party_block = ""
    if res_data["status"] == "VALIDATED":
        updated_party_block = f"""
      <UpdtdPtyAndAcctId>
        <Pty><Nm>{res_data["beneficiaryName"]}</Nm></Pty>
        <Acct>
          <Id><Othr><Id>{res_data["accountNumber"]}</Id></Othr></Id>
        </Acct>
        <Agt><FinInstnId><BICFI>{res_data["agentBic"]}</BICFI></FinInstnId></Agt>
      </UpdtdPtyAndAcctId>"""

    acmt024_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.024.001.04">
  <IdVrfctnRpt>
    <Assgnmt>
      <MsgId>RPT-{msg_id_suffix}</MsgId>
      <CreDtTm>{processed_at}</CreDtTm>
      <Assgnr>
        <Agt><FinInstnId><BICFI>DEST{request.destination_country.upper()}PDO</BICFI></FinInstnId></Agt>
      </Assgnr>
      <Assgne>
        <Agt><FinInstnId><BICFI>SRCPSPSGSG</BICFI></FinInstnId></Agt>
      </Assgne>
    </Assgnmt>
    <Rpt>
      <OrgnlId>REQ-{msg_id_suffix}</OrgnlId>
      <Vrfctn>{verification_result}</Vrfctn>
      {reason_block}
      <OrgnlPtyAndAcctId>
        <Acct>
          <Prxy>
            <Tp><Cd>{request.proxy_type}</Cd></Tp>
            <Id>{request.proxy_value}</Id>
          </Prxy>
        </Acct>
      </OrgnlPtyAndAcctId>{updated_party_block}
    </Rpt>
  </IdVrfctnRpt>
</Document>"""

    await store_addressing_event(
        db=db,
        event_type="ADDRESSING_RESOLVED" if res_data["status"] == "VALIDATED" else "ADDRESSING_FAILED",
        actor="NEXUS_PDO",
        correlation_id=correlation_id,
        data={
            "beneficiary": res_data.get("beneficiaryName", ""),
            "status": res_data["status"],
            "reasonCode": "BE23" if res_data["status"] == "NOT_FOUND" else None
        },
        acmt024_xml=acmt024_xml  # Store in dedicated column for Message Observatory
    )

    if res_data["status"] == "NOT_FOUND":
        raise HTTPException(
            status_code=404,
            detail={
                "code": "BE23",
                "message": "Account Proxy Invalid - proxy not registered in destination directory",
                "correlationId": correlation_id
            }
        )

    return ProxyResolutionResponse(
        resolutionId=correlation_id,
        timestamp=processed_at,
        **res_data
    )


async def store_addressing_event(
    db: AsyncSession,
    event_type: str,
    actor: str,
    correlation_id: str,
    data: dict,
    acmt023_xml: str = None,
    acmt024_xml: str = None
):
    """Store addressing event using correlation_id as UETR placeholder.
    
    Note: Addressing events (acmt.023/024) occur before payment initiation,
    so they don't have a real UETR. We use the correlation_id as a placeholder
    since payment_events table requires non-null UETR.
    
    The acmt023_xml and acmt024_xml are stored in dedicated columns for 
    proper display in Payment Explorer's Messages tab.
    """
    query = text("""
        INSERT INTO payment_events (
            event_id, uetr, event_type, actor, correlation_id, data, version, occurred_at,
            acmt023_message, acmt024_message
        ) VALUES (
            gen_random_uuid(), :uetr, :event_type, :actor, :correlation_id, :data, 1, NOW(),
            :acmt023_message, :acmt024_message
        )
    """)
    
    await db.execute(query, {
        "uetr": correlation_id,  # Use correlation_id as UETR placeholder for addressing events
        "event_type": event_type,
        "actor": actor,
        "correlation_id": correlation_id,
        "data": json.dumps(data),
        "acmt023_message": acmt023_xml,
        "acmt024_message": acmt024_xml,
    })
    await db.commit()

