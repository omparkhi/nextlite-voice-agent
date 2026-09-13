import sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "apps" / "pipecat-worker"))

from app.language_manager import (
    ConversationLanguageManager,
    build_language_instruction,
    build_full_instructions,
)


def test_hindi_to_marathi_mid_call_switch_sequence():
    """
    SECTION 8 LANGUAGE SEQUENCE TEST:
    Tests turn-by-turn transition from Hindi start to Marathi mid-call switch:
    Turn 1 (Hindi): 'Aaj appointment ke liye call kiya hai.'
    Turn 2 (Marathi Switch): 'Ho, mala udya booking karaychi aahe.'
    """
    manager = ConversationLanguageManager(
        primary="hi-IN",
        supported_languages=["en-IN", "hi-IN", "mr-IN"],
        auto_detect_enabled=True,
        language_switching_enabled=True,
    )

    assert manager.current_language == "hi-IN"

    # Turn 1: Hindi utterance
    turn_1 = manager.process_user_turn(
        transcript="Aaj appointment ke liye call kiya hai.",
        detected_language_code="hi-IN",
    )
    assert turn_1.current_language == "hi-IN"
    assert turn_1.switched is False

    instr_turn_1 = build_language_instruction(manager.current_language)
    assert "Active Conversation Language: Hindi (hi-IN)" in instr_turn_1
    assert "Hinglish" in instr_turn_1

    # Turn 2: Caller switches into Marathi
    turn_2 = manager.process_user_turn(
        transcript="Ho, mala udya booking karaychi aahe.",
        detected_language_code="mr-IN",
    )
    assert turn_2.switched is True
    assert turn_2.previous_language == "hi-IN"
    assert turn_2.current_language == "mr-IN"
    assert manager.current_language == "mr-IN"

    # Verify prompt instruction reflects Marathi / Minglish policy
    instr_turn_2 = build_language_instruction(manager.current_language)
    assert "Active Conversation Language: Marathi (mr-IN)" in instr_turn_2
    assert "Minglish" in instr_turn_2

    # Turn 3: Caller continues speaking Marathi
    turn_3 = manager.process_user_turn(
        transcript="Dahavya vajta vel aahe ka?",
        detected_language_code="mr-IN",
    )
    assert turn_3.switched is False
    assert turn_3.current_language == "mr-IN"
    assert manager.current_language == "mr-IN"
