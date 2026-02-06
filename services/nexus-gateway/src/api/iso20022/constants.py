"""
ISO 20022 Constants per Nexus Specification

This module contains all constant values used in ISO 20022 message processing,
including status reason codes, timing configurations, and validation patterns.

Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/key-points
"""

import re

# =============================================================================
# Timing Constants
# =============================================================================

QUOTE_EXPIRY_SECONDS = 600  # 10 minutes - FXPs must honour quotes for this duration

# =============================================================================
# UETR Patterns for Return Payments
# =============================================================================

# NexusOrgnlUETR prefix for pacs.008 return payments
# Reference: NotebookLM 2026-02-03 - "Include original UETR prefixed with NexusOrgnlUETR:"
# Made flexible to accept: NexusOrgnlUETR:uuid, NexusOrgnlUETR: uuid, NexusOrgnlUETR uuid, etc.
NEXUS_ORIGINAL_UETR_PREFIX = "NexusOrgnlUETR:"
NEXUS_ORIGINAL_UETR_PATTERN = re.compile(r"NexusOrgnlUETR[:\\s]+([a-f0-9\\-]{36})", re.IGNORECASE)

# =============================================================================
# ISO 20022 Status Reason Codes (ExternalStatusReason1Code)
# Reference: NotebookLM - Technical Assumptions A20
# Assumption A28: Sandbox implements subset of 60+ production codes
# =============================================================================

# Success
STATUS_ACCEPTED = "ACCC"            # Accepted Settlement Completed

# Quote/Rate Errors (AB04: Aborted - Settlement Fatal Error)
STATUS_QUOTE_EXPIRED = "AB04"       # Quote validity window exceeded
STATUS_RATE_MISMATCH = "AB04"       # Agreed rate doesn't match stored quote

# Timeout Errors
STATUS_TIMEOUT = "AB03"             # Transaction not received within window

# Account Errors
STATUS_ACCOUNT_INCORRECT = "AC01"   # Incorrect Account Number format
STATUS_ACCOUNT_CLOSED = "AC04"      # Closed Account Number
STATUS_PROXY_INVALID = "BE23"       # Account/Proxy Invalid (not registered)

# Agent Errors
STATUS_AGENT_INCORRECT = "AGNT"     # Incorrect Agent (PSP not onboarded)
STATUS_INVALID_SAP = "RC11"         # Invalid Intermediary Agent
STATUS_AGENT_OFFLINE = "AB08"       # Offline Creditor Agent

# Amount Errors
STATUS_AMOUNT_LIMIT = "AM02"        # IPS Limit exceeded
STATUS_INSUFFICIENT_FUNDS = "AM04"  # Insufficient Funds

# Compliance Errors
STATUS_REGULATORY_AML = "RR04"      # Regulatory/AML block

# All status codes for validation
VALID_STATUS_CODES = {
    STATUS_ACCEPTED, STATUS_QUOTE_EXPIRED, STATUS_RATE_MISMATCH,
    STATUS_TIMEOUT, STATUS_ACCOUNT_INCORRECT, STATUS_ACCOUNT_CLOSED,
    STATUS_PROXY_INVALID, STATUS_AGENT_INCORRECT, STATUS_INVALID_SAP,
    STATUS_AGENT_OFFLINE, STATUS_AMOUNT_LIMIT, STATUS_INSUFFICIENT_FUNDS,
    STATUS_REGULATORY_AML
}
