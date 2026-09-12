import re
from typing import Optional, Dict, Any

class TelephonyService:
    @staticmethod
    def sanitize_e164(phone_number: Optional[str]) -> Optional[str]:
        if not phone_number or not isinstance(phone_number, str):
            return None
        cleaned = re.sub(r"[^\d+]", "", phone_number.strip())
        if not cleaned:
            return None
        if not cleaned.startswith("+"):
            cleaned = "+" + cleaned
        return cleaned

    @staticmethod
    def generate_plivo_answer_xml(websocket_url: str) -> str:
        """
        Generates standard Plivo XML to bridge inbound PSTN call directly
        to the Pipecat WebSocket media stream endpoint.
        """
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-l16;rate=8000">
        {websocket_url}
    </Stream>
</Response>"""
