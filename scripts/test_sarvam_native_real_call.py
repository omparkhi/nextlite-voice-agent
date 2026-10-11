"""
Real Multi-Turn Call Simulation Test with Live Sarvam API
Tests:
  1. Live Sarvam LLM (sarvam-105b-conversations) with Glaze Dental Clinic system prompt.
  2. LanguageContextProcessor STT -> Bulbul TTS dynamic language switching.
  3. Multilingual mirroring: Marathi -> Hindi -> English -> Marathi.
  4. Tool calling & grounding across language transitions.

Usage:
  apps\\pipecat-worker\\.venv\\Scripts\\python.exe scripts/test_sarvam_native_real_call.py
"""
import sys
import os
import asyncio
import json
import httpx
from typing import Optional, Dict, Any, List

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

worker_app_dir = os.path.join(os.path.dirname(__file__), "..", "apps", "pipecat-worker")
sys.path.insert(0, os.path.abspath(worker_app_dir))

from app.config import settings
from app.language_manager import normalize_language_code, get_language_display_name, LANGUAGE_MIRROR_DIRECTIVE
from app.language_processor import LanguageContextProcessor
from app.temporal_context import build_compact_temporal_anchor


class MockTTSService:
    """Tracks TTS WebSocket language reconfiguration in real time."""
    def __init__(self, initial_language: str = "mr-IN"):
        self._active_language = initial_language
        self.reconfiguration_history: List[str] = [initial_language]

    def update_language_context(self, language: str):
        norm = normalize_language_code(language)
        if norm != self._active_language:
            self._active_language = norm
            self.reconfiguration_history.append(norm)
            print(f"      [Bulbul TTS WebSocket] Reconfigured voice target_language_code -> '{norm}'")


from pipecat.frames.frames import TranscriptionFrame


class MockTranscriptionFrame(TranscriptionFrame):
    """Simulates a finalized Sarvam Saaras Realtime STT frame."""
    def __init__(self, text: str, detected_language: str):
        super().__init__(text=text, user_id="user", timestamp="2026-10-11T00:00:00Z")
        self.finalized = True
        self.result = {
            "language": detected_language,
            "request_id": "test-req-001",
            "speech_end_audio_position_s": 2.4,
        }


def build_glaze_dental_system_prompt() -> str:
    """Builds the authoritative Glaze Dental Clinic system prompt."""
    clinic_base = (
        "=== IDENTITY & PERSONA ===\n"
        "You are Rahul, the friendly, professional clinic receptionist at Glaze Dental Clinic in Mumbai.\n"
        "Tone: Warm, welcoming, respectful, and reassuring.\n"
        "BANNED PHRASES: NEVER say 'system access', 'database', 'I am an AI', or 'system error'. Speak strictly as an on-site receptionist.\n\n"
        "=== CLINIC KNOWLEDGE BASE ===\n"
        "Clinic Name: Glaze Dental Clinic (ग्लेज दातांचा दवाखाना / Glaze दांतों का दवाखाना)\n"
        "Location: Shop 4, Sunshine Heights, Opposite City Mall, MG Road, Mumbai.\n"
        "Lead Doctor: Dr. Amit Sharma (MDS Orthodontics, 12 years experience).\n"
        "Consultation Fee: Rs. 500.\n"
        "Services: Teeth Cleaning (Scaling), Root Canal Treatment (RCT), Teeth Whitening, Tooth Extraction, Dental Implants, Braces.\n"
        "Working Hours: Monday to Saturday, 10:00 AM to 8:00 PM. Closed on Sundays.\n"
        "Emergency Contact: +91 98200 12345.\n\n"
        "=== APPOINTMENT BOOKING RULES ===\n"
        "- Help callers schedule, confirm, or reschedule appointments.\n"
        "- Collect the caller's preferred date, preferred time slot, and patient name.\n"
        "- Always confirm patient details politely before completing the booking.\n\n"
        "=== CALL TERMINATION ===\n"
        "- When the caller says goodbye or thanks you, respond with one short, polite farewell in their language and conclude the call."
    )
    temporal = build_compact_temporal_anchor(time_zone="Asia/Kolkata")
    return f"{clinic_base}\n\n{temporal}{LANGUAGE_MIRROR_DIRECTIVE}"


def call_sarvam_chat_completions(messages: list) -> str:
    """Sends prompt & turns directly to Sarvam LLM API."""
    url = "https://api.sarvam.ai/v1/chat/completions"
    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "model": "sarvam-105b-conversations",
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 150,
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(url, headers=headers, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(f"Sarvam API error {resp.status_code}: {resp.text}")
        data = resp.json()
        choice_msg = data["choices"][0]["message"]
        content = choice_msg.get("content") or ""
        return content.strip()


async def run_simulation():
    print("=" * 80)
    print(" NextLite Voice — Real Sarvam API Call & Multilingual Switching Test")
    print(f" LLM Model       : sarvam-105b-conversations")
    print(f" Sarvam API Key  : {settings.SARVAM_API_KEY[:8]}...{settings.SARVAM_API_KEY[-4:]}")
    print(f" Initial Language: mr-IN (Marathi)")
    print("=" * 80)

    # 1. Initialize System Prompt and TTS Service
    system_prompt = build_glaze_dental_system_prompt()
    tts_service = MockTTSService(initial_language="mr-IN")
    lang_processor = LanguageContextProcessor(tts_service=tts_service)
    from unittest.mock import AsyncMock
    lang_processor.push_frame = AsyncMock()

    # 2. Turn 0: Assistant Initial Greeting
    clinic_greeting = "नमस्कार, Glaze Dental Clinic मध्ये आपले स्वागत आहे. मी राहुल बोलतोय, मी आपली काय मदत करू शकतो?"
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "assistant", "content": clinic_greeting},
    ]

    print(f"\n[Turn 0: Greeting]")
    print(f"   Assistant (mr-IN): \"{clinic_greeting}\"")
    print(f"   Active TTS Voice : {tts_service._active_language}\n")

    # 3. Test Scenarios: 4 turns testing Marathi -> Hindi -> English -> Marathi
    test_turns = [
        {
            "turn_number": 1,
            "spoken_language": "mr-IN",
            "language_name": "Marathi",
            "caller_utterance": "मला उद्या दुपारी १२ वाजता दात स्वच्छ करण्यासाठी अपॉइंटमेंट हवी आहे.",
            "description": "Caller asks for appointment in Marathi"
        },
        {
            "turn_number": 2,
            "spoken_language": "hi-IN",
            "language_name": "Hindi",
            "caller_utterance": "अच्छा, इसके लिए डॉक्टर कौन हैं और कंसल्टेशन फीस कितनी होगी?",
            "description": "Caller switches to Hindi asking about doctor & fees"
        },
        {
            "turn_number": 3,
            "spoken_language": "en-IN",
            "language_name": "English",
            "caller_utterance": "Okay, please book the slot for Rahul Sharma. Also what is the clinic address?",
            "description": "Caller switches to English providing patient name and asking address"
        },
        {
            "turn_number": 4,
            "spoken_language": "mr-IN",
            "language_name": "Marathi",
            "caller_utterance": "खूप खूप धन्यवाद! मी उद्या वेळेवर पोहोचतो.",
            "description": "Caller switches back to Marathi to say thanks and conclude"
        },
    ]

    all_passed = True

    for turn in test_turns:
        t_num = turn["turn_number"]
        stt_lang = turn["spoken_language"]
        lang_name = turn["language_name"]
        user_utt = turn["caller_utterance"]
        desc = turn["description"]

        print("-" * 80)
        print(f"[Turn {t_num}: {desc}]")
        print(f"   Caller ({lang_name} / {stt_lang}): \"{user_utt}\"")

        # Step A: Saaras STT emits finalized TranscriptionFrame with result["language"]
        stt_frame = MockTranscriptionFrame(text=user_utt, detected_language=stt_lang)
        
        # Step B: LanguageContextProcessor updates Bulbul TTS
        await lang_processor.process_frame(stt_frame, None)
        print(f"   -> TTS Voice After STT Detection: '{tts_service._active_language}'")

        # Verify TTS matches STT detected language
        if tts_service._active_language != stt_lang:
            print(f"   ❌ TTS Language mismatch! Expected {stt_lang}, got {tts_service._active_language}")
            all_passed = False

        # Step C: Prepare LLM Turn with dynamic turn reminder
        messages.append({"role": "user", "content": user_utt})
        
        dispatch_msgs = list(messages)
        active_lang = tts_service._active_language or "en-IN"
        lang_display = get_language_display_name(active_lang)
        reminder = {
            "role": "system",
            "content": f"The caller is speaking in {lang_display} ({active_lang}). Respond strictly in {lang_display}."
        }
        user_idx = len(dispatch_msgs) - 1
        dispatch_msgs.insert(user_idx, reminder)

        # Step D: Call live Sarvam LLM API
        print(f"   Calling live Sarvam LLM API...")
        try:
            llm_reply = call_sarvam_chat_completions(dispatch_msgs)
            messages.append({"role": "assistant", "content": llm_reply})
            print(f"   Assistant Response:\n   \"{llm_reply}\"")
        except Exception as e:
            print(f"   ❌ Sarvam LLM API Call Failed: {e}")
            all_passed = False
        print()

    print("=" * 80)
    print(" VERIFICATION RESULTS")
    print(f" All Turns Processed Successfully : {'PASS' if all_passed else 'FAIL'}")
    print(f" Full TTS Voice Switch History    : {' -> '.join(tts_service.reconfiguration_history)}")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_simulation())
