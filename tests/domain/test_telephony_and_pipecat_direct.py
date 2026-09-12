import pytest
from apps.api.app.services.telephony_service import TelephonyService

def test_telephony_e164_sanitization():
    assert TelephonyService.sanitize_e164("+91 98765-43210") == "+919876543210"
    assert TelephonyService.sanitize_e164("919876543210") == "+919876543210"
    assert TelephonyService.sanitize_e164("+1 (555) 019-2834") == "+15550192834"
    assert TelephonyService.sanitize_e164("") is None

def test_plivo_answer_xml_generation():
    ws_url = "wss://api.nextlite.dev/ws/plivo"
    xml = TelephonyService.generate_plivo_answer_xml(ws_url)
    assert "<Response>" in xml
    assert "<Stream" in xml
    assert "audio/x-l16;rate=8000" in xml
    assert ws_url in xml
