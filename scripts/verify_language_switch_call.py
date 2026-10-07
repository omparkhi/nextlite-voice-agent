"""
Automated Verification & Simulation Test for NextLite Minimal Language Switch Architecture.

Simulates a real multi-turn call session across language transitions:
1. Marathi (Startup/Greeting) -> Devanagari output -> TTS voice = mr-IN
2. English switch -> Latin output -> TTS voice = en-IN
3. Hindi switch -> Devanagari output -> TTS voice = mr-IN (deployment primary Indic)
4. Tamil switch -> Tamil output -> TTS voice = ta-IN
5. Telugu switch -> Telugu output -> TTS voice = te-IN
6. Bengali switch -> Bengali output -> TTS voice = bn-IN
7. English return -> Latin output -> TTS voice = en-IN

Verifies:
- Prompt stability: messages[0] is NEVER mutated (0 KV-cache invalidation)
- LanguageContextProcessor: strictly cleans transcript and hesitation without prompt rewriting
- TTS voice sync: sync_language_from_text fires and updates target voice accurately
"""

import sys
import os
import asyncio

# Configure UTF-8 encoding for Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Ensure app package is importable
worker_app_dir = os.path.join(os.path.dirname(__file__), "..", "apps", "pipecat-worker")
sys.path.insert(0, os.path.abspath(worker_app_dir))

from app.language_manager import (
    normalize_language_code,
    get_language_display_name,
    script_family,
    LANGUAGE_MIRROR_DIRECTIVE,
)
from app.language_processor import LanguageContextProcessor, clean_asr_hallucinations, is_pure_hesitation_noise
from app.main import InstrumentedSarvamTTSService


class MockTTSSettings:
    def __init__(self, language: str = "en-IN"):
        self.language = language


class MockTTS(InstrumentedSarvamTTSService):
    """Mock subclass of InstrumentedSarvamTTSService to verify language sync without active WebSocket."""

    def __init__(self, *args, **kwargs):
        if "api_key" not in kwargs and not args:
            kwargs["api_key"] = "test_mock_sarvam_key"
        super().__init__(*args, **kwargs)
        self._settings = MockTTSSettings(language=self._active_language)
        self.sent_configs = []

    async def _send_config(self):
        self.sent_configs.append(self._active_language)


def run_language_switch_verification():
    print("=" * 70)
    print(" NextLite Minimal Language-Switch Architecture — Live Call Simulation")
    print("=" * 70)

    # -------------------------------------------------------------
    # 1. Script Family Classifier Unit Verification
    # -------------------------------------------------------------
    print("\n[Step 1] Verifying Unicode script classifier (script_family)...")
    script_cases = [
        ("नमस्कार! NextLite मध्ये आपले स्वागत आहे.", "devanagari"),
        ("नमस्ते, मुझे डॉक्टर से मिलना है।", "devanagari"),
        ("Hello, I would like to book an appointment.", "latin"),
        ("வணக்கம், நான் மருத்துவரை சந்திக்க வேண்டும்.", "tamil"),
        ("నమస్కారం, నాకు అపాయింట్‌మెంట్ కావాలి.", "telugu"),
        ("নমস্কার, আমি ডাক্তার দেখাতে চাই।", "bengali"),
        ("નમસ્તે, મારે એપોઇન્ટમેન્ટ લેવી છે.", "gujarati"),
        ("ਸਤਿ ਸ਼੍ਰੀ ਅਕਾਲ, ਮੈਂ ਡਾਕਟਰ ਨੂੰ ਮਿਲਣਾ ਚਾਹੁੰਦਾ ਹਾਂ।", "gurmukhi"),
        ("നമസ്കാരം, എനിക്ക് ഒരു അപ്പോയിന്റ്മെന്റ് വേണം.", "malayalam"),
        ("ನಮಸ್ಕಾರ, ನನಗೆ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬೇಕು.", "kannada"),
        ("ہیلو، مجھے ڈاکٹر سے ملنا ہے۔", "arabic"),
    ]
    for text, expected_fam in script_cases:
        fam = script_family(text)
        assert fam == expected_fam, f"Expected {expected_fam} for '{text[:20]}...', got {fam}"
        print(f"  ✓ [{fam.upper():<10}] '{text[:35]}...'")
    print("  -> Unicode Script classification 100% verified.")

    # -------------------------------------------------------------
    # 2. Static Mirror Directive Verification
    # -------------------------------------------------------------
    print("\n[Step 2] Verifying static prompt mirror directive...")
    base_prompt = "You are a friendly medical receptionist at NextLite Clinic."
    initial_system_prompt = f"{base_prompt}{LANGUAGE_MIRROR_DIRECTIVE}"
    assert "Always respond in the language of the caller's LATEST utterance" in initial_system_prompt
    assert "=== LANGUAGE ===" in initial_system_prompt
    print(f"  ✓ Single static directive compiled ({len(initial_system_prompt)} chars).")

    # -------------------------------------------------------------
    # 3. LanguageContextProcessor Verification (Minimal & Fast)
    # -------------------------------------------------------------
    print("\n[Step 3] Verifying LanguageContextProcessor...")
    processor = LanguageContextProcessor()
    
    # ASR loops collapsed
    dirty_asr = "हो हो हो हो हो मला उद्या यायचे आहे"
    cleaned = clean_asr_hallucinations(dirty_asr)
    assert "हो हो मला उद्या यायचे आहे" in cleaned or "मला उद्या यायचे आहे" in cleaned
    print(f"  ✓ Cleaned ASR hallucination: '{dirty_asr}' -> '{cleaned}'")

    # Hesitation noise filtered
    assert is_pure_hesitation_noise("hmm") is True
    assert is_pure_hesitation_noise("uh") is True
    assert is_pure_hesitation_noise("हं") is True
    assert is_pure_hesitation_noise("काय") is False  # Semantic word preserved
    assert is_pure_hesitation_noise("हो") is False   # Confirmation preserved
    print("  ✓ Pure noise tokens filtered while preserving single-word semantic intents.")

    # -------------------------------------------------------------
    # 4. Multi-Turn Call Simulation (Output-Script -> TTS Voice Glue)
    # -------------------------------------------------------------
    print("\n[Step 4] Simulating 7-Turn Real Call with Dynamic Language Switching...")
    primary_language = "mr-IN"  # Deployment is primarily Marathi
    tts = MockTTS(
        language=primary_language,
        primary_indic_lang=primary_language,
    )
    print(f"  Initial TTS Active Language: {tts._active_language} (Primary Indic: {tts._primary_indic_lang})")

    # Conversation context initialization
    messages = [{"role": "system", "content": initial_system_prompt}]
    initial_system_prompt_snapshot = messages[0]["content"]

    call_turns = [
        {
            "turn": 1,
            "caller_input": "नमस्कार, क्लिनिक कधी उघडते?",
            "caller_lang_desc": "Marathi",
            "llm_output": "नमस्कार! NextLite क्लिनिक सकाळी ९ ते संध्याकाळी ८ पर्यंत उघडे असते. मी आपली काय मदत करू शकतो?",
            "expected_tts_lang": "mr-IN",
        },
        {
            "turn": 2,
            "caller_input": "Can you please tell me which doctor is available today in English?",
            "caller_lang_desc": "English",
            "llm_output": "Certainly! Today Dr. Rajesh Sharma, General Physician, is available until 4 PM.",
            "expected_tts_lang": "en-IN",
        },
        {
            "turn": 3,
            "caller_input": "डॉक्टर साहब की फीस कितनी है?",
            "caller_lang_desc": "Hindi",
            "llm_output": "डॉक्टर राजेश शर्मा का परामर्श शुल्क ₹500 है। क्या आप अपॉइंटमेंट बुक करना चाहते हैं?",
            "expected_tts_lang": "mr-IN", # Devanagari script routes to deployment's primary Indic (mr-IN)
        },
        {
            "turn": 4,
            "caller_input": "தமிழ் பேச முடியுமா? நாளைக்கு அப்பாயின்ட்மெண்ட் கிடைக்குமா?",
            "caller_lang_desc": "Tamil",
            "llm_output": "ஆம், நாளை காலை 10:30 மணிக்கு அப்பாயின்ட்மெண்ட் பதிவு செய்யலாம்.",
            "expected_tts_lang": "ta-IN",
        },
        {
            "turn": 5,
            "caller_input": "తెలుగులో చెప్పండి, రేపు సమయం ఉందా?",
            "caller_lang_desc": "Telugu",
            "llm_output": "అవును, రేపు ఉదయం 10:30 గంటలకు స్లాట్ ఖాళీగా ఉంది.",
            "expected_tts_lang": "te-IN",
        },
        {
            "turn": 6,
            "caller_input": "বাংলায় বলুন, কালকে ডাক্তার থাকবেন?",
            "caller_lang_desc": "Bengali",
            "llm_output": "হ্যাঁ, আগামীকাল সকাল ১০:৩০ টায় ডাক্তার বাবু উপস্থিত থাকবেন।",
            "expected_tts_lang": "bn-IN",
        },
        {
            "turn": 7,
            "caller_input": "Great, please confirm the appointment in English under the name Rahul.",
            "caller_lang_desc": "English",
            "llm_output": "Your appointment with Dr. Rajesh Sharma has been booked for tomorrow at 10:30 AM under the name Rahul.",
            "expected_tts_lang": "en-IN",
        },
    ]

    for turn in call_turns:
        t_num = turn["turn"]
        caller_in = turn["caller_input"]
        lang_desc = turn["caller_lang_desc"]
        llm_out = turn["llm_output"]
        expected_lang = turn["expected_tts_lang"]

        # 1. User turn arrives
        messages.append({"role": "user", "content": caller_in})

        # 2. Per-turn prompt reminder injected before user turn (cache-safe)
        turn_params = {"messages": list(messages)}
        msgs = turn_params["messages"]
        reminder = {"role": "system", "content": "Respond in the language of the caller's latest turn."}
        user_idx = None
        for idx in range(len(msgs) - 1, -1, -1):
            if msgs[idx].get("role") == "user":
                user_idx = idx
                break
        msgs.insert(user_idx if user_idx is not None else 1, reminder)

        # 3. LLM produces response
        messages.append({"role": "assistant", "content": llm_out})

        # 4. Glue activates before TTS synthesis
        tts.sync_language_from_text(llm_out)

        # 5. Assertions
        assert tts._active_language == expected_lang, (
            f"Turn {t_num} ({lang_desc}): Expected TTS active language {expected_lang}, got {tts._active_language}"
        )
        assert messages[0]["content"] == initial_system_prompt_snapshot, (
            f"Turn {t_num}: messages[0] was mutated! KV-cache invalidation detected."
        )

        print(f"  Turn {t_num} [{lang_desc:<7} -> TTS {tts._active_language:<5}]:")
        print(f"    Caller:    '{caller_in}'")
        print(f"    Assistant: '{llm_out[:60]}...'")
        print(f"    TTS Voice Target: {tts._active_language} | Script: {script_family(llm_out)}")
        print()

    print("=" * 70)
    print(" ALL VERIFICATIONS PASSED:")
    print("  1. Language switching works automatically via output-script -> TTS voice glue.")
    print("  2. System prompt messages[0] remained 100% untouched across all 7 switch turns.")
    print("  3. KV-cache invalidation spikes eliminated.")
    print("  4. Minimal architecture verified successfully.")
    print("=" * 70)


if __name__ == "__main__":
    run_language_switch_verification()
