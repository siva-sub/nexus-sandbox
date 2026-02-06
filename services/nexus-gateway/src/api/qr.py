"""
EMVCo QR Code Parsing and Generation API

Reference: EMV QRCPS Merchant-Presented Mode
Supports: PayNow (SG), PromptPay (TH), QRPh (PH), DuitNow (MY)

TLV Structure:
- Tag: 2 digits (ID)
- Length: 2 digits (length of value)
- Value: variable length data

Key Tags:
- 00: Payload Format Indicator (always "01")
- 01: Point of Initiation (11=Static, 12=Dynamic)
- 26-51: Merchant Account Information (scheme-specific)
- 52: Merchant Category Code
- 53: Transaction Currency (ISO 4217 numeric)
- 54: Transaction Amount
- 58: Country Code
- 59: Merchant Name
- 60: Merchant City
- 62: Additional Data Template
- 63: CRC (CCITT-16)
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
from decimal import Decimal

router = APIRouter(prefix="/v1/qr", tags=["QR Codes"])


# =============================================================================
# Pydantic Models
# =============================================================================

from .schemas import (
    QRParseRequest,
    MerchantAccountInfo,
    QRParseResponse,
    QRGenerateRequest,
    QRGenerateResponse,
    QRValidateRequest,
    QRValidateResponse,
    UPIQRData,
    UPIParseRequest,
    UPIParseResponse,
    UPIToEMVCoRequest,
    UPIToEMVCoResponse,
    EMVCoToUPIRequest,
    EMVCoToUPIResponse
)


# =============================================================================
# CRC-16 CCITT Implementation
# =============================================================================

def crc16_ccitt(data: str) -> str:
    """
    Calculate CRC-16 CCITT checksum.
    
    Polynomial: 0x1021
    Initial value: 0xFFFF
    """
    crc = 0xFFFF
    polynomial = 0x1021
    
    for char in data:
        crc ^= ord(char) << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ polynomial
            else:
                crc <<= 1
            crc &= 0xFFFF
    
    return f"{crc:04X}"


def verify_crc(qr_data: str) -> bool:
    """Verify CRC of QR data."""
    if len(qr_data) < 8:
        return False
    
    # CRC is the last 4 characters (Tag 63, Length 04, Value XXXX = 6304XXXX)
    data_without_crc = qr_data[:-4]
    expected_crc = qr_data[-4:].upper()
    
    calculated_crc = crc16_ccitt(data_without_crc)
    return calculated_crc == expected_crc


# =============================================================================
# TLV Parser
# =============================================================================

def parse_tlv(data: str) -> dict:
    """
    Parse TLV (Tag-Length-Value) data.
    
    Returns dict of {tag_id: value}
    """
    tags = {}
    pos = 0
    
    while pos + 4 <= len(data):
        tag_id = data[pos:pos+2]
        try:
            length = int(data[pos+2:pos+4])
        except ValueError:
            break
        
        value_start = pos + 4
        value_end = value_start + length
        
        if value_end > len(data):
            break
        
        value = data[value_start:value_end]
        tags[tag_id] = value
        pos = value_end
    
    return tags


def parse_subtags(data: str) -> dict:
    """Parse nested TLV structure for merchant account info."""
    return parse_tlv(data)


# =============================================================================
# Scheme Detection and Proxy Extraction
# =============================================================================

# Scheme identifiers in merchant account info (Tag 26-51)
SCHEME_IDENTIFIERS = {
    "SG.PAYNOW": ("PAYNOW", "SG"),
    "A000000677010111": ("PROMPTPAY", "TH"),  # PromptPay AID
    "A000000677010112": ("PROMPTPAY", "TH"),
    "PH.PPMI": ("QRPH", "PH"),
    "MY.DUITNOW": ("DUITNOW", "MY"),
    "com.p2pqrpay": ("QRPH", "PH"),
    # India - NPCI UPI / BharatQR
    "com.npci.ok": ("UPI", "IN"),  # NPCI UPI identifier
    "A000000524": ("UPI", "IN"),   # RuPay AID
    "IN.NPCI": ("UPI", "IN"),
}

# Currency code mapping (ISO 4217 numeric to alpha)
CURRENCY_CODES = {
    "702": "SGD",
    "764": "THB",
    "458": "MYR",
    "608": "PHP",
    "360": "IDR",
    "356": "INR",
    "840": "USD",
}

# Nexus proxy type mapping
PROXY_TYPE_MAPPING = {
    "0": "MBNO",     # Mobile/Phone
    "1": "MBNO",     # Mobile
    "2": "UEN",      # UEN (SG)
    "3": "NIDN",     # NRIC/National ID
}


def detect_scheme(tags: dict) -> tuple[str, Optional[dict]]:
    """
    Detect payment scheme from merchant account info tags (26-51).
    
    Returns (scheme_name, parsed_account_info)
    """
    # Check tags 26-51 for merchant account information
    for tag_id in range(26, 52):
        tag_key = f"{tag_id:02d}"
        if tag_key in tags:
            subtags = parse_subtags(tags[tag_key])
            
            # Tag 00 within merchant account is the scheme identifier
            if "00" in subtags:
                scheme_id = subtags["00"]
                for identifier, (scheme, country) in SCHEME_IDENTIFIERS.items():
                    if identifier in scheme_id:
                        return scheme, subtags
            
            # Check for known scheme patterns
            raw_value = tags[tag_key]
            for identifier, (scheme, country) in SCHEME_IDENTIFIERS.items():
                if identifier in raw_value:
                    return scheme, subtags
    
    return "UNKNOWN", None


def extract_proxy_info(scheme: str, account_info: dict) -> tuple[Optional[str], Optional[str]]:
    """
    Extract proxy type and value from parsed account info.
    
    Returns (proxy_type, proxy_value)
    """
    if not account_info:
        return None, None
    
    # Common patterns:
    # Tag 01: Proxy type indicator (0=mobile, 2=UEN, etc.)
    # Tag 02: Proxy value
    proxy_type = None
    proxy_value = None
    
    # PayNow format
    if scheme == "PAYNOW":
        type_code = account_info.get("01", "0")
        proxy_type = PROXY_TYPE_MAPPING.get(type_code, "MBNO")
        proxy_value = account_info.get("02")
    
    # PromptPay format
    elif scheme == "PROMPTPAY":
        # PromptPay uses mobile or national ID
        proxy_value = account_info.get("01") or account_info.get("02")
        if proxy_value:
            if proxy_value.startswith("0") or proxy_value.startswith("66"):
                proxy_type = "MBNO"
            elif len(proxy_value) == 13:
                proxy_type = "NIDN"
            else:
                proxy_type = "MBNO"
    
    # QRPh format
    elif scheme == "QRPH":
        proxy_value = account_info.get("02") or account_info.get("01")
        proxy_type = "MBNO"  # Default to mobile
    
    # DuitNow format
    elif scheme == "DUITNOW":
        proxy_value = account_info.get("02") or account_info.get("01")
        type_indicator = account_info.get("01", "")
        if type_indicator.isdigit() and len(type_indicator) == 1:
            proxy_type = PROXY_TYPE_MAPPING.get(type_indicator, "MBNO")
            proxy_value = account_info.get("02")
        else:
            proxy_type = "MBNO"
    
    return proxy_type, proxy_value


# =============================================================================
# API Endpoints
# =============================================================================

@router.post(
    "/parse",
    response_model=QRParseResponse,
    summary="Parse EMVCo QR code",
    description="""
    Parse an EMVCo-compliant QR code string into structured data.
    
    Supports:
    - PayNow (Singapore)
    - PromptPay (Thailand)
    - QRPh (Philippines)
    - DuitNow (Malaysia)
    
    The response includes:
    - Merchant account information (scheme, proxy type/value)
    - Transaction details (amount, currency)
    - CRC validation result
    - Raw tags for debugging
    """
)
async def parse_qr(request: QRParseRequest) -> QRParseResponse:
    """Parse EMVCo QR code string."""
    qr_data = request.qrData.strip()
    
    if len(qr_data) < 20:
        raise HTTPException(
            status_code=400,
            detail="Invalid QR data: too short"
        )
    
    # Verify CRC
    crc_valid = verify_crc(qr_data)
    
    # Parse TLV structure
    tags = parse_tlv(qr_data)
    
    # Validate format indicator (must be "01")
    format_indicator = tags.get("00", "")
    if format_indicator != "01":
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format indicator: expected '01', got '{format_indicator}'"
        )
    
    # Point of initiation (11=Static, 12=Dynamic)
    poi = tags.get("01", "11")
    initiation_type = "DYNAMIC" if poi == "12" else "STATIC"
    
    # Detect scheme and extract account info
    scheme, account_info = detect_scheme(tags)
    proxy_type, proxy_value = extract_proxy_info(scheme, account_info)
    
    # Parse currency
    currency_code = tags.get("53", "")
    currency_alpha = CURRENCY_CODES.get(currency_code, currency_code)
    
    # Parse amount
    amount = tags.get("54")
    
    # Editable if dynamic QR or no amount specified
    editable = poi == "12" or amount is None
    
    # Additional data (Tag 62)
    additional_data = None
    if "62" in tags:
        additional_data = parse_subtags(tags["62"])
    
    # Extract CRC value
    crc_value = qr_data[-4:] if len(qr_data) >= 4 else ""
    
    return QRParseResponse(
        formatIndicator=format_indicator,
        initiationType=initiation_type,
        merchantAccountInfo=MerchantAccountInfo(
            scheme=scheme,
            proxyType=proxy_type,
            proxyValue=proxy_value,
            editable=editable
        ),
        merchantCategoryCode=tags.get("52"),
        transactionCurrency=currency_alpha,
        transactionCurrencyCode=currency_code,
        transactionAmount=amount,
        countryCode=tags.get("58"),
        merchantName=tags.get("59"),
        merchantCity=tags.get("60"),
        additionalData=additional_data,
        crc=crc_value,
        crcValid=crc_valid,
        rawTags=tags
    )


@router.post(
    "/generate",
    response_model=QRGenerateResponse,
    summary="Generate EMVCo QR code",
    description="""
    Generate an EMVCo-compliant QR code string for payment.
    
    Supports:
    - PayNow (Singapore): MOBILE, UEN, NRIC
    - PromptPay (Thailand): MOBILE, NATIONAL_ID
    - QRPh (Philippines): MOBILE, ACCOUNT
    - DuitNow (Malaysia): MOBILE, NRIC
    """
)
async def generate_qr(request: QRGenerateRequest) -> QRGenerateResponse:
    """Generate EMVCo QR code string."""
    
    def tag(id: str, value: str) -> str:
        """Create TLV tag."""
        return f"{id}{len(value):02d}{value}"
    
    parts = []
    
    # Tag 00: Payload Format Indicator
    parts.append(tag("00", "01"))
    
    # Tag 01: Point of Initiation Method (11=Static, 12=Dynamic)
    poi = "12" if request.editable else "11"
    parts.append(tag("01", poi))
    
    # Tag 26-51: Merchant Account Information (scheme-specific)
    scheme = request.scheme.upper()
    
    if scheme == "PAYNOW":
        # PayNow format (Tag 26)
        proxy_type_code = "0"  # Default to mobile
        if request.proxyType.upper() == "UEN":
            proxy_type_code = "2"
        elif request.proxyType.upper() == "NRIC":
            proxy_type_code = "3"
        
        account_info = tag("00", "SG.PAYNOW")
        account_info += tag("01", proxy_type_code)
        account_info += tag("02", request.proxyValue)
        if request.editable:
            account_info += tag("03", "1")  # Editable flag
        
        parts.append(tag("26", account_info))
    
    elif scheme == "PROMPTPAY":
        # PromptPay format (Tag 29)
        account_info = tag("00", "A000000677010111")
        account_info += tag("01", request.proxyValue)
        parts.append(tag("29", account_info))
    
    elif scheme == "QRPH":
        # QRPh format (Tag 27)
        account_info = tag("00", "PH.PPMI")
        account_info += tag("02", request.proxyValue)
        parts.append(tag("27", account_info))
    
    elif scheme == "DUITNOW":
        # DuitNow format (Tag 26)
        proxy_type_code = "0"  # Default to mobile
        if request.proxyType.upper() == "NRIC":
            proxy_type_code = "3"
        
        account_info = tag("00", "MY.DUITNOW")
        account_info += tag("01", proxy_type_code)
        account_info += tag("02", request.proxyValue)
        parts.append(tag("26", account_info))
    
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported scheme: {scheme}. Valid: PAYNOW, PROMPTPAY, QRPH, DUITNOW"
        )
    
    # Tag 52: Merchant Category Code (default to 0000)
    parts.append(tag("52", "0000"))
    
    # Tag 53: Transaction Currency
    currency_map = {
        "PAYNOW": "702",      # SGD
        "PROMPTPAY": "764",   # THB
        "QRPH": "608",        # PHP
        "DUITNOW": "458",     # MYR
    }
    parts.append(tag("53", currency_map.get(scheme, "702")))
    
    # Tag 54: Transaction Amount (if provided)
    if request.amount is not None:
        amount_str = f"{request.amount:.2f}"
        parts.append(tag("54", amount_str))
    
    # Tag 58: Country Code
    country_map = {
        "PAYNOW": "SG",
        "PROMPTPAY": "TH",
        "QRPH": "PH",
        "DUITNOW": "MY",
    }
    parts.append(tag("58", country_map.get(scheme, "SG")))
    
    # Tag 59: Merchant Name
    name = request.merchantName or "PAYMENT"
    parts.append(tag("59", name[:25]))  # Max 25 chars
    
    # Tag 60: Merchant City
    city = request.merchantCity or country_map.get(scheme, "SINGAPORE")
    parts.append(tag("60", city[:15]))  # Max 15 chars
    
    # Tag 62: Additional Data (if reference provided)
    if request.reference:
        additional = tag("05", request.reference[:25])  # Reference label
        parts.append(tag("62", additional))
    
    # Tag 63: CRC (placeholder, then calculate)
    data_without_crc = "".join(parts) + "6304"
    crc = crc16_ccitt(data_without_crc)
    
    qr_data = data_without_crc + crc
    
    return QRGenerateResponse(
        qrData=qr_data,
        scheme=scheme
    )


@router.post(
    "/validate",
    response_model=QRValidateResponse,
    summary="Validate EMVCo QR code",
    description="Validate the structure and CRC of an EMVCo QR code string."
)
async def validate_qr(request: QRValidateRequest) -> QRValidateResponse:
    """Validate EMVCo QR code string."""
    qr_data = request.qrData.strip()
    errors = []
    
    # Check minimum length
    if len(qr_data) < 20:
        errors.append("QR data too short (minimum 20 characters)")
    
    # Verify CRC
    crc_valid = verify_crc(qr_data) if len(qr_data) >= 8 else False
    if not crc_valid:
        errors.append("CRC checksum is invalid")
    
    # Parse and validate structure
    format_valid = False
    try:
        tags = parse_tlv(qr_data)
        
        # Check format indicator
        if tags.get("00") != "01":
            errors.append("Invalid format indicator (expected '01')")
        else:
            format_valid = True
        
        # Check for required tags
        if "01" not in tags:
            errors.append("Missing point of initiation method (Tag 01)")
        
        if "53" not in tags:
            errors.append("Missing transaction currency (Tag 53)")
        
        if "58" not in tags:
            errors.append("Missing country code (Tag 58)")
        
        if "59" not in tags:
            errors.append("Missing merchant name (Tag 59)")
        
        if "60" not in tags:
            errors.append("Missing merchant city (Tag 60)")
        
        # Check for at least one merchant account info tag
        has_merchant_info = any(f"{i:02d}" in tags for i in range(26, 52))
        if not has_merchant_info:
            errors.append("Missing merchant account information (Tags 26-51)")
    
    except Exception as e:
        errors.append(f"Failed to parse TLV structure: {str(e)}")
    
    return QRValidateResponse(
        valid=len(errors) == 0,
        crcValid=crc_valid,
        formatValid=format_valid,
        errors=errors
    )


# =============================================================================
# UPI QR Parser and Converter (NPCI India - BharatQR)
# =============================================================================

def parse_upi_uri(uri: str) -> Optional[UPIQRData]:
    """
    Parse a UPI QR URI string.
    
    Format: upi://pay?pa=<VPA>&pn=<Name>&am=<Amount>&cu=INR&tr=<RefID>&tn=<Note>
    
    Returns UPIQRData if valid, None otherwise.
    """
    from urllib.parse import urlparse, parse_qs, unquote
    
    if not uri.lower().startswith("upi://pay"):
        return None
    
    try:
        # Parse the URI
        parsed = urlparse(uri)
        params = parse_qs(parsed.query)
        
        # Extract VPA (required)
        pa = params.get("pa", [None])[0]
        if not pa:
            return None
        
        return UPIQRData(
            pa=unquote(pa),
            pn=unquote(params.get("pn", [None])[0] or ""),
            am=params.get("am", [None])[0],
            cu=params.get("cu", ["INR"])[0],
            tr=params.get("tr", [None])[0],
            tn=params.get("tn", [None])[0],
            mc=params.get("mc", [None])[0],
            mid=params.get("mid", [None])[0],
            url=params.get("url", [None])[0],
            mode=params.get("mode", [None])[0],
        )
    except Exception:
        return None


@router.post(
    "/upi/parse",
    response_model=UPIParseResponse,
    summary="Parse UPI QR URI",
    description="""
    Parse a UPI QR code URI into structured data.
    
    Format: `upi://pay?pa=merchant@bank&pn=Merchant Name&am=100&cu=INR`
    
    Parameters:
    - `pa`: Payee VPA (required)
    - `pn`: Payee Name
    - `am`: Amount
    - `cu`: Currency (default: INR)
    - `tr`: Transaction Reference ID
    - `tn`: Transaction Note
    - `mc`: Merchant Category Code
    """
)
async def parse_upi(request: UPIParseRequest) -> UPIParseResponse:
    """Parse UPI QR URI string."""
    data = parse_upi_uri(request.upiUri.strip())
    
    if not data:
        return UPIParseResponse(
            valid=False,
            error="Invalid UPI URI format. Expected: upi://pay?pa=VPA&pn=Name..."
        )
    
    return UPIParseResponse(valid=True, data=data)


@router.post(
    "/upi/to-emvco",
    response_model=UPIToEMVCoResponse,
    summary="Convert UPI to EMVCo/BharatQR",
    description="""
    Convert a UPI QR URI to EMVCo/BharatQR TLV format.
    
    This enables interoperability with Visa, Mastercard, and RuPay terminals
    that use the global EMVCo standard.
    
    Maps:
    - `pa` (VPA) → Tag 26 Merchant Account Info (NPCI)
    - `am` → Tag 54 Amount
    - `pn` → Tag 59 Merchant Name
    - `mc` → Tag 52 Merchant Category Code
    """
)
async def upi_to_emvco(request: UPIToEMVCoRequest) -> UPIToEMVCoResponse:
    """Convert UPI URI to EMVCo/BharatQR format."""
    upi_data = parse_upi_uri(request.upiUri.strip())
    
    if not upi_data:
        raise HTTPException(
            status_code=400,
            detail="Invalid UPI URI format"
        )
    
    def tag(id: str, value: str) -> str:
        """Create TLV tag."""
        return f"{id}{len(value):02d}{value}"
    
    parts = []
    
    # Tag 00: Payload Format Indicator
    parts.append(tag("00", "01"))
    
    # Tag 01: Point of Initiation Method
    # 11 = Static (if amount is fixed), 12 = Dynamic
    poi = "11" if upi_data.am else "12"
    parts.append(tag("01", poi))
    
    # Tag 26: Merchant Account Information (NPCI UPI format)
    # Sub-tags: 00 = Scheme ID, 01 = VPA
    merchant_info = tag("00", "com.npci.ok")
    merchant_info += tag("01", upi_data.pa)
    if upi_data.mid:
        merchant_info += tag("02", upi_data.mid)
    parts.append(tag("26", merchant_info))
    
    # Tag 52: Merchant Category Code
    mcc = upi_data.mc or "0000"
    parts.append(tag("52", mcc[:4]))
    
    # Tag 53: Transaction Currency (356 = INR)
    parts.append(tag("53", "356"))
    
    # Tag 54: Transaction Amount (if specified)
    if upi_data.am:
        parts.append(tag("54", upi_data.am))
    
    # Tag 58: Country Code
    parts.append(tag("58", "IN"))
    
    # Tag 59: Merchant Name
    name = upi_data.pn or "MERCHANT"
    parts.append(tag("59", name[:25]))
    
    # Tag 60: Merchant City
    city = request.merchantCity or "INDIA"
    parts.append(tag("60", city[:15]))
    
    # Tag 62: Additional Data Template (if reference provided)
    if upi_data.tr or upi_data.tn:
        additional = ""
        if upi_data.tr:
            additional += tag("05", upi_data.tr[:25])  # Reference
        if upi_data.tn:
            additional += tag("08", upi_data.tn[:25])  # Purpose
        parts.append(tag("62", additional))
    
    # Tag 63: CRC
    data_without_crc = "".join(parts) + "6304"
    crc = crc16_ccitt(data_without_crc)
    
    emvco_data = data_without_crc + crc
    
    return UPIToEMVCoResponse(emvcoData=emvco_data)


@router.post(
    "/emvco/to-upi",
    response_model=EMVCoToUPIResponse,
    summary="Convert EMVCo/BharatQR to UPI",
    description="""
    Convert an EMVCo/BharatQR TLV string to UPI URI format.
    
    Extracts the VPA from Tag 26 and reconstructs the UPI deep link.
    """
)
async def emvco_to_upi(request: EMVCoToUPIRequest) -> EMVCoToUPIResponse:
    """Convert EMVCo/BharatQR to UPI URI format."""
    from urllib.parse import quote
    
    qr_data = request.emvcoData.strip()
    
    # Verify CRC
    if not verify_crc(qr_data):
        raise HTTPException(
            status_code=400,
            detail="Invalid EMVCo data: CRC checksum failed"
        )
    
    # Parse TLV structure
    tags = parse_tlv(qr_data)
    
    # Extract VPA from Tag 26 (Merchant Account Info for NPCI)
    vpa = None
    merchant_name = tags.get("59")
    amount = tags.get("54")
    
    # Check Tag 26 for NPCI UPI
    if "26" in tags:
        subtags = parse_subtags(tags["26"])
        scheme_id = subtags.get("00", "")
        
        if "npci" in scheme_id.lower() or "upi" in scheme_id.lower():
            vpa = subtags.get("01") or subtags.get("02")
    
    # Also check other merchant info tags for VPA
    if not vpa:
        for tag_id in range(26, 52):
            tag_key = f"{tag_id:02d}"
            if tag_key in tags:
                subtags = parse_subtags(tags[tag_key])
                # Look for VPA pattern (contains @)
                for sub_value in subtags.values():
                    if "@" in sub_value:
                        vpa = sub_value
                        break
                if vpa:
                    break
    
    if not vpa:
        raise HTTPException(
            status_code=400,
            detail="Could not extract VPA from EMVCo data. Tag 26 with NPCI format required."
        )
    
    # Build UPI URI
    upi_params = [f"pa={quote(vpa)}"]
    
    if merchant_name:
        upi_params.append(f"pn={quote(merchant_name)}")
    
    if amount:
        upi_params.append(f"am={amount}")
    
    upi_params.append("cu=INR")
    
    # Additional data from Tag 62
    if "62" in tags:
        additional = parse_subtags(tags["62"])
        if "05" in additional:  # Reference
            upi_params.append(f"tr={quote(additional['05'])}")
        if "08" in additional:  # Purpose
            upi_params.append(f"tn={quote(additional['08'])}")
    
    upi_uri = f"upi://pay?{'&'.join(upi_params)}"
    
    return EMVCoToUPIResponse(upiUri=upi_uri)

