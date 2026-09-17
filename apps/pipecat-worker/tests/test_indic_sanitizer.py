"""Unit tests for IndicTextSanitizer."""

from app.indic_sanitizer import sanitize_indic_tts_text


def test_sanitize_indic_tts_text_names_and_locations():
    input_text = "Hello Mr. Deshmukh from Kothrud Pune"
    result = sanitize_indic_tts_text(input_text, language="mr-IN")
    assert "देशमुख" in result
    assert "कोथरूड" in result
    assert "पुणे" in result


def test_sanitize_indic_tts_text_english_language_passthrough():
    input_text = "Hello Mr. Deshmukh from Pune"
    result = sanitize_indic_tts_text(input_text, language="en-IN")
    assert result == input_text
