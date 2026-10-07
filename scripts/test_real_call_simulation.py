"""
NextLite — Real-Call Simulation Test (live Sarvam API + Production Prompt & Logic)

Exercises the EXACT PRODUCTION path:
    1. Compiles the real production prompt (Glaze Dental Clinic) with temporal grounding,
       call termination rules, and LANGUAGE_MIRROR_DIRECTIVE.
    2. Initializes the conversation with the production assistant greeting.
    3. Sends caller utterances to Sarvam LLM (LIVE, sarvam-105b-conversations).
    4. Passes the reply through the production InstrumentedSarvamTTSService.sync_language_from_text
       (per-segment) to verify Hindi (hi-IN) vs Marathi (mr-IN) vs English (en-IN) voice switching.

Run:
    apps\\pipecat-worker\\.venv\\Scripts\\python.exe scripts/test_real_call_simulation.py
    apps\\pipecat-worker\\.venv\\Scripts\\python.exe scripts/test_real_call_simulation.py --stable
"""

import sys
import os
import re
import argparse
import asyncio
import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

worker_app_dir = os.path.join(os.path.dirname(__file__), "..", "apps", "pipecat-worker")
sys.path.insert(0, os.path.abspath(worker_app_dir))

from app.config import settings
from app.language_manager import script_family, LANGUAGE_MIRROR_DIRECTIVE
from app.main import InstrumentedSarvamTTSService
from app.temporal_context import build_compact_temporal_anchor


# --------------------------------------------------------------------------- #
# Production Recording TTS — exercises InstrumentedSarvamTTSService directly
# --------------------------------------------------------------------------- #
class RecordingTTS(InstrumentedSarvamTTSService):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("api_key", settings.SARVAM_API_KEY)
        super().__init__(*args, **kwargs)
        self.voice_log = []

    def update_language_context(self, language: str):
        self.voice_log.append(language)
        super().update_language_context(language)


# --------------------------------------------------------------------------- #
# Live Sarvam LLM Call
# --------------------------------------------------------------------------- #
def call_sarvam_llm(messages: list) -> str:
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
        if not content and "tool_calls" in choice_msg:
            content = f"Tool Call: {choice_msg['tool_calls'][0]['function']['name']}"
        return content.strip()


_SENT_SPLIT = re.compile(r"(?<=[।.!?])\s+")

def to_tts_segments(reply: str) -> list:
    parts = [p.strip() for p in _SENT_SPLIT.split(reply) if p.strip()]
    return parts or [reply]


def run_turn(tts: RecordingTTS, messages: list, user_input: str, stable_mode: bool) -> dict:
    messages.append({"role": "user", "content": user_input})
    dispatch = list(messages)
    reminder = {"role": "system", "content": "MANDATORY: Reply in the exact language of the caller's latest utterance (if caller spoke Hindi, reply in Hindi; if Marathi, reply in Marathi; if English, reply in English)."}
    idx = next((i for i in range(len(dispatch) - 1, -1, -1)
                if dispatch[i].get("role") == "user"), None)
    dispatch.insert(idx if idx is not None else 1, reminder)

    reply = call_sarvam_llm(dispatch)
    messages.append({"role": "assistant", "content": reply})

    full_script = script_family(reply)
    segments = to_tts_segments(reply)
    per_segment_voice = []

    if stable_mode:
        tts.sync_language_from_text(reply)
        held = tts._active_language
        for _ in segments:
            per_segment_voice.append(held)
    else:
        for seg in segments:
            tts.sync_language_from_text(seg)
            per_segment_voice.append(tts._active_language)

    return {
        "reply": reply,
        "full_script": full_script,
        "segments": segments,
        "per_segment_voice": per_segment_voice,
        "turn_voice": tts._active_language,
    }


def build_production_system_prompt() -> str:
    """Builds the exact production system prompt matching main.py logic."""
    base_prompt = (
        "You are a friendly, courteous dental receptionist at Glaze Dental Clinic in Mumbai.\n"
        "Clinic Services: Dental Cleaning, Root Canal Treatment, Teeth Whitening, Tooth Extraction, Consultations.\n"
        "Working Hours: Monday to Saturday from 10:00 AM to 8:00 PM.\n"
        "Policy: Help callers book appointments, answer clinic questions, and assist in Marathi, Hindi, and English."
    )
    temporal = build_compact_temporal_anchor(time_zone="Asia/Kolkata")
    termination = (
        "\n\n=== CALL TERMINATION ===\n"
        "- When user says goodbye, thanks you, or indicates they are done:\n"
        "  1. Speak exactly one short, warm closing farewell in the active conversation language.\n"
        "  2. Call `end_call` tool immediately to hang up. Do NOT ask follow-up questions."
    )
    return f"{base_prompt}\n\n{temporal}{termination}{LANGUAGE_MIRROR_DIRECTIVE}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stable", action="store_true", help="Hold single voice per turn based on full reply")
    args = ap.parse_args()

    print("=" * 84)
    print(" NextLite — Production Live Call Simulation (Exact Prompt & Logic)")
    print(f" Mode: {'STABLE (full-reply guard)' if args.stable else 'PRODUCTION (per-segment glue)'}")
    print(f" Key: {settings.SARVAM_API_KEY[:10]}...")
    print("=" * 84)

    initial_system_prompt = build_production_system_prompt()
    primary_language = "mr-IN"
    clinic_greeting = "नमस्कार, Glaze Dental Clinic मध्ये आपले स्वागत आहे. मी आपली काय मदत करू शकतो?"

    tts = RecordingTTS(language=primary_language, primary_indic_lang=primary_language)
    
    # Initialize message history with production prompt and assistant greeting
    messages = [
        {"role": "system", "content": initial_system_prompt},
        {"role": "assistant", "content": clinic_greeting},
    ]
    snapshot = messages[0]["content"]

    print(f"\n[Call Initialized] Initial TTS Voice: {tts._active_language}")
    print(f"Assistant Greeting: \"{clinic_greeting}\"\n")

    turns = [
        ("HINDI",   "अपॉइंटमेंट बुक करनी थी और डॉक्टर से मिलना था"),
        ("MARATHI", "मला उद्या दुपारी १२ ची अपॉइंटमेंट पाहिजे"),
        ("MARATHI", "Om Vijay Parkhi"),
        ("ENGLISH", "Can you also send the clinic location address on SMS in English please?"),
        ("MARATHI", "धन्यवाद, मी उद्या वेळेवर पोहोचतो."),
    ]
    expected_voice = {"HINDI": "hi-IN", "MARATHI": "mr-IN", "ENGLISH": "en-IN"}

    cross_turn_ok = True
    mid_turn_flips = []

    for n, (lang, utt) in enumerate(turns, 1):
        print("-" * 84)
        print(f" TURN {n} [{lang}]  Caller: \"{utt}\"")
        r = run_turn(tts, messages, utt, args.stable)

        print(f"   Full Reply Text   : \"{r['reply']}\"")
        print(f"   Detected Script   : {r['full_script'].upper()}")
        print(f"   TTS Segments ({len(r['segments'])}):")
        for i, (seg, v) in enumerate(zip(r["segments"], r["per_segment_voice"]), 1):
            print(f"     [{i}] voice={v:<6} | {seg[:70]}")

        uniq = set(r["per_segment_voice"])
        if len(uniq) > 1:
            mid_turn_flips.append((n, sorted(uniq)))
            print(f"   !! MID-TURN FLIP: voice changed within turn -> {sorted(uniq)}")
        else:
            print(f"   Voice: {r['turn_voice']}")

        exp = expected_voice.get(lang)
        if exp and r["turn_voice"] != exp:
            cross_turn_ok = False
            print(f"   !! Note: Expected {exp}, got {r['turn_voice']}")
        print()

    prompt_static = messages[0]["content"] == snapshot

    print("=" * 84)
    print(" LIVE PRODUCTION SIMULATION SUMMARY")
    print(f"  A. Cross-turn switching correct ......... {'PASS' if cross_turn_ok else 'FAIL'}")
    print(f"  B. No mid-turn voice flip ............... {'PASS' if not mid_turn_flips else 'FAIL'}")
    if mid_turn_flips:
        for n, voices in mid_turn_flips:
            print(f"       turn {n}: flipped among {voices}")
    print(f"  C. System prompt static (no KV reset) ... {'PASS' if prompt_static else 'FAIL'}")
    print(f"  D. TTS voice changes total .............. {len(tts.voice_log)} -> {tts.voice_log}")
    print("=" * 84)


if __name__ == "__main__":
    main()
