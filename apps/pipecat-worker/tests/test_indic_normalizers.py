"""Unit tests for Indic Normalizers (Age, Time, Service Title)."""

import pytest
from app.tools.indic_normalizers import (
    normalize_indic_age,
    normalize_indic_time,
    sanitize_service_title,
    normalize_devanagari_digits,
)

def test_devanagari_digits_normalization():
    assert normalize_devanagari_digits("२२") == "22"
    assert normalize_devanagari_digits("१०:३०") == "10:30"
    assert normalize_devanagari_digits("०१२३४५६७८९") == "0123456789"

def test_age_normalization():
    # Digits
    assert normalize_indic_age("22") == "22"
    assert normalize_indic_age("35") == "35"
    assert normalize_indic_age(28) == "28"
    
    # Devanagari numerals
    assert normalize_indic_age("२२") == "22"
    assert normalize_indic_age("३५") == "35"
    
    # Marathi words
    assert normalize_indic_age("बावीस") == "22"
    assert normalize_indic_age("पंचवीस") == "25"
    assert normalize_indic_age("पन्नास") == "50"
    assert normalize_indic_age("तीस") == "30"
    assert normalize_indic_age("अठरा") == "18"
    
    # Hindi words
    assert normalize_indic_age("बाईस") == "22"
    assert normalize_indic_age("पच्चीस") == "25"
    assert normalize_indic_age("चालीस") == "40"
    
    # Phrase with surrounding words
    assert normalize_indic_age("माझं वय बावीस वर्ष आहे") == "22"
    assert normalize_indic_age("Age is 38 years") == "38"
    assert normalize_indic_age("वय २२") == "22"

    # None / Empty
    assert normalize_indic_age(None) is None
    assert normalize_indic_age("") is None
    assert normalize_indic_age("None") is None

def test_time_normalization():
    # Marathi special fractions
    assert normalize_indic_time("साडे एक वाजता") == "01:30 PM"
    assert normalize_indic_time("दीड वाजता") == "01:30 PM"
    assert normalize_indic_time("अडीच वाजता") == "02:30 PM"
    assert normalize_indic_time("साडे दोन") == "02:30 PM"
    assert normalize_indic_time("साडे चार") == "04:30 PM"
    assert normalize_indic_time("साडे दहा") == "10:30 AM"

    # Marathi fractions: सव्वा and पावणे
    assert normalize_indic_time("सव्वा दोन") == "02:15 PM"
    assert normalize_indic_time("सव्वा दहा") == "10:15 AM"
    assert normalize_indic_time("पावणे चार") == "03:45 PM"
    assert normalize_indic_time("पावणे अकरा") == "10:45 AM"

    # Word hours with periods
    assert normalize_indic_time("सहा वाजता") == "06:00 PM"
    assert normalize_indic_time("सकाळी दहा वाजता") == "10:00 AM"
    assert normalize_indic_time("संध्याकाळी सात") == "07:00 PM"
    assert normalize_indic_time("दुपारी एक वाजता") == "01:00 PM"
    assert normalize_indic_time("दुपारी बारा वाजता") == "12:00 PM"

    # Devanagari numerals
    assert normalize_indic_time("१०:३० AM") == "10:30 AM"
    assert normalize_indic_time("०६:०० PM") == "06:00 PM"

    # Standard digital formats
    assert normalize_indic_time("11:30 AM") == "11:30 AM"
    assert normalize_indic_time("3:00 pm") == "03:00 PM"
    assert normalize_indic_time("17:00") == "05:00 PM"
    assert normalize_indic_time("10:00") == "10:00 AM"
    assert normalize_indic_time("12:30") == "12:30 PM"

def test_service_title_sanitization():
    # Noisy / filler phrases
    assert sanitize_service_title("Nala Nayika") == "General Consultation"
    assert sanitize_service_title("mala nahi ka") == "General Consultation"
    assert sanitize_service_title("नाही का") == "General Consultation"
    assert sanitize_service_title("नाळ नायिका") == "General Consultation"
    assert sanitize_service_title("") == "General Consultation"
    assert sanitize_service_title(None) == "General Consultation"
    assert sanitize_service_title("None") == "General Consultation"

    # Valid service titles
    assert sanitize_service_title("Dental Checkup") == "Dental Checkup"
    assert sanitize_service_title("Root Canal Treatment") == "Root Canal Treatment"
    assert sanitize_service_title("Cardiology Consultation") == "Cardiology Consultation"
