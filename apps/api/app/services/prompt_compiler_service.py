import zoneinfo
from datetime import datetime
from typing import Optional, Dict, Any, List

class PromptCompilerService:
    """
    Authoritative Prompt Compiler for NextLite Voice V3.
    Strictly separates Universal Runtime Safety from Dynamic Temporal Context,
    Multilingual Rules, and Business / Template Context.
    """

    UNIVERSAL_RUNTIME_SAFETY = """# UNIVERSAL TELEPHONE RUNTIME RULES (STRICT & AUTHORITATIVE)
1. You are a real-time telephone voice assistant. Keep all responses brief, natural, concise (1-2 sentences maximum per turn), and conversational.
2. Under no circumstances may you output markdown formatting, bullet points, asterisks, tables, or code blocks. Speak only plain conversational text.
3. ANTI-HALLUCINATION: Never guess or invent appointment slots, pricing, or company policies. Always call query_knowledge_base or book_appointment before confirming details.
4. UUID SUPPRESSION: Never speak raw database UUIDs or internal system identifiers to the caller. Only speak customer-friendly appointment numbers (e.g. APT-1042) or lead references.
5. NUMBERS: Read phone numbers and reference numbers digit by digit clearly.
6. TOOL CONFIRMATION: When booking an appointment or creating a callback request, always verbally confirm the date, time, and service with the caller.
"""

    def compile_temporal_context(self, timezone_str: str = "Asia/Kolkata") -> str:
        try:
            tz = zoneinfo.ZoneInfo(timezone_str)
        except Exception:
            tz = zoneinfo.ZoneInfo("Asia/Kolkata")
        
        now = datetime.now(tz)
        formatted_date = now.strftime("%A, %B %d, %Y")
        formatted_time = now.strftime("%I:%M %p")

        return f"""# TEMPORAL CONTEXT
- Current Timezone: {timezone_str}
- Current Date: {formatted_date}
- Current Time: {formatted_time}
- Relative Day References: Today is {now.strftime('%A')}. When a caller says 'tomorrow', refer to the day immediately after {now.strftime('%A')}.
"""

    def compile_multilingual_context(self, primary_lang: str, supported_langs: List[str]) -> str:
        langs_str = ", ".join(supported_langs)
        return f"""# MULTILINGUAL & CODE-SWITCHING RULES
- Primary Language: {primary_lang}
- Supported Languages: {langs_str}
- Code-Switching Policy: If the caller speaks in Hindi, Marathi, Hinglish, or Minglish, respond naturally in the exact same language and dialect without unnecessary translation delays.
"""

    def compile_system_prompt(
        self,
        base_prompt: str,
        timezone: str = "Asia/Kolkata",
        primary_lang: str = "en-IN",
        supported_langs: Optional[List[str]] = None,
        business_context: Optional[str] = None
    ) -> str:
        supported_langs = supported_langs or ["en-IN"]
        sections = [
            self.UNIVERSAL_RUNTIME_SAFETY,
            self.compile_temporal_context(timezone),
            self.compile_multilingual_context(primary_lang, supported_langs),
            f"# AGENT CORE INSTRUCTIONS & BUSINESS ROLE\n{base_prompt.strip()}"
        ]
        if business_context:
            sections.append(f"# BUSINESS CONTEXT & KNOWLEDGE\n{business_context.strip()}")

        return "\n\n".join(sections)

prompt_compiler = PromptCompilerService()
