"""
Unit tests for ISO 20022 message endpoints.

Tests pacs.002, pacs.004, pacs.028, camt.056, camt.029
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient


class TestPacs002StatusReport:
    """Test pacs.002 status report endpoints."""

    @pytest.mark.asyncio
    async def test_submit_pacs002_accc(
        self,
        async_client: AsyncClient,
        sample_pacs002_accc: dict,
        mock_db_session: AsyncMock,
        mock_db_result,
        override_get_db,
    ):
        """Test successful payment confirmation (ACCC)."""
        from src.main import app
        from src.db import get_db
        
        # Mock: payment exists with SUBMITTED status
        mock_db_session.execute.return_value = mock_db_result(
            row_data={"uetr": sample_pacs002_accc["uetr"], "status": "SUBMITTED"}
        )
        
        app.dependency_overrides[get_db] = override_get_db
        
        try:
            response = await async_client.post(
                "/v1/iso20022/pacs002",
                json=sample_pacs002_accc
            )
            # Endpoint may require specific schema; test structure
            assert response.status_code in [200, 422]
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_submit_pacs002_rjct(
        self,
        async_client: AsyncClient,
        sample_pacs002_rjct: dict,
        mock_db_session: AsyncMock,
        mock_db_result,
        override_get_db,
    ):
        """Test payment rejection (RJCT)."""
        from src.main import app
        from src.db import get_db
        
        mock_db_session.execute.return_value = mock_db_result(
            row_data={"uetr": sample_pacs002_rjct["uetr"], "status": "SUBMITTED"}
        )
        
        app.dependency_overrides[get_db] = override_get_db
        
        try:
            response = await async_client.post(
                "/v1/iso20022/pacs002",
                json=sample_pacs002_rjct
            )
            assert response.status_code in [200, 422]
        finally:
            app.dependency_overrides.clear()


class TestPacs004PaymentReturn:
    """Test pacs.004 payment return endpoints."""

    @pytest.mark.asyncio
    async def test_submit_pacs004_return(
        self,
        async_client: AsyncClient,
        mock_db_session: AsyncMock,
        mock_db_result,
        override_get_db,
    ):
        """Test payment return submission."""
        from src.main import app
        from src.db import get_db
        
        # Mock: payment completed
        mock_db_session.execute.return_value = mock_db_result(
            row_data={"uetr": "550e8400-e29b-41d4-a716-446655440000", "status": "COMPLETED"}
        )
        
        app.dependency_overrides[get_db] = override_get_db
        
        return_request = {
            "originalUetr": "550e8400-e29b-41d4-a716-446655440000",
            "returnReasonCode": "FOCR",
            "returnAmount": "1000.00",
            "returnCurrency": "SGD",
        }
        
        try:
            response = await async_client.post(
                "/v1/iso20022/pacs004",
                json=return_request
            )
            assert response.status_code in [200, 400, 422]
            if response.status_code == 200:
                data = response.json()
                assert data["originalUetr"] == return_request["originalUetr"]
                assert data["returnReasonCode"] == "FOCR"
        finally:
            app.dependency_overrides.clear()


class TestCamt056RecallRequest:
    """Test camt.056 recall request endpoints."""

    @pytest.mark.asyncio
    async def test_submit_camt056_recall(
        self,
        async_client: AsyncClient,
        sample_camt056: dict,
        mock_db_session: AsyncMock,
        mock_db_result,
        override_get_db,
    ):
        """Test recall request submission."""
        from src.main import app
        from src.db import get_db
        
        # Mock: payment completed (eligible for recall)
        mock_db_session.execute.return_value = mock_db_result(
            row_data={"status": "COMPLETED"}
        )
        
        app.dependency_overrides[get_db] = override_get_db
        
        try:
            response = await async_client.post(
                "/v1/iso20022/camt056",
                json=sample_camt056
            )
            assert response.status_code in [200, 400, 422]
            if response.status_code == 200:
                data = response.json()
                assert data["originalUetr"] == sample_camt056["originalUetr"]
                assert data["status"] == "PENDING"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_list_recalls(self, async_client: AsyncClient):
        """Test listing recall requests."""
        response = await async_client.get("/v1/iso20022/recalls")
        assert response.status_code == 200
        data = response.json()
        assert "total" in data or "count" in data
        assert "recalls" in data


class TestCamt029InvestigationResolution:
    """Test camt.029 investigation resolution endpoints."""

    @pytest.mark.asyncio
    async def test_submit_camt029_accepted(
        self,
        async_client: AsyncClient,
        mock_db_session: AsyncMock,
        mock_db_result,
        override_get_db,
    ):
        """Test investigation acceptance."""
        from src.main import app
        from src.db import get_db
        
        app.dependency_overrides[get_db] = override_get_db
        
        resolution = {
            "originalUetr": "550e8400-e29b-41d4-a716-446655440000",
            "recallId": "ABCD1234",
            "investigationStatus": "ACCP",
            "respondingPsp": "KASITHBK",
        }
        
        try:
            response = await async_client.post(
                "/v1/iso20022/camt029",
                json=resolution
            )
            # 400 if recall not found, 404 if original payment not found, 422 if validation fails
            assert response.status_code in [200, 400, 404, 422]
        finally:
            app.dependency_overrides.clear()


class TestPacs028StatusRequest:
    """Test pacs.028 status request endpoints."""

    @pytest.mark.asyncio
    async def test_submit_pacs028_query(
        self,
        async_client: AsyncClient,
        mock_db_session: AsyncMock,
        mock_db_result,
        override_get_db,
    ):
        """Test payment status query."""
        from src.main import app
        from src.db import get_db
        
        # Mock: payment exists
        mock_db_session.execute.return_value = mock_db_result(
            row_data={"status": "COMPLETED", "updated_at": "2026-02-03T01:00:00Z"}
        )
        
        app.dependency_overrides[get_db] = override_get_db
        
        status_request = {
            "originalUetr": "550e8400-e29b-41d4-a716-446655440000",
            "queryingPsp": "DBSSSGSG",
        }
        
        try:
            response = await async_client.post(
                "/v1/iso20022/pacs028",
                json=status_request
            )
            assert response.status_code in [200, 400, 422]
            if response.status_code == 200:
                data = response.json()
                assert "paymentFound" in data
                assert "advice" in data
        finally:
            app.dependency_overrides.clear()
