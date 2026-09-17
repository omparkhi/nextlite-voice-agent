import re
import base64
import httpx
from typing import Optional, Dict, Any
from ..config import settings
from ..logging import logger

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

    @staticmethod
    async def create_outbound_phone_call(to_phone_number: str, answer_url: str) -> Dict[str, Any]:
        """
        Calls Plivo REST API to place an outbound phone call and connect it to the answer XML endpoint.
        """
        if not settings.PLIVO_AUTH_ID or not settings.PLIVO_AUTH_TOKEN:
            logger.warning("Plivo credentials not configured, returning mock call response")
            return {
                "message": "call fired (mock)",
                "request_uuid": f"mock-plivo-{re.sub(r'[^a-zA-Z0-9]', '', to_phone_number)[-6:]}",
                "api_id": "mock-api-id"
            }

        caller_id = settings.PLIVO_CALLER_ID
        if not caller_id:
            logger.error("[TelephonyService] PLIVO_CALLER_ID is not configured in environment")
            return {"error": "PLIVO_CALLER_ID is required for outbound calls"}
        url = f"https://api.plivo.com/v1/Account/{settings.PLIVO_AUTH_ID}/Call/"
        auth_bytes = f"{settings.PLIVO_AUTH_ID}:{settings.PLIVO_AUTH_TOKEN}".encode("utf-8")
        auth_header = f"Basic {base64.b64encode(auth_bytes).decode('utf-8')}"

        payload = {
            "from": caller_id,
            "to": to_phone_number,
            "answer_url": answer_url,
            "answer_method": "GET"
        }

        logger.info(f"[TelephonyService] Calling Plivo to dial {to_phone_number} with answer URL: {answer_url}")
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={
                    "Authorization": auth_header,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            )
            if resp.status_code not in (200, 201, 202):
                logger.error(f"[TelephonyService] Plivo call creation failed: {resp.status_code} - {resp.text}")
                raise RuntimeError(f"Plivo error ({resp.status_code}): {resp.text}")
            
            data = resp.json()
            logger.info(f"[TelephonyService] Plivo call initiated successfully: {data}")
            return data
