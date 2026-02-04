"""
ISO 20022 XSD Schema Validation Module

Reference: Nexus specification requires strict ISO 20022 compliance

This module loads XSD schemas at startup and provides validation functions
for all Nexus message types.

Schemas loaded from: specs/iso20022/xsd/
"""

import os
from pathlib import Path
from typing import Optional, Tuple
from lxml import etree
from functools import lru_cache
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


# =============================================================================
# Schema Registry
# =============================================================================

class SchemaRegistry:
    """
    Manages ISO 20022 XSD schemas for message validation.
    
    Loads schemas at startup and caches compiled validators.
    """
    
    def __init__(self, schema_dir: Optional[str] = None):
        """
        Initialize schema registry.
        
        Args:
            schema_dir: Path to XSD schema directory. 
                       Resolution order:
                       1. Explicit schema_dir parameter
                       2. SCHEMA_DIR environment variable
                       3. /app/specs/iso20022/xsd (Docker WORKDIR)
                       4. Relative path from source file
        """
        if schema_dir is None:
            # Check environment variable first (for Docker/production)
            schema_dir = os.environ.get("SCHEMA_DIR")
            
            if schema_dir is None:
                # Try Docker WORKDIR path
                docker_path = Path("/app/specs/iso20022/xsd")
                if docker_path.exists():
                    schema_dir = docker_path
                else:
                    # Fall back to relative path from source (local development)
                    current_file = Path(__file__)
                    project_root = current_file.parent.parent.parent.parent.parent
                    schema_dir = project_root / "specs" / "iso20022" / "xsd"
        
        self.schema_dir = Path(schema_dir)
        self._schemas: dict[str, etree.XMLSchema] = {}
        self._load_errors: dict[str, str] = {}
        
        # Load all available schemas
        self._load_schemas()
    
    def _load_schemas(self):
        """Load all XSD schemas from the schema directory."""
        if not self.schema_dir.exists():
            logger.warning(f"Schema directory not found: {self.schema_dir}")
            return
        
        schema_files = {
            # Release 1 - Mandatory
            "pacs.008": "pacs.008.001.13.xsd",
            "pacs.002": "pacs.002.001.15.xsd",
            "acmt.023": "acmt.023.001.04.xsd",
            "acmt.024": "acmt.024.001.04.xsd",
            "camt.054": "camt.054.001.13.xsd",
            # Optional - SAP Integration
            "camt.103": "camt.103.001.03.xsd",
            "pain.001": "pain.001.001.12.xsd",
            # Future/Roadmap
            "pacs.004": "pacs.004.001.14.xsd",
            "pacs.028": "pacs.028.001.06.xsd",  # May not exist - will log warning
            "camt.056": "camt.056.001.11.xsd",
            "camt.029": "camt.029.001.13.xsd",
        }
        
        for msg_type, filename in schema_files.items():
            schema_path = self.schema_dir / filename
            if schema_path.exists():
                try:
                    schema_doc = etree.parse(str(schema_path))
                    self._schemas[msg_type] = etree.XMLSchema(schema_doc)
                    logger.info(f"Loaded schema: {msg_type} from {filename}")
                except Exception as e:
                    self._load_errors[msg_type] = str(e)
                    logger.error(f"Failed to load schema {msg_type}: {e}")
            else:
                self._load_errors[msg_type] = f"File not found: {schema_path}"
                logger.warning(f"Schema not found: {schema_path}")
    
    def get_schema(self, msg_type: str) -> Optional[etree.XMLSchema]:
        """Get compiled XML schema for a message type."""
        return self._schemas.get(msg_type)
    
    def is_loaded(self, msg_type: str) -> bool:
        """Check if a schema is loaded."""
        return msg_type in self._schemas
    
    def get_loaded_schemas(self) -> list[str]:
        """Get list of loaded schema types."""
        return list(self._schemas.keys())
    
    def get_load_errors(self) -> dict[str, str]:
        """Get any errors that occurred during schema loading."""
        return self._load_errors.copy()


# =============================================================================
# Global Schema Registry Instance
# =============================================================================

# Lazy initialization to avoid import-time errors
_registry: Optional[SchemaRegistry] = None


def get_registry() -> SchemaRegistry:
    """Get or create the global schema registry."""
    global _registry
    if _registry is None:
        _registry = SchemaRegistry()
    return _registry


# =============================================================================
# Validation Functions
# =============================================================================

class ValidationResult:
    """Result of XSD schema validation."""
    
    def __init__(
        self,
        valid: bool,
        message_type: str,
        errors: Optional[list[str]] = None,
        warnings: Optional[list[str]] = None
    ):
        self.valid = valid
        self.message_type = message_type
        self.errors = errors or []
        self.warnings = warnings or []
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API responses."""
        return {
            "valid": self.valid,
            "messageType": self.message_type,
            "errors": self.errors,
            "warnings": self.warnings,
        }


def validate_xml(xml_content: str | bytes, msg_type: str) -> ValidationResult:
    """
    Validate XML content against XSD schema.
    
    Args:
        xml_content: XML string or bytes
        msg_type: Message type (e.g., "pacs.008", "acmt.023")
    
    Returns:
        ValidationResult with validation status and any errors
    """
    registry = get_registry()
    
    # Check if schema is loaded
    if not registry.is_loaded(msg_type):
        return ValidationResult(
            valid=False,
            message_type=msg_type,
            errors=[f"Schema not loaded for {msg_type}"],
            warnings=[f"Schema load error: {registry.get_load_errors().get(msg_type, 'Unknown')}"]
        )
    
    schema = registry.get_schema(msg_type)
    
    # Parse XML
    try:
        if isinstance(xml_content, str):
            xml_content = xml_content.encode('utf-8')
        
        doc = etree.fromstring(xml_content)
    except etree.XMLSyntaxError as e:
        return ValidationResult(
            valid=False,
            message_type=msg_type,
            errors=[f"XML syntax error: {str(e)}"]
        )
    
    # Validate against schema
    is_valid = schema.validate(doc)
    
    if is_valid:
        return ValidationResult(
            valid=True,
            message_type=msg_type
        )
    else:
        # Extract validation errors
        errors = [str(error) for error in schema.error_log]
        return ValidationResult(
            valid=False,
            message_type=msg_type,
            errors=errors[:10]  # Limit to first 10 errors
        )


def validate_pacs008(xml_content: str | bytes) -> ValidationResult:
    """Validate pacs.008 (FI To FI Customer Credit Transfer)."""
    return validate_xml(xml_content, "pacs.008")


def validate_pacs002(xml_content: str | bytes) -> ValidationResult:
    """Validate pacs.002 (Payment Status Report)."""
    return validate_xml(xml_content, "pacs.002")


def validate_pacs004(xml_content: str | bytes) -> ValidationResult:
    """Validate pacs.004 (Payment Return)."""
    return validate_xml(xml_content, "pacs.004")


def validate_acmt023(xml_content: str | bytes) -> ValidationResult:
    """Validate acmt.023 (Identification Verification Request)."""
    return validate_xml(xml_content, "acmt.023")


def validate_acmt024(xml_content: str | bytes) -> ValidationResult:
    """Validate acmt.024 (Identification Verification Response)."""
    return validate_xml(xml_content, "acmt.024")


def validate_camt054(xml_content: str | bytes) -> ValidationResult:
    """Validate camt.054 (Bank To Customer Debit/Credit Notification)."""
    return validate_xml(xml_content, "camt.054")


# Optional - SAP Integration
def validate_camt103(xml_content: str | bytes) -> ValidationResult:
    """Validate camt.103 (Create Reservation - SAP Method 2a)."""
    return validate_xml(xml_content, "camt.103")


def validate_pain001(xml_content: str | bytes) -> ValidationResult:
    """Validate pain.001 (Customer Credit Transfer Initiation - SAP Method 3)."""
    return validate_xml(xml_content, "pain.001")


# Future/Roadmap
def validate_pacs028(xml_content: str | bytes) -> ValidationResult:
    """Validate pacs.028 (FI to FI Payment Status Request)."""
    return validate_xml(xml_content, "pacs.028")


def validate_camt056(xml_content: str | bytes) -> ValidationResult:
    """Validate camt.056 (FI to FI Payment Cancellation Request - Recall)."""
    return validate_xml(xml_content, "camt.056")


def validate_camt029(xml_content: str | bytes) -> ValidationResult:
    """Validate camt.029 (Resolution of Investigation - Recall Response)."""
    return validate_xml(xml_content, "camt.029")


# =============================================================================
# Namespace Detection
# =============================================================================

def detect_message_type(xml_content: str | bytes) -> Optional[str]:
    """
    Detect ISO 20022 message type from XML content.
    
    Examines the namespace to determine the message type.
    """
    try:
        if isinstance(xml_content, str):
            xml_content = xml_content.encode('utf-8')
        
        # Parse just the root element for namespace
        doc = etree.fromstring(xml_content)
        
        # Check namespace
        ns = doc.nsmap.get(None) or doc.nsmap.get('doc', '')
        
        # Map namespace to message type - All 11 Nexus message types
        namespace_map = {
            # Release 1 - Mandatory
            'pacs.008': 'pacs.008',
            'pacs.002': 'pacs.002',
            'acmt.023': 'acmt.023',
            'acmt.024': 'acmt.024',
            'camt.054': 'camt.054',
            # Optional - SAP Integration
            'camt.103': 'camt.103',
            'pain.001': 'pain.001',
            # Future/Roadmap
            'pacs.004': 'pacs.004',
            'pacs.028': 'pacs.028',
            'camt.056': 'camt.056',
            'camt.029': 'camt.029',
        }
        
        for key, msg_type in namespace_map.items():
            if key in ns:
                return msg_type
        
        # Try to detect from root element name
        root_tag = etree.QName(doc.tag).localname
        if root_tag == 'Document':
            # Check first child
            for child in doc:
                child_name = etree.QName(child.tag).localname
                if 'FIToFICstmrCdtTrf' in child_name:
                    return 'pacs.008'
                elif 'FIToFIPmtStsRpt' in child_name:
                    return 'pacs.002'
                elif 'IdVrfctnReq' in child_name:
                    return 'acmt.023'
                elif 'IdVrfctnRpt' in child_name:
                    return 'acmt.024'
                elif 'BkToCstmrDbtCdtNtfctn' in child_name:
                    return 'camt.054'
                # SAP Integration messages
                elif 'CretRsvatn' in child_name:
                    return 'camt.103'
                elif 'CstmrCdtTrfInitn' in child_name:
                    return 'pain.001'
                # Future/Roadmap messages
                elif 'PmtRtr' in child_name:
                    return 'pacs.004'
                elif 'FIToFIPmtStsReq' in child_name:
                    return 'pacs.028'
                elif 'FIToFIPmtCxlReq' in child_name:
                    return 'camt.056'
                elif 'RsltnOfInvstgtn' in child_name:
                    return 'camt.029'
        
        return None
        
    except Exception:
        return None


# =============================================================================
# Health Check
# =============================================================================

def get_validation_health() -> dict:
    """Get health status of schema validation system."""
    registry = get_registry()
    
    loaded = registry.get_loaded_schemas()
    errors = registry.get_load_errors()
    
    return {
        "status": "healthy" if len(loaded) > 0 else "degraded",
        "schemasLoaded": loaded,
        "schemasTotal": len(loaded),
        "schemaLoadErrors": errors,
        "schemaDirectory": str(registry.schema_dir),
    }


def safe_extract_uetr(xml_content: str | bytes) -> Optional[str]:
    """
    Safely extract UETR from ISO 20022 XML without strict parsing or schemas.
    
    Tries regex first for performance and robustness against invalid XML,
    then falls back to a namespace-agnostic XPath.
    """
    if isinstance(xml_content, bytes):
        try:
            xml_content = xml_content.decode('utf-8')
        except:
            return None

    try:
        # Try simple regex first (handles partial/invalid XML better)
        # Looks for <UETR>uuid</UETR> or <OrgnlUETR>uuid</OrgnlUETR>
        match = re.search(r"<(?:Orgnl)?UETR[^>]*>([a-f0-9\-]{36})</(?:Orgnl)?UETR>", xml_content, re.IGNORECASE)
        if match:
            return match.group(1)
        
        # Fallback to lxml without validation
        root = etree.fromstring(xml_content.encode('utf-8'))
        uetr_elements = root.xpath("//*[local-name()='UETR' or local-name()='OrgnlUETR']")
        if uetr_elements and uetr_elements[0].text:
            return uetr_elements[0].text
    except:
        pass
    return None
