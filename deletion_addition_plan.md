Language Switch — Deletion & Addition Plan (file-by-file)
Repo: omparkhi/nextlite-voice-agent · branch migration/node-to-python · commit 9c4103b Companion to 15 (architecture), 16 (implementation plan), 17 (final minimal architecture). PLAN ONLY — nothing changed yet.

Principle: language switching is Sarvam's job (Saaras hears, sarvam-105b understands, Bulbul speaks). Our job is to CONFIGURE, not to re-implement the models. Delete the second brain; keep one piece of glue for the voice.

1. Summary table



#	File	Action	Lines	Why
1	language_manager.py	DELETE decider + second detector + compensation + prompt builders	61-105, 159-187, 190-233, 236-337	duplicates the models' language handling
2	language_manager.py	KEEP code helpers + script classifier	26-58, 108-156	used by the glue (output-script -> voice)
3	language_manager.py	ADD one static mirror directive	new	replaces the per-language prompt machinery
4	language_processor.py	DELETE manager call + prompt rebuild	22, 124-129, 133-145	the decider + the latency no-op
5	language_processor.py	KEEP hallucination cleaning + noise filter + TTS update	31-79, 130-132	real front-end concerns
6	main.py	DELETE manager construction + wiring + reads	52, 2384-2390, 3170-3176, and the current_language reads	the manager is gone
7	main.py	CHANGE startup prompt build to the static directive	3098-3103	one directive, compiled once
8	main.py	CHANGE per-turn directive to a static reminder	1177-1195	no manager to read from
9	main.py	ADD the glue: set TTS language from the LLM output	new helper	the ONE justified addition
10	config.py	KEEP as-is (codemix, VAD)	—	already correct
2. File-by-file
2.1 language_manager.py (338 lines -> ~130)
DELETE — the decider:

class ConversationLanguageManager (246-337) — the platform decider.
class ProcessTurnResult (236-243) — its result type.
def process_user_turn (292-337) — the decision logic (ASR tag + py3langid + hysteresis).
def detect_transcript_language (190-233) — a SECOND language detector (py3langid); Saaras already detects.
DELETE — the compensation layer:

def script_consistent (159-187) — existed only to guard the ASR tag. Gone with the decider.
DELETE — the per-language prompt machinery:

def build_language_instruction (61-74)
def build_lean_language_instruction (76-87)
def build_full_instructions (90-105) (These build a directive whose text is identical for every language — the language name is computed but never used — so they add nothing and are called per switch, causing the cache invalidation. Replace with one constant.)
KEEP (used by the glue):

def normalize_language_code (26-37)
def get_language_display_name (40-44)
def match_supported_language (47-58)
SCRIPT_RANGES (108-122), _COMPILED_SCRIPTS (124)
LANGUAGE_TO_SCRIPT_FAMILY (126-147)
def script_family (150-156) — the output-script classifier for the voice glue.
ADD — one static directive:

python


LANGUAGE_MIRROR_DIRECTIVE = (
    "\n\n=== LANGUAGE ===\n"
    "Always respond in the language of the caller's LATEST utterance. "
    "If the caller speaks a different language or explicitly asks to switch, follow the "
    "caller immediately. Never persist in a previous language. Never mix languages in one turn."
)
2.2 language_processor.py (149 lines -> ~95)
DELETE — the decider call (124-129):

python


            if self._language_manager:
                turn_result = self._language_manager.process_user_turn(transcript, stt_lang)
                if turn_result.switched:
                    logger.info(
                        f"[LanguageContextProcessor] Language switched {turn_result.previous_language} -> {turn_result.current_language} | reason={turn_result.reason}"
                    )
DELETE — the prompt rebuild (133-145):

python


                    # 2. Update conversation context system prompt
                    if self._conversation_context and self._base_system_prompt:
                        updated_prompt = build_full_instructions(
                            self._base_system_prompt,
                            turn_result.current_language,
                            language_style=self._language_manager.language_style,
                        )
                        if self._conversation_context.messages:
                            self._conversation_context.messages[0]["content"] = updated_prompt
                        await self.push_frame(
                            LLMMessagesUpdateFrame(messages=self._conversation_context.messages),
                            direction,
                        )
WHY: build_full_instructions returns the same generic directive for any language, so this changes nothing semantically — but rewriting messages[0] invalidates the LLM KV cache and spikes first-token latency on every switch. Pure cost.

DELETE — the now-unused TTS update (131-132)? No — KEEP the TTS update only if the glue is NOT used; with the glue (output-script), the switch no longer needs this call here. Remove it once the glue is in place.

DELETE — imports: build_full_instructions (22), LLMMessagesUpdateFrame (10, 18), and the _language_manager / _conversation_context / _base_system_prompt ctor params (88-101) if unused after the above.

KEEP:

clean_asr_hallucinations (31-58), is_pure_hesitation_noise (61-79) — front-end cleaning.
The TranscriptionFrame cleaning + noise suppression (106-115).
After this, the processor's job is: clean the transcript, drop noise, forward. No decision.

2.3 main.py
DELETE — manager construction (2384-2390):

python


        language_manager = ConversationLanguageManager(
            primary=runtime_config.language.primary,
            supported_languages=runtime_config.language.supported_languages,
            auto_detect_enabled=runtime_config.language.auto_detect_enabled,
            language_switching_enabled=runtime_config.language.language_switching_enabled,
            language_style=runtime_config.language.language_style,
        )
Replace with a plain value:

python


        primary_language = runtime_config.language.primary or "en-IN"
DELETE — the manager import (52):

python


from app.language_manager import ConversationLanguageManager, build_full_instructions
Replace with:

python


from app.language_manager import normalize_language_code, get_language_display_name, script_family, LANGUAGE_MIRROR_DIRECTIVE
CHANGE — startup prompt build (3098-3103): BEFORE:

python


        initial_system_prompt = build_full_instructions(
            base_system_prompt_with_temporal,
            language_manager.current_language,
            language_style=language_manager.language_style,
            lean_mode=is_lean_compression,
        )
AFTER:

python


        initial_system_prompt = f"{base_system_prompt_with_temporal}{LANGUAGE_MIRROR_DIRECTIVE}"
WHY: one static directive, compiled once. No per-language machinery.

CHANGE — per-turn directive (1177-1195): BEFORE: builds a directive naming self._language_manager.current_language. AFTER: a STATIC reminder (the manager is gone):

python


        msgs = params.get("messages", [])
        if msgs:
            reminder = {"role": "system", "content": "Respond in the language of the caller's latest turn."}
            user_idx = None
            for idx in range(len(msgs) - 1, -1, -1):
                if msgs[idx].get("role") == "user":
                    user_idx = idx
                    break
            msgs.insert(user_idx if user_idx is not None else 1, reminder)
(Kept as an APPENDED reminder — cache-safe. If the model mirrors reliably, this can be dropped entirely.)

DELETE — the manager wiring into the processor (3170-3176):

python


        language_processor = LanguageContextProcessor(
            language_manager=language_manager,
            conversation_context=conversation_context,
            base_system_prompt=base_system_prompt_with_temporal,
            tts_service=tts_service,
            stt_service=stt_service,
        )
AFTER:

python


        language_processor = LanguageContextProcessor()
REPLACE — every language_manager.current_language read with primary_language:

2409 (greeting cache key), 2428 (call session primaryLanguage), 2459, 2476 (TTS settings), 2978, 3100-3101 (prompt), 1216-1217. WHY: the language is now per-turn (from the LLM output). The STARTUP value is the primary language. The TTS voice is corrected per turn by the glue.
DELETE — the early-ack / filler language reads (927-928, 979-980, 1014-1015) — these read current_language for the filler phrases. Replace with primary_language, or (better) make the fillers use the last TTS-active language. Lowest priority; note only.

2.4 config.py
No change. STT_MODE="codemix" and the VAD values are already correct. Optionally apply the VAD tuning from doc 16 (FIX 3) separately.

2.5 NEW — the glue (output-script -> TTS voice)
Where: a small helper on InstrumentedSarvamTTSService, called just before synthesis of each LLM turn's text.

ADD:

python


    def sync_language_from_text(self, text: str):
        """Set the TTS voice from the LLM's OWN output script. Reliable because the
        output is unambiguous (Devanagari -> Indic, Latin -> English, etc.)."""
        from app.language_manager import script_family, normalize_language_code
        fam = script_family(text)
        mapping = {
            "devanagari": self._primary_indic_lang,   # e.g. "mr-IN" or "hi-IN"
            "latin": "en-IN",
            "tamil": "ta-IN", "telugu": "te-IN", "kannada": "kn-IN",
            "malayalam": "ml-IN", "bengali": "bn-IN", "gurmukhi": "pa-IN",
            "gujarati": "gu-IN", "arabic": "ur-IN",
        }
        target = mapping.get(fam)
        if target and target != self._active_language:
            self.update_language_context(target)
Call it once per LLM turn, on the final response text, BEFORE synthesis.
self._primary_indic_lang = the deployment's primary Indic language (for the Devanagari case; Marathi vs Hindi cannot be separated by script — known limitation).
Idempotent + fire-and-forget + retry (doc 16, FIX 2).
Why this is the ONE justified addition: the TTS needs a language code, and the ASR tag is unreliable. The LLM's output is reliable. This one helper replaces the entire manager.

3. Net effect



File	Before	After	Removed
language_manager.py	~338 lines	~130 lines	decider, 2nd detector, guard, prompt builders
language_processor.py	~149 lines	~95 lines	decider call, prompt rebuild
main.py	—	—	manager construction + ~12 current_language reads; +1 glue helper
Net	—	—	one component deleted, one helper added
4. Verification
rg -n "ConversationLanguageManager|process_user_turn|detect_transcript_language|build_full_instructions|LLMMessagesUpdateFrame|update_config" apps/pipecat-worker/app/ -> empty.
rg -n "current_language" apps/pipecat-worker/app/ -> only the TTS active language.
STT config log: mode=codemix | language=auto for the whole call.
End-to-end: greet Marathi -> speak Hindi (switch, no revert) -> name (correct) -> English (switch) -> book -> hangup. First-token latency must NOT spike on a switch turn.
5. Sequencing & risk
Add the static directive + the glue (non-breaking; run alongside the manager, compare).
Switch the processor to the glue; stop calling the manager decider.
Delete the manager + wiring + prompt rebuild.
Verify per §4.
Risk: LOW for the deletions (the prompt rebuild is a verified no-op; the manager only sets the voice). The glue is the only new behaviour — validate it on real calls (Devanagari -> Indic voice, Latin -> English) before deleting the manager.

Do NOT touch: the STT config, the hallucination cleaning, the tools, the tests.

6. One-line summary
Delete the second brain (the manager, the second detector, the prompt machinery, the prompt rebuild) and add one helper: set the TTS voice from the LLM's own output. Sarvam's models hear, understand, and speak; we configure the voice and nothing else.