import pytest
from app.language_manager import (
    ConversationLanguageManager,
    normalize_language_code,
    get_language_display_name,
    match_supported_language,
    detect_explicit_language_request,
    is_reliable_automatic_switch,
    build_language_instruction,
)

def test_normalize_language_code():
    assert normalize_language_code("hi") == "hi-IN"
    assert normalize_language_code("en") == "en-IN"
    assert normalize_language_code("mr") == "mr-IN"
    assert normalize_language_code("unknown") == "unknown"
    assert normalize_language_code("en-us") == "en-US"

def test_get_language_display_name():
    assert get_language_display_name("hi-IN") == "Hindi"
    assert get_language_display_name("en-IN") == "English"
    assert get_language_display_name("mr-IN") == "Marathi"

def test_match_supported_language():
    supported = ["en-IN", "hi-IN", "mr-IN"]
    assert match_supported_language("hi", supported) == "hi-IN"
    assert match_supported_language("mr-IN", supported) == "mr-IN"
    assert match_supported_language("ta-IN", supported) is None
    assert match_supported_language("en-US", supported) == "en-IN"

def test_detect_explicit_language_request():
    assert detect_explicit_language_request("speak in hindi") == "hi-IN"
    assert detect_explicit_language_request("hindi mein baat karo") == "hi-IN"
    assert detect_explicit_language_request("मराठीत बोला") == "mr-IN"
    assert detect_explicit_language_request("switch to english please") == "en-IN"
    assert detect_explicit_language_request("what is your name") is None

def test_is_reliable_automatic_switch():
    # 1. Hindi -> English with Hinglish
    assert is_reliable_automatic_switch("Sir appointment book karna hai", "en-IN", "hi-IN") is False
    assert is_reliable_automatic_switch("I want to book an appointment please", "en-IN", "hi-IN") is True
    # 2. Marathi -> English with Minglish
    assert is_reliable_automatic_switch("Mala appointment book karaychi ahe", "en-IN", "mr-IN") is False
    # 3. Short utterance
    assert is_reliable_automatic_switch("okay", "en-IN", "hi-IN") is False
    # 4. English -> Hindi
    assert is_reliable_automatic_switch("मुझे appointment चाहिए", "hi-IN", "en-IN") is True

def test_manager_initialization():
    manager = ConversationLanguageManager(
        primary="en",
        supported_languages=["en", "hi"],
        auto_detect_enabled=True,
        language_switching_enabled=True,
    )
    assert manager.primary_language == "en-IN"
    assert manager.supported_languages == ["en-IN", "hi-IN"]
    assert manager.current_language == "en-IN"

def test_single_language_never_switches():
    manager = ConversationLanguageManager(primary="hi")
    res = manager.process_user_turn("speak in english")
    assert res.switched is False
    assert manager.current_language == "hi-IN"
    assert res.decision == "REJECTED"

def test_explicit_supported_switch():
    manager = ConversationLanguageManager(primary="en", supported_languages=["en", "hi"])
    res = manager.process_user_turn("hindi mein baat karo")
    assert res.switched is True
    assert res.current_language == "hi-IN"
    assert res.reason == "explicit"
    assert manager.current_language == "hi-IN"

def test_explicit_unsupported_does_not_switch():
    manager = ConversationLanguageManager(primary="en", supported_languages=["en", "hi"])
    res = manager.process_user_turn("मराठीत बोला") # Marathi not supported
    assert res.switched is False
    assert manager.current_language == "en-IN"

def test_automatic_reliable_switch():
    manager = ConversationLanguageManager(primary="en", supported_languages=["en", "hi"])
    res = manager.process_user_turn("मुझे appointment चाहिए", detected_language_code="hi-IN")
    assert res.switched is True
    assert res.current_language == "hi-IN"

def test_automatic_unreliable_switch_hinglish():
    manager = ConversationLanguageManager(primary="hi", supported_languages=["en", "hi"])
    res = manager.process_user_turn("Sir appointment book karna hai", detected_language_code="en-IN")
    assert res.switched is False
    assert res.decision == "REJECTED"
    assert manager.current_language == "hi-IN"

def test_latest_explicit_wins():
    manager = ConversationLanguageManager(primary="hi", supported_languages=["en", "hi", "mr"])
    manager.process_user_turn("मराठीत बोला")
    assert manager.current_language == "mr-IN"
    manager.process_user_turn("switch to english")
    assert manager.current_language == "en-IN"

def test_disabled_auto_detect():
    manager = ConversationLanguageManager(
        primary="en", 
        supported_languages=["en", "hi"], 
        auto_detect_enabled=False
    )
    res = manager.process_user_turn("मुझे appointment चाहिए", detected_language_code="hi-IN")
    assert res.switched is False
    assert res.decision == "REJECTED"

def test_disabled_switching():
    manager = ConversationLanguageManager(
        primary="en", 
        supported_languages=["en", "hi"], 
        language_switching_enabled=False
    )
    res = manager.process_user_turn("मुझे appointment चाहिए", detected_language_code="hi-IN")
    assert res.switched is False
    assert res.decision == "REJECTED"
