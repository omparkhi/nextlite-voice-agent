import pytest
import uuid
from starlette.testclient import TestClient
from apps.api.app.main import app
from apps.api.app.domain.tools_safety import normalize_tool_id, get_user_safe_display_id
from apps.api.app.config import settings

@pytest.fixture
def client():
    return TestClient(app)

def test_tool_name_normalization():
    assert normalize_tool_id("query_knowledge_base") == "query_knowledge_base"
    assert normalize_tool_id("Query Knowledge Base") == "query_knowledge_base"
    assert normalize_tool_id("book appointment") == "book_appointment"
    assert normalize_tool_id("book_doctor_appointment") == "book_appointment"
    assert normalize_tool_id("create callback lead") == "create_callback_lead"
    assert normalize_tool_id("lead_capture") == "create_callback_lead"

def test_uuid_suppression_rule():
    raw_uuid = str(uuid.uuid4())
    
    # Payload with raw UUID should be rejected by safe ID extractor
    unsafe_payload = {"appointmentNumber": raw_uuid, "id": raw_uuid}
    assert get_user_safe_display_id(unsafe_payload) is None

    # Payload with formatted safe ID should pass
    safe_payload = {"appointmentNumber": "APT-1042", "id": raw_uuid}
    assert get_user_safe_display_id(safe_payload) == "APT-1042"

    lead_payload = {"leadNumber": "LEAD-5001"}
    assert get_user_safe_display_id(lead_payload) == "LEAD-5001"

def test_internal_tool_execution_unauthorized(client):
    res = client.post("/api/internal/tools/execute", json={"toolName": "book_appointment"})
    assert res.status_code == 401
