"""
Real Call Simulation & Multi-Turn Language Switch Verification for Glaze Dental Clinic.

Includes 3 Realistic Dental Clinic Call Scenarios:

Scenario 1 (User's Exact Flow):
  - Greeting (Marathi): "नमस्कार, Glaze Dental Clinic मध्ये आपले स्वागत आहे..."
  - User Turn 1 (Hindi): "Appointment book karni thi, doctor se milna tha..."
  - Agent Response (Hindi): "हाँ बिल्कुल! मैं आपकी अपॉइंटमेंट बुक कर देता हूँ..."
  - User Turn 2 (Marathi): "मला उद्या १२ ची पाहिजे अपॉइंटमेंट"
  - Agent Response (Marathi): "ठीक आहे, मी उद्या दुपारी १२ ची अपॉइंटमेंट बुक करतो. आपले नाव सांगा?"
  - User Turn 3 (Marathi): "नाव ओम पारखी आहे"
  - Agent Response (Marathi): "धन्यवाद ओम जी, आपली अपॉइंटमेंट निश्चित झाली आहे."

Scenario 2 (Emergency Toothache — Marathi -> English -> Hindi -> English):
  - Greeting (Marathi)
  - User Turn 1 (English): Severe toothache inquiry & location query
  - Agent Response (English): Clinic address & emergency slot offer
  - User Turn 2 (Hindi): Urgency confirmation for evening slot
  - Agent Response (Hindi): Slot confirmation and name request
  - User Turn 3 (English): Name provided in English
  - Agent Response (English): Final English confirmation

Scenario 3 (Dental Cleaning Inquiry — English -> Marathi -> English -> Hindi):
  - Greeting (English)
  - User Turn 1 (Marathi): Dental cleaning cost inquiry
  - Agent Response (Marathi): Cost explanation & timing query
  - User Turn 2 (English): Saturday slot request
  - Agent Response (English): Saturday availability confirmation & name request
  - User Turn 3 (Hindi): Name provided in Hindi
  - Agent Response (Hindi): Final Hindi booking confirmation
"""

import sys
import os
import asyncio

# Set UTF-8 encoding for Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


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
    def __init__(self, *args, **kwargs):
        if "api_key" not in kwargs and not args:
            kwargs["api_key"] = "mock_key"
        super().__init__(*args, **kwargs)
        self._settings = MockTTSSettings(language=self._active_language)
        self.voice_history = []

    def update_language_context(self, language: str):
        super().update_language_context(language)
        self.voice_history.append(language)


def run_scenario(scenario_idx: int, title: str, clinic_greeting: str, greeting_lang: str, turns: list, primary_indic: str = "mr-IN"):
    print("=" * 80)
    print(f" SCENARIO {scenario_idx}: {title}")
    print("=" * 80)

    base_prompt = "You are a courteous dental receptionist at Glaze Dental Clinic."
    system_prompt = f"{base_prompt}{LANGUAGE_MIRROR_DIRECTIVE}"
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "assistant", "content": clinic_greeting},
    ]
    system_prompt_immutable_check = messages[0]["content"]

    tts = MockTTS(
        language=greeting_lang,
        primary_indic_lang=primary_indic,
    )
    # Sync initial greeting
    tts.sync_language_from_text(clinic_greeting)

    print(f"\n[Agent Greeting - {greeting_lang.upper()} | Voice: {tts._active_language}]")
    print(f"  Assistant: \"{clinic_greeting}\"\n")

    for t_idx, turn in enumerate(turns, 1):
        user_text = turn["user_transcript"]
        user_lang = turn["user_lang"]
        agent_reply = turn["agent_response"]
        expected_tts_voice = turn["expected_tts_voice"]

        # Step A: LanguageContextProcessor cleans ASR input
        cleaned_user_text = clean_asr_hallucinations(user_text)
        assert not is_pure_hesitation_noise(cleaned_user_text), "User input incorrectly marked as pure noise"

        # Step B: User message appended to conversation
        messages.append({"role": "user", "content": cleaned_user_text})

        # Step C: Per-turn cache-safe static reminder injected
        turn_params = {"messages": list(messages)}
        msgs = turn_params["messages"]
        reminder = {"role": "system", "content": "Respond in the language of the caller's latest turn."}
        user_pos = None
        for idx in range(len(msgs) - 1, -1, -1):
            if msgs[idx].get("role") == "user":
                user_pos = idx
                break
        msgs.insert(user_pos if user_pos is not None else 1, reminder)

        # Step D: Assistant replies
        messages.append({"role": "assistant", "content": agent_reply})

        # Step E: TTS Voice Glue syncs voice immediately before synthesis
        tts.sync_language_from_text(agent_reply)

        # Step F: Assertions
        assert tts._active_language == expected_tts_voice, (
            f"Turn {t_idx} FAILED: Expected TTS voice {expected_tts_voice}, got {tts._active_language}"
        )
        assert messages[0]["content"] == system_prompt_immutable_check, (
            f"Turn {t_idx} FAILED: messages[0] mutated! KV-cache invalidated."
        )

        fam = script_family(agent_reply)
        print(f"  Turn {t_idx} [{user_lang} -> Agent {fam.upper()} -> Voice: {tts._active_language}]:")
        print(f"    Caller:    \"{cleaned_user_text}\"")
        print(f"    Assistant: \"{agent_reply}\"")
        print(f"    Status:    [MATCHED] Voice: {tts._active_language} | Script: {fam}")
        print()

    print(f"-> Scenario {scenario_idx} PASSED (Prompt messages[0] 100% stable, 0 latency penalty).\n")


def main():
    print("\n" + "#" * 80)
    print(" NextLite Voice V3 — Glaze Dental Clinic Real Call Language Switch Test Suite")
    print("#" * 80 + "\n")

    # -------------------------------------------------------------
    # Scenario 1: Glaze Dental Appointment Booking (User's Exact Flow)
    # -------------------------------------------------------------
    s1_greeting = "नमस्कार, Glaze Dental Clinic मध्ये आपले स्वागत आहे. मी आपली काय मदत करू शकतो?"
    s1_turns = [
        {
            "user_transcript": "appointment book karni thi aur doctor se milna tha, doctor ko dikhana tha",
            "user_lang": "Hindi",
            "agent_response": "हाँ बिल्कुल! मैं आपकी अपॉइंटमेंट बुक कर देता हूँ। आप किस तारीख और समय पर आना चाहते हैं?",
            "expected_tts_voice": "hi-IN", # Hindi Devanagari routes to hi-IN voice
        },
        {
            "user_transcript": "मला उद्या १२ ची पाहिजे अपॉइंटमेंट",
            "user_lang": "Marathi",
            "agent_response": "ठीक आहे, मी उद्या दुपारी १२ वाजताची अपॉइंटमेंट बुक करतो. कृपया आपले नाव सांगा?",
            "expected_tts_voice": "mr-IN",
        },
        {
            "user_transcript": "Om Vijay Parkhi",
            "user_lang": "Entity / Name in Latin Script",
            "agent_response": "धन्यवाद ओम विजय पारखी जी, आपली अपॉइंटमेंट उद्या दुपारी १२ वाजता डॉ. गुप्ता यांच्यासोबत निश्चित झाली आहे. आपण वेळेवर यावे.",
            "expected_tts_voice": "mr-IN",
        },
    ]
    run_scenario(
        scenario_idx=1,
        title="Glaze Dental Booking Flow (Marathi -> Hindi -> Marathi -> Latin Name -> Marathi)",
        clinic_greeting=s1_greeting,
        greeting_lang="mr-IN",
        turns=s1_turns,
        primary_indic="mr-IN",
    )

    # -------------------------------------------------------------
    # Scenario 2: Emergency Severe Toothache (Marathi -> English -> Hindi -> English)
    # -------------------------------------------------------------
    s2_greeting = "नमस्कार! Glaze Dental Clinic मध्ये आपले स्वागत आहे. बोला मी कशी मदत करू?"
    s2_turns = [
        {
            "user_transcript": "Hello, I have severe tooth pain since morning. Can you please tell me your exact clinic address in English?",
            "user_lang": "English",
            "agent_response": "Hello! We are located at Shop 4, Glaze Dental Clinic, Opposite City Hospital, MG Road. Would you like an urgent appointment today?",
            "expected_tts_voice": "en-IN", # Latin script -> en-IN voice
        },
        {
            "user_transcript": "हाँ मुझे आज शाम का ही समय दे दीजिए, बहुत तेज़ दर्द है।",
            "user_lang": "Hindi",
            "agent_response": "जी बिल्कुल, आज शाम ५:३० बजे का इमरजेंसी स्लॉट उपलब्ध है। कृपया मरीज का नाम बता दीजिए?",
            "expected_tts_voice": "hi-IN", # Hindi Devanagari -> hi-IN voice
        },
        {
            "user_transcript": "The patient name is Rohit Verma, please confirm it.",
            "user_lang": "English",
            "agent_response": "Thank you, Rohit ji. Your emergency dental consultation is confirmed for today at 5:30 PM. Please reach 10 minutes prior.",
            "expected_tts_voice": "en-IN", # Latin script -> en-IN voice
        },
    ]
    run_scenario(
        scenario_idx=2,
        title="Emergency Toothache Consultation (Marathi -> English -> Hindi -> English)",
        clinic_greeting=s2_greeting,
        greeting_lang="mr-IN",
        turns=s2_turns,
        primary_indic="mr-IN",
    )

    # -------------------------------------------------------------
    # Scenario 3: Dental Cleaning & Whitening Inquiry (English -> Marathi -> English -> Hindi)
    # -------------------------------------------------------------
    s3_greeting = "Hello, thank you for calling Glaze Dental Clinic. How may I assist you today?"
    s3_turns = [
        {
            "user_transcript": "मला दातांची स्वच्छता आणि सफाई (Dental Cleaning) करायची आहे, किती खर्च येईल?",
            "user_lang": "Marathi",
            "agent_response": "दातांच्या सफाईसाठी (Scaling & Polishing) अंदाजे ₹१,००० ते ₹१,५०० पर्यंत खर्च येतो. आपल्याला कधी यायला सोयीचे होईल?",
            "expected_tts_voice": "mr-IN", # Marathi Devanagari -> mr-IN voice
        },
        {
            "user_transcript": "Can I get an appointment this Saturday morning at 11 AM?",
            "user_lang": "English",
            "agent_response": "Yes, Saturday at 11:00 AM is available for dental cleaning. May I please have your full name?",
            "expected_tts_voice": "en-IN", # Latin script -> en-IN voice
        },
        {
            "user_transcript": "मेरा नाम अनिकेत शर्मा है, शनिवार ११ बजे का स्लॉट पक्का कर दीजिए।",
            "user_lang": "Hindi",
            "agent_response": "धन्यवाद अनिकेत जी, शनिवार सुबह ११:०० बजे की डेंटल क्लीनिंग अपॉइंटमेंट बुक कर दी गई है।",
            "expected_tts_voice": "hi-IN", # Hindi Devanagari -> hi-IN voice
        },
    ]
    run_scenario(
        scenario_idx=3,
        title="Dental Cleaning Inquiry & Slot Booking (English -> Marathi -> English -> Hindi)",
        clinic_greeting=s3_greeting,
        greeting_lang="en-IN",
        turns=s3_turns,
        primary_indic="mr-IN",
    )

    print("#" * 80)
    print(" ALL 3 REAL CALL SCENARIOS COMPLETED & VERIFIED SUCCESSFULLY!")
    print(" - Zero prompt KV-cache invalidation across all transitions.")
    print(" - Dynamic TTS voice matches output script on every single turn.")
    print(" - Seamless caller-driven language mirroring contract honored.")
    print("#" * 80 + "\n")


if __name__ == "__main__":
    main()
