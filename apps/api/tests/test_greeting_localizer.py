import pytest
from app.domain.greeting_localizer import localize_greeting, localize_business_name, is_already_localized


def test_localize_business_name_dental():
    # Marathi
    assert localize_business_name("Glaze Dental Clinic", "mr-IN") == "Glaze दातांचा दवाखाना"
    assert localize_business_name("Smile Dental Care", "mr") == "Smile दातांचा दवाखाना"
    assert localize_business_name("City Dental Hospital", "mr") == "City दातांचा दवाखाना"

    # Hindi
    assert localize_business_name("Glaze Dental Clinic", "hi-IN") == "Glaze दांतों का दवाखाना"
    assert localize_business_name("Smile Dental Care", "hi") == "Smile दांतों का दवाखाना"

    # English stays untranslated
    assert localize_business_name("Glaze Dental Clinic", "en-IN") == "Glaze Dental Clinic"


def test_localize_business_name_eye_care():
    assert localize_business_name("Apex Eye Hospital", "mr-IN") == "Apex डोळ्यांचा दवाखाना"
    assert localize_business_name("Apex Eye Care", "hi-IN") == "Apex आंखों का अस्पताल"


def test_localize_business_name_pediatric():
    assert localize_business_name("Sunrise Children Hospital", "mr-IN") == "Sunrise लहान मुलांचा दवाखाना"
    assert localize_business_name("Sunrise Children Hospital", "hi-IN") == "Sunrise बच्चों का अस्पताल"


def test_localize_business_name_orthopedic():
    assert localize_business_name("Shree Orthopedic Clinic", "mr-IN") == "Shree हाडांचा दवाखाना"
    assert localize_business_name("Shree Orthopedic Clinic", "hi-IN") == "Shree हड्डियों का अस्पताल"


def test_localize_business_name_dermatology():
    assert localize_business_name("Clear Skin Clinic", "mr-IN") == "Clear त्वचारोग दवाखाना"
    assert localize_business_name("Clear Skin & Hair Clinic", "hi-IN") == "Clear त्वचा का अस्पताल"


def test_localize_business_name_general_hospital():
    assert localize_business_name("City Hospital", "mr-IN") == "City रुग्णालय"
    assert localize_business_name("City Hospital", "hi-IN") == "City अस्पताल"


def test_localize_business_name_non_medical():
    # Non-medical businesses should retain their exact names
    assert localize_business_name("Aura Unisex Salon", "mr-IN") == "Aura Unisex Salon"
    assert localize_business_name("Apex Legal Services", "hi-IN") == "Apex Legal Services"


def test_marathi_greeting_with_dental_clinic():
    raw = "Welcome to Glaze Dental Clinic. How can I help you today?"
    res = localize_greeting(
        raw,
        primary_lang="mr-IN",
        business_name="Glaze Dental Clinic",
        is_male=True,
        language_style="pure",
    )
    assert res == "नमस्कार! Glaze दातांचा दवाखाना मध्ये तुमचं स्वागत आहे. मी तुमची काय मदत करू शकतो?"


def test_marathi_greeting_female_mixed_style():
    raw = "Welcome to Glaze Dental Clinic. How can I help you today?"
    res = localize_greeting(
        raw,
        primary_lang="mr-IN",
        business_name="Glaze Dental Clinic",
        is_male=False,
        language_style="mixed",
    )
    assert res == "नमस्कार! Glaze दातांचा दवाखाना मध्ये तुमचं स्वागत आहे. मी तुमची काय help करू शकते?"


def test_hindi_greeting_with_dental_clinic():
    raw = "Welcome to Glaze Dental Clinic. How can I help you today?"
    res = localize_greeting(
        raw,
        primary_lang="hi-IN",
        business_name="Glaze Dental Clinic",
        is_male=True,
        language_style="pure",
    )
    assert res == "नमस्ते! Glaze दांतों का दवाखाना में आपका स्वागत है। मैं आपकी क्या मदद कर सकता हूँ?"


def test_marathi_greeting_with_agent_intro():
    raw = "Hello, I am Maya from Glaze Dental Clinic. How can I assist you?"
    res = localize_greeting(
        raw,
        primary_lang="mr-IN",
        business_name="Glaze Dental Clinic",
        agent_name="Maya",
        is_male=False,
        language_style="pure",
    )
    assert res == "नमस्कार! मी Maya, Glaze दातांचा दवाखाना मधून बोलत आहे. मी तुमची काय मदत करू शकते?"


def test_already_localized_with_template_placeholder():
    raw = "नमस्कार! {businessName} मध्ये तुमचं स्वागत आहे. मी तुमची काय मदत करू शकतो?"
    res = localize_greeting(
        raw,
        primary_lang="mr-IN",
        business_name="Glaze Dental Clinic",
    )
    assert res == "नमस्कार! Glaze दातांचा दवाखाना मध्ये तुमचं स्वागत आहे. मी तुमची काय मदत करू शकतो?"
