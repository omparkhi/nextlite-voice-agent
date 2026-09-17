import pytest
from app.indic_sanitizer import sanitize_indic_tts_text, PROPER_NOUN_DEVANA_MAP
from app.runtime_config_client import RuntimeNudgeConfig, RuntimeBehaviorConfig


def test_indic_sanitizer_converts_tumchi_and_english_loanwords():
    """Verify sanitize_indic_tts_text converts romanized Marathi pronouns and English loanwords to Devanagari."""
    text_mr = "tumchi appointment book zali ahe. doctor slot nakki ahe."
    sanitized_mr = sanitize_indic_tts_text(text_mr, language="mr-IN")
    
    assert "तुमची" in sanitized_mr
    assert "अपॉइंटमेंट" in sanitized_mr
    assert "बुक" in sanitized_mr
    assert "झाली" in sanitized_mr
    assert "आहे" in sanitized_mr
    assert "डॉक्टर" in sanitized_mr
    assert "स्लॉट" in sanitized_mr
    assert "नक्की" in sanitized_mr


def test_runtime_nudge_config_contract():
    """Verify RuntimeNudgeConfig defaults and contract model aliases."""
    cfg = RuntimeNudgeConfig(
        enabled=True,
        delay_seconds=5,
        messages=["Are you there?"],
        max_unanswered_nudges=2,
    )
    assert cfg.enabled is True
    assert cfg.delay_seconds == 5
    assert cfg.messages == ["Are you there?"]
    assert cfg.max_unanswered_nudges == 2

    behavior = RuntimeBehaviorConfig(nudges=cfg)
    assert behavior.nudges.delay_seconds == 5
