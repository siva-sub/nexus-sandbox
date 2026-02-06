"""
Address Types and Input Validation API

Reference: https://docs.nexusglobalpayments.org/apis/address-types

These endpoints enable Source PSP to dynamically generate forms 
for capturing recipient details with proper validation.

IMPORTANT: NotebookLM query 2026-02-03 confirms:
- Inputs have Label (Code, Title), Attributes (Name, Type, Pattern, Placeholder, Required)
- Pattern is regex provided dynamically per country
- Email (EMAL) pattern is explicitly NULL - use browser default
- Philippines requires finInstId even for proxies (special case)
- ISO 20022 Path tells where to put data in acmt.023
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from pydantic import BaseModel
from ..db import get_db

router = APIRouter(prefix="/v1", tags=["Addressing"])


# =============================================================================
# Pydantic Models matching exact Nexus API structure
# =============================================================================

from .schemas import (
    InputLabel,
    InputAttributes,
    AddressTypeInput,
    AddressTypeInputsResponse,
    CountryAddressTypesResponse,
)


# =============================================================================
# Input Definitions per ISO 20022 ExternalProxyAccountType1Code
# NotebookLM confirmed: Pattern is dynamic per country
# =============================================================================

def get_mbno_inputs(country_code: str) -> list[AddressTypeInput]:
    """Mobile number inputs - pattern varies by country."""
    # Country-specific regex patterns per E.164 format
    patterns = {
        "SG": r"^\+65[689]\d{7}$",  # Singapore: +65 + 8 digits starting with 6/8/9
        "TH": r"^\+66[689]\d{8}$",  # Thailand: +66 + 9 digits
        "MY": r"^\+60[1]\d{8,9}$",  # Malaysia: +60 + 9-10 digits starting with 1
        "PH": r"^\+63[9]\d{9}$",    # Philippines: +63 + 10 digits starting with 9
        "ID": r"^\+62[8]\d{8,11}$", # Indonesia: +62 + 9-12 digits starting with 8
        "IN": r"^\+91[6-9]\d{9}$",  # India: +91 + 10 digits starting with 6-9
    }
    placeholders = {
        "SG": "+6591234567",
        "TH": "+66891234567",
        "MY": "+60123456789",
        "PH": "+639123456789",
        "ID": "+6281234567890",
        "IN": "+919123456789",
    }
    
    inputs = [
        AddressTypeInput(
            label=InputLabel(code="MBNO", title={"en": "Mobile Number"}),
            attributes=InputAttributes(
                name="accountOrProxyId",
                type="tel",
                pattern=patterns.get(country_code, r"^\+[1-9]\d{6,14}$"),
                placeholder=placeholders.get(country_code, "+1234567890"),
                required=True,
                hidden=False
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/Pty/Id/OrgId/Othr/Id"
        ),
        AddressTypeInput(
            label=InputLabel(code="MBNO", title={"en": "Address Type Code"}),
            attributes=InputAttributes(
                name="addressTypeCode",
                type="text",
                pattern=None,
                placeholder=None,
                required=True,
                hidden=True  # Hidden field
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/Pty/Id/OrgId/Othr/SchmeNm/Cd"
        ),
    ]
    
    # Philippines special case: requires finInstId even for proxies
    if country_code == "PH":
        inputs.insert(1, AddressTypeInput(
            label=InputLabel(code="FININSTID", title={"en": "Bank"}),
            attributes=InputAttributes(
                name="finInstId",
                type="text",
                pattern=r"^[A-Z]{4}PH[A-Z0-9]{2}([A-Z0-9]{3})?$",
                placeholder="BPIPHMMM",
                required=True,
                hidden=False
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/AcctId/Othr/Id"
        ))
    
    return inputs


def get_emal_inputs(country_code: str) -> list[AddressTypeInput]:
    """Email inputs - pattern is explicitly NULL per NotebookLM."""
    return [
        AddressTypeInput(
            label=InputLabel(code="EMAL", title={"en": "Email Address"}),
            attributes=InputAttributes(
                name="accountOrProxyId",
                type="email",
                pattern=None,  # NULL - use browser default validation
                placeholder="recipient@example.com",
                required=True,
                hidden=False
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/Pty/Id/OrgId/Othr/Id"
        ),
        AddressTypeInput(
            label=InputLabel(code="EMAL", title={"en": "Address Type Code"}),
            attributes=InputAttributes(
                name="addressTypeCode",
                type="text",
                pattern=None,
                placeholder=None,
                required=True,
                hidden=True
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/Pty/Id/OrgId/Othr/SchmeNm/Cd"
        ),
    ]


def get_acct_inputs(country_code: str) -> list[AddressTypeInput]:
    """Account number inputs - requires TWO visible fields."""
    return [
        AddressTypeInput(
            label=InputLabel(code="ACCT", title={"en": "Account Number"}),
            attributes=InputAttributes(
                name="accountOrProxyId",
                type="text",
                pattern=r"^[0-9]{8,20}$",
                placeholder="1234567890",
                required=True,
                hidden=False
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/AcctId/Othr/Id"
        ),
        AddressTypeInput(
            label=InputLabel(code="BICFI", title={"en": "Bank BIC/SWIFT Code"}),
            attributes=InputAttributes(
                name="finInstId",
                type="text",
                pattern=r"^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$",
                placeholder="DBSSSGSG",
                required=True,
                hidden=False
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/Agt/FinInstnId/BICFI"
        ),
        AddressTypeInput(
            label=InputLabel(code="ACCT", title={"en": "Address Type Code"}),
            attributes=InputAttributes(
                name="addressTypeCode",
                type="text",
                pattern=None,
                placeholder=None,
                required=True,
                hidden=True
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/AcctId/Othr/SchmeNm/Cd"
        ),
    ]


def get_iban_inputs(country_code: str) -> list[AddressTypeInput]:
    """IBAN inputs - pattern varies by country."""
    # Country-specific IBAN patterns (length varies)
    patterns = {
        "DE": r"^DE[0-9]{2}[0-9]{18}$",       # Germany: 22 chars
        "FR": r"^FR[0-9]{2}[A-Z0-9]{23}$",    # France: 27 chars
        "GB": r"^GB[0-9]{2}[A-Z]{4}[0-9]{14}$", # UK: 22 chars
        "CH": r"^CH[0-9]{2}[0-9]{17}$",       # Switzerland: 21 chars
    }
    
    return [
        AddressTypeInput(
            label=InputLabel(code="IBAN", title={"en": "IBAN"}),
            attributes=InputAttributes(
                name="accountOrProxyId",
                type="text",
                pattern=patterns.get(country_code, r"^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$"),
                placeholder="DE89370400440532013000",
                required=True,
                hidden=False
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/AcctId/IBAN"
        ),
        AddressTypeInput(
            label=InputLabel(code="IBAN", title={"en": "Address Type Code"}),
            attributes=InputAttributes(
                name="addressTypeCode",
                type="text",
                pattern=None,
                placeholder=None,
                required=True,
                hidden=True
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/AcctId/Othr/SchmeNm/Cd"
        ),
    ]


def get_nidn_inputs(country_code: str) -> list[AddressTypeInput]:
    """National ID inputs."""
    patterns = {
        "SG": r"^[STFGM]\d{7}[A-Z]$",  # Singapore NRIC/FIN
        "MY": r"^\d{12}$",              # Malaysia MyKad
        "TH": r"^\d{13}$",              # Thailand ID
    }
    
    return [
        AddressTypeInput(
            label=InputLabel(code="NIDN", title={"en": "National ID"}),
            attributes=InputAttributes(
                name="accountOrProxyId",
                type="text",
                pattern=patterns.get(country_code, r"^[A-Z0-9]{6,20}$"),
                placeholder="S1234567D" if country_code == "SG" else "123456789012",
                required=True,
                hidden=False
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/Pty/Id/PrvtId/Othr/Id"
        ),
        AddressTypeInput(
            label=InputLabel(code="NIDN", title={"en": "Address Type Code"}),
            attributes=InputAttributes(
                name="addressTypeCode",
                type="text",
                pattern=None,
                placeholder=None,
                required=True,
                hidden=True
            ),
            iso20022Path="acmt023/Document/IdVrfctnReq/Vrfctn/PtyAndAcctId/Pty/Id/PrvtId/Othr/SchmeNm/Cd"
        ),
    ]


# Mapping of proxy types to input generators
# Reference: migrations/002_seed_data.sql standardizes these codes
PROXY_TYPE_GENERATORS = {
    "MOBI": get_mbno_inputs,  # Singapore, Thailand, Malaysia (legacy standard)
    "MBNO": get_mbno_inputs,  # Indonesia, India (new standard)
    "EMAL": get_emal_inputs,
    # "NIK": get_nik_inputs, # Not yet implemented
    # "VPA": get_vpa_inputs, # Not yet implemented
    # "UEN": get_uen_inputs, # Not yet implemented
    # "NRIC": get_nric_inputs, # Not yet implemented
    "NIDN": get_nidn_inputs,
    # "EWAL": get_ewal_inputs, # Not yet implemented
    # "BIZN": get_bizn_inputs, # Not yet implemented
    # "PASS": get_pass_inputs, # Not yet implemented
    "ACCT": get_acct_inputs,
    "IBAN": get_iban_inputs, # IBAN is a type of ACCT, but has its own generator
}

# Country-specific proxy type availability
COUNTRY_PROXY_TYPES = {
    "SG": ["MOBI", "NIDN", "ACCT"],  # PayNow
    "TH": ["MOBI", "NIDN", "ACCT"],  # PromptPay
    "MY": ["MOBI", "NIDN", "ACCT"],  # DuitNow
    "PH": ["MBNO", "ACCT"],          # InstaPay (MBNO requires finInstId)
    "ID": ["MBNO", "EMAL", "ACCT"],  # BI-FAST
    "IN": ["MBNO", "ACCT"],          # UPI
    "DE": ["IBAN"],                  # SEPA
    "FR": ["IBAN"],                  # SEPA
    "GB": ["IBAN", "ACCT"],          # Faster Payments
}


# =============================================================================
# API Endpoints
# =============================================================================

@router.get(
    "/address-types/{address_type_id}/inputs",
    response_model=AddressTypeInputsResponse,
    summary="Get input fields for an address type",
    description="""
    Returns the specific input fields and validation rules (regex) 
    required for a chosen address type.
    
    The response includes:
    - **Label**: Code and localized title
    - **Attributes**: Name, type, pattern (regex), placeholder, required, hidden
    - **ISO 20022 Path**: Where to place this data in acmt.023
    
    **Important per NotebookLM**:
    - Email (EMAL) pattern is NULL - use browser default validation
    - Philippines (PH) requires finInstId even for mobile proxies
    
    Reference: https://docs.nexusglobalpayments.org/apis/address-types
    """
)
async def get_address_type_inputs(
    address_type_id: str,
    country_code: str = "SG"
) -> AddressTypeInputsResponse:
    """Get input field definitions for an address type."""
    address_type_upper = address_type_id.upper()
    country_upper = country_code.upper()
    
    if address_type_upper not in PROXY_TYPE_GENERATORS:
        raise HTTPException(
            status_code=404,
            detail=f"Address type {address_type_id} not found. "
                   f"Valid types: {list(PROXY_TYPE_GENERATORS.keys())}"
        )
    
    generator = PROXY_TYPE_GENERATORS[address_type_upper]
    inputs = generator(country_upper)
    
    # Get display name from first input's label
    display_name = inputs[0].label.title.get("en", address_type_upper)
    
    return AddressTypeInputsResponse(
        addressTypeId=address_type_upper,
        addressTypeName=display_name,
        countryCode=country_upper,
        inputs=inputs
    )


@router.get(
    "/countries/{country_code}/address-types",
    summary="List address types for a country",
    description="""
    Returns the list of available address types for a destination country.
    
    The Source PSP calls this first, then calls `/address-types/{id}/inputs`
    to get the specific field definitions for the selected type.
    """
)
async def list_country_address_types(
    country_code: str
) -> dict:
    """List available address types for a country."""
    country_upper = country_code.upper()
    proxy_types = COUNTRY_PROXY_TYPES.get(country_upper, ["MBNO", "ACCT"])
    
    types = []
    for proxy_type in proxy_types:
        if proxy_type in PROXY_TYPE_GENERATORS:
            generator = PROXY_TYPE_GENERATORS[proxy_type]
            inputs = generator(country_upper)
            display_name = inputs[0].label.title.get("en", proxy_type)
            types.append({
                "addressTypeId": proxy_type,
                "addressTypeName": display_name,
                "inputsEndpoint": f"/v1/address-types/{proxy_type}/inputs?country_code={country_upper}"
            })
    
    return {
        "countryCode": country_upper,
        "addressTypes": types,
        "count": len(types)
    }


@router.get(
    "/countries/{country_code}/address-types-and-inputs",
    response_model=CountryAddressTypesResponse,
    summary="Get all address types with inputs for a country",
    description="""
    Combined endpoint that returns all address types and their 
    corresponding input fields for a specific country in one response.
    
    More efficient than separate calls to list types then get inputs.
    
    Reference: https://docs.nexusglobalpayments.org/apis/address-types
    """
)
async def get_country_address_types_and_inputs(
    country_code: str
) -> CountryAddressTypesResponse:
    """Get all address types with their input definitions for a country."""
    country_upper = country_code.upper()
    proxy_types = COUNTRY_PROXY_TYPES.get(country_upper, ["MBNO", "ACCT"])
    
    address_types = []
    for proxy_type in proxy_types:
        if proxy_type in PROXY_TYPE_GENERATORS:
            generator = PROXY_TYPE_GENERATORS[proxy_type]
            inputs = generator(country_upper)
            display_name = inputs[0].label.title.get("en", proxy_type)
            
            address_types.append(AddressTypeInputsResponse(
                addressTypeId=proxy_type,
                addressTypeName=display_name,
                countryCode=country_upper,
                inputs=inputs
            ))
    
    return CountryAddressTypesResponse(
        countryCode=country_upper,
        addressTypes=address_types
    )
