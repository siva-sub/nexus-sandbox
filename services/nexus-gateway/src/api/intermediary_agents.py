"""
Quote Intermediary Agents API

Reference: https://docs.nexusglobalpayments.org/payment-setup/step-13-request-intermediary-agents

Step 13 of the payment flow: Source PSP retrieves the account details
for the Settlement Access Providers (SAPs) where the FX Provider holds funds.

These details are REQUIRED in the pacs.008 message:
- IntermediaryAgent1: FXP's account at Source SAP
- IntermediaryAgent2: FXP's account at Destination SAP
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from ..db import get_db

router = APIRouter(prefix="/v1", tags=["Quotes"])


from .schemas import IntermediaryAgentAccount, IntermediaryAgentsResponse


@router.get(
    "/quotes/{quote_id}/intermediary-agents",
    response_model=IntermediaryAgentsResponse,
    summary="Get intermediary agents for a quote (Step 13)",
    description="""
    **Step 13 of Payment Flow**
    
    Retrieves the Settlement Access Provider (SAP) account details 
    for the FX Provider associated with the selected quote.
    
    These details are MANDATORY in the pacs.008 message:
    - **IntermediaryAgent1**: FXP's account at Source SAP (source country)
    - **IntermediaryAgent2**: FXP's account at Destination SAP (destination country)
    
    The Source PSP must include these exactly as provided to ensure
    proper settlement routing.
    
    Reference: https://docs.nexusglobalpayments.org/payment-setup/step-13-request-intermediary-agents
    """
)
async def get_intermediary_agents(
    quote_id: str,
    db: AsyncSession = Depends(get_db)
) -> IntermediaryAgentsResponse:
    """
    Get intermediary agents for a quote.
    
    In production, this queries the quote and FXP configuration.
    For sandbox, returns example SAP accounts.
    """
    # For sandbox: return example intermediary agents
    # Production would query quotes table and fxp_sap_accounts table
    
    # Example: SGD -> THB corridor
    return IntermediaryAgentsResponse(
        quoteId=quote_id,
        fxpId="FXP_EXAMPLE_001",
        fxpName="Example FX Provider Pte Ltd",
        intermediaryAgent1=IntermediaryAgentAccount(
            agentRole="IntermediaryAgent1",
            sapId="SAP_SG_FAST",
            sapName="Singapore FAST SAP",
            sapBicfi="FASTSGS0",
            accountId="SG12345678901234",
            accountType="CACC",
            currency="SGD"
        ),
        intermediaryAgent2=IntermediaryAgentAccount(
            agentRole="IntermediaryAgent2",
            sapId="SAP_TH_PROMPTPAY",
            sapName="Thailand PromptPay SAP",
            sapBicfi="PPAYTH2B",
            accountId="TH98765432109876",
            accountType="CACC",
            currency="THB"
        )
    )


@router.get(
    "/quotes/{quote_id}",
    summary="Get quote details by ID",
    description="""
    Retrieves the details of a previously generated quote.
    
    Useful for validating quote before submitting pacs.008.
    
    Note: Quotes expire after 600 seconds (10 minutes).
    """
)
async def get_quote_details(
    quote_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    Get quote details by ID.
    """
    # For sandbox: return example quote details
    from datetime import datetime, timezone, timedelta
    
    valid_until = datetime.now(timezone.utc) + timedelta(seconds=600)
    
    return {
        "quoteId": quote_id,
        "status": "ACTIVE",
        "validUntil": valid_until.isoformat(),
        "remainingSeconds": 600,
        "sourceAmount": "1000.00",
        "sourceCurrency": "SGD",
        "destinationAmount": "25850.00",
        "destinationCurrency": "THB",
        "exchangeRate": "25.85",
        "fxpId": "FXP_EXAMPLE_001",
        "destinationPspFee": "20.00",
        "nexusSchemeFee": "0.50",
        "intermediaryAgentsEndpoint": f"/v1/quotes/{quote_id}/intermediary-agents"
    }
