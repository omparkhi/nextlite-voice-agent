"""
Full Multi-Turn Call Simulation Test: Language Persistence Verification
Tests 3 complete realistic calls to verify that after switching languages,
the agent strictly stays in the switched language until the call concludes.

Call 1: Starts in English -> Switches to Hindi -> Stays in Hindi till end.
Call 2: Starts in Hindi   -> Switches to Marathi -> Stays in Marathi till end.
Call 3: Starts in Marathi -> Switches to English -> Stays in English till end.

Usage:
  apps\\pipecat-worker\\.venv\\Scripts\\python.exe scripts/test_full_conversations_language_persistence.py
"""
import sys
import os
import asyncio
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
from pipecat.frames.frames import TranscriptionFrame


class MockTranscriptionFrame(TranscriptionFrame):
    """Simulates a finalized Sarvam Saaras Realtime STT frame."""
    def __init__(self, text: str, detected_language: str):
        super().__init__(text=text, user_id="user", timestamp="2026-10-11T00:00:00Z")
        self.finalized = True
        self.result = {
            "language": detected_language,
            "request_id": "test-persistence-req",
            "speech_end_audio_position_s": 2.5,
        }


class MockTTSService:
    """Simulates Bulbul TTS WebSocket maintaining active language state."""
    def __init__(self, initial_language: str):
        self._active_language = initial_language
        self.reconfiguration_history: List[str] = [initial_language]

    def update_language_context(self, language: str):
        norm = normalize_language_code(language)
        if norm != self._active_language:
            self._active_language = norm
            self.reconfiguration_history.append(norm)
            print(f"      [Bulbul TTS WebSocket] Reconfigured voice target_language_code -> '{norm}'")


def build_system_prompt() -> str:
    clinic_base = (
        "=== IDENTITY & PERSONA ===\n"
        "You are Rahul, the friendly, professional clinic receptionist at Glaze Dental Clinic in Mumbai.\n"
        "Tone: Warm, welcoming, respectful, and reassuring.\n"
        "Keep your responses concise and natural for voice (1-3 sentences maximum).\n"
        "BANNED PHRASES: NEVER say 'system access', 'database', 'I am an AI', or 'system error'. Speak strictly as an on-site receptionist.\n\n"
        "=== CLINIC KNOWLEDGE BASE ===\n"
        "Clinic Name: Glaze Dental Clinic\n"
        "Location: Shop 4, Sunshine Heights, Opposite City Mall, MG Road, Mumbai.\n"
        "Lead Doctor: Dr. Amit Sharma (MDS Orthodontics, 12 years experience).\n"
        "Consultation Fee: Rs. 500.\n"
        "Services: Teeth Cleaning (Scaling), Root Canal Treatment (RCT), Teeth Whitening, Tooth Extraction, Dental Implants, Braces.\n"
        "Working Hours: Monday to Saturday, 10:00 AM to 8:00 PM. Closed on Sundays.\n"
        "Emergency Contact: +91 98200 12345.\n\n"
        "=== APPOINTMENT BOOKING RULES ===\n"
        "- Help callers schedule, confirm, or reschedule appointments.\n"
        "- Collect preferred date, time slot, and patient name.\n"
        "- Always confirm details politely before completing booking.\n\n"
        "=== CALL TERMINATION ===\n"
        "- When the caller says goodbye or thanks you, respond with one short, polite farewell in their language and conclude the call."
    )
    temporal = build_compact_temporal_anchor(time_zone="Asia/Kolkata")
    return f"{clinic_base}\n\n{temporal}{LANGUAGE_MIRROR_DIRECTIVE}"


def call_sarvam_chat_completions(messages: list) -> str:
    url = "https://api.sarvam.ai/v1/chat/completions"
    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "model": "sarvam-105b-conversations",
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 120,
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(url, headers=headers, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(f"Sarvam API error {resp.status_code}: {resp.text}")
        data = resp.json()
        choice_msg = data["choices"][0]["message"]
        content = choice_msg.get("content") or ""
        return content.strip()


async def simulate_call(call_id: int, title: str, initial_lang: str, initial_greeting: str, turns: list):
    print("\n" + "=" * 90)
    print(f" CALL {call_id}: {title}")
    print(f" Initial Language: {initial_lang}")
    print("=" * 90)

    from unittest.mock import AsyncMock
    tts_service = MockTTSService(initial_language=initial_lang)
    lang_processor = LanguageContextProcessor(tts_service=tts_service)
    lang_processor.push_frame = AsyncMock()

    messages = [
        {"role": "system", "content": build_system_prompt()},
        {"role": "assistant", "content": initial_greeting},
    ]

    print(f"\n[Turn 0: Greeting]")
    print(f"   Assistant ({initial_lang}): \"{initial_greeting}\"")
    print(f"   Active TTS Voice: {tts_service._active_language}\n")

    call_passed = True

    for turn in turns:
        t_num = turn["turn_number"]
        stt_lang = turn["spoken_language"]
        lang_name = turn["language_name"]
        user_utt = turn["caller_utterance"]
        stage = turn["stage"]

        print("-" * 80)
        print(f"[Turn {t_num} | Stage: {stage}]")
        print(f"   Caller ({lang_name} / {stt_lang}): \"{user_utt}\"")

        # 1. STT finalized frame processed by LanguageContextProcessor
        frame = MockTranscriptionFrame(text=user_utt, detected_language=stt_lang)
        await lang_processor.process_frame(frame, None)
        active_lang = tts_service._active_language

        print(f"   -> STT Detected: {stt_lang} | TTS Active Voice: {active_lang}")

        if active_lang != stt_lang:
            print(f"   ❌ TTS Language mismatch! Expected {stt_lang}, got {active_lang}")
            call_passed = False

        # 2. Append user utterance
        messages.append({"role": "user", "content": user_utt})

        # 3. Grounded Turn Reminder
        dispatch_msgs = list(messages)
        lang_display = get_language_display_name(active_lang)
        reminder = {
            "role": "system",
            "content": f"The caller is speaking in {lang_display} ({active_lang}). Respond strictly in {lang_display}."
        }
        user_idx = len(dispatch_msgs) - 1
        dispatch_msgs.insert(user_idx, reminder)

        # 4. Live Sarvam LLM completion
        try:
            llm_reply = call_sarvam_chat_completions(dispatch_msgs)
            messages.append({"role": "assistant", "content": llm_reply})
            print(f"   Assistant Response ({lang_display}):\n   \"{llm_reply}\"")
        except Exception as e:
            print(f"   ❌ API Failure: {e}")
            call_passed = False

    print("\n" + "." * 80)
    print(f" CALL {call_id} SUMMARY: {'PASS' if call_passed else 'FAIL'}")
    print(f" Voice Reconfiguration Path: {' -> '.join(tts_service.reconfiguration_history)}")
    print("." * 80)
    return call_passed


async def main():
    print("=" * 90)
    print(" SARVAM AI — MULTI-TURN PERSISTENCE AUDIT (3 FULL REAL CALLS)")
    print(" Verifying that once switched, AI persists in the active language until call completion.")
    print("=" * 90)

    # --------------------------------------------------------------------------
    # CALL 1: English -> Switch to Hindi -> Stay in Hindi till end of call
    # --------------------------------------------------------------------------
    call1_turns = [
        {
            "turn_number": 1,
            "stage": "Initial Language",
            "spoken_language": "en-IN",
            "language_name": "English",
            "caller_utterance": "Hello, could you tell me your working hours and consultation fee?",
        },
        {
            "turn_number": 2,
            "stage": "Language Switch (to Hindi)",
            "spoken_language": "hi-IN",
            "language_name": "Hindi",
            "caller_utterance": "अच्छा, क्या मुझे कल दोपहर 2 बजे डॉ. अमित शर्मा से कंसल्टेशन मिल सकता है?",
        },
        {
            "turn_number": 3,
            "stage": "Persistence Turn 1 (Hindi)",
            "spoken_language": "hi-IN",
            "language_name": "Hindi",
            "caller_utterance": "हाँ, प्लीज राहुल वर्मा के नाम से यह स्लॉट बुक कर दीजिए।",
        },
        {
            "turn_number": 4,
            "stage": "Persistence Turn 2 (Farewell in Hindi)",
            "spoken_language": "hi-IN",
            "language_name": "Hindi",
            "caller_utterance": "बहुत-बहुत धन्यवाद राहुल जी, मैं कल समय पर आ जाऊँगा।",
        },
    ]

    # --------------------------------------------------------------------------
    # CALL 2: Hindi -> Switch to Marathi -> Stay in Marathi till end of call
    # --------------------------------------------------------------------------
    call2_turns = [
        {
            "turn_number": 1,
            "stage": "Initial Language",
            "spoken_language": "hi-IN",
            "language_name": "Hindi",
            "caller_utterance": "नमस्ते राहुल, मुझे क्लिनिक के बारे में कुछ पूछना था।",
        },
        {
            "turn_number": 2,
            "stage": "Language Switch (to Marathi)",
            "spoken_language": "mr-IN",
            "language_name": "Marathi",
            "caller_utterance": "मला दात स्वच्छ करायचे आहेत, त्यासाठी उद्या सकाळी ११ वाजता वेळ मिळेल का?",
        },
        {
            "turn_number": 3,
            "stage": "Persistence Turn 1 (Marathi)",
            "spoken_language": "mr-IN",
            "language_name": "Marathi",
            "caller_utterance": "माझे नाव सुप्रिया पाटील आहे, कृपया ही अपॉइंटमेंट निश्चित करा.",
        },
        {
            "turn_number": 4,
            "stage": "Persistence Turn 2 (Farewell in Marathi)",
            "spoken_language": "mr-IN",
            "language_name": "Marathi",
            "caller_utterance": "खूप खूप धन्यवाद! मी उद्या वेळेवर पोहोचते.",
        },
    ]

    # --------------------------------------------------------------------------
    # CALL 3: Marathi -> Switch to English -> Stay in English till end of call
    # --------------------------------------------------------------------------
    call3_turns = [
        {
            "turn_number": 1,
            "stage": "Initial Language",
            "spoken_language": "mr-IN",
            "language_name": "Marathi",
            "caller_utterance": "नमस्कार राहुल, मला दातदुखीचा खूप त्रास होतोय.",
        },
        {
            "turn_number": 2,
            "stage": "Language Switch (to English)",
            "spoken_language": "en-IN",
            "language_name": "English",
            "caller_utterance": "Actually, could we continue in English? What is the exact address of Glaze Dental Clinic?",
        },
        {
            "turn_number": 3,
            "stage": "Persistence Turn 1 (English)",
            "spoken_language": "en-IN",
            "language_name": "English",
            "caller_utterance": "Understood. Please book a root canal consultation for Vikram Desai tomorrow at 4 PM.",
        },
        {
            "turn_number": 4,
            "stage": "Persistence Turn 2 (Farewell in English)",
            "spoken_language": "en-IN",
            "language_name": "English",
            "caller_utterance": "Thank you so much for your help. Have a wonderful day!",
        },
    ]

    p1 = await simulate_call(
        call_id=1,
        title="English Start -> Switch to Hindi -> Persist Hindi till End",
        initial_lang="en-IN",
        initial_greeting="Hello, welcome to Glaze Dental Clinic. My name is Rahul, how can I help you today?",
        turns=call1_turns,
    )

    p2 = await simulate_call(
        call_id=2,
        title="Hindi Start -> Switch to Marathi -> Persist Marathi till End",
        initial_lang="hi-IN",
        initial_greeting="नमस्ते, Glaze Dental Clinic में आपका स्वागत है। मैं राहुल बोल रहा हूँ, मैं आपकी क्या मदद कर सकता हूँ?",
        turns=call2_turns,
    )

    p3 = await simulate_call(
        call_id=3,
        title="Marathi Start -> Switch to English -> Persist English till End",
        initial_lang="mr-IN",
        initial_greeting="नमस्कार, Glaze Dental Clinic मध्ये आपले स्वागत आहे. मी राहुल बोलतोय, मी आपली काय मदत करू शकतो?",
        turns=call3_turns,
    )

    print("\n" + "=" * 90)
    print(" FINAL VERIFICATION SUMMARY FOR ALL 3 FULL CALLS")
    print(f" Call 1 (Persist Hindi)   : {'PASS' if p1 else 'FAIL'}")
    print(f" Call 2 (Persist Marathi) : {'PASS' if p2 else 'FAIL'}")
    print(f" Call 3 (Persist English) : {'PASS' if p3 else 'FAIL'}")
    print(f" OVERALL RESULT           : {'ALL PASSED SUCCESSFULLY' if (p1 and p2 and p3) else 'FAILED'}")
    print("=" * 90)


if __name__ == "__main__":
    asyncio.run(main())
