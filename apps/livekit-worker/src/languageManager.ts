import { normalizeLanguage } from '@livekit/agents';

/** Mapping of BCP-47 language codes to display names */
export const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  'en-IN': 'English',
  'en-US': 'English',
  'en-GB': 'English',
  'en': 'English',
  'hi-IN': 'Hindi',
  'hi': 'Hindi',
  'mr-IN': 'Marathi',
  'mr': 'Marathi',
  'bn-IN': 'Bengali',
  'bn': 'Bengali',
  'gu-IN': 'Gujarati',
  'gu': 'Gujarati',
  'kn-IN': 'Kannada',
  'kn': 'Kannada',
  'ml-IN': 'Malayalam',
  'ml': 'Malayalam',
  'od-IN': 'Odia',
  'or-IN': 'Odia',
  'od': 'Odia',
  'or': 'Odia',
  'pa-IN': 'Punjabi',
  'pa': 'Punjabi',
  'ta-IN': 'Tamil',
  'ta': 'Tamil',
  'te-IN': 'Telugu',
  'te': 'Telugu',
  'as-IN': 'Assamese',
  'as': 'Assamese',
  'ur-IN': 'Urdu',
  'ur': 'Urdu',
  'ne-IN': 'Nepali',
  'ne': 'Nepali',
  'sa-IN': 'Sanskrit',
  'sa': 'Sanskrit',
  'sd-IN': 'Sindhi',
  'sd': 'Sindhi',
  'kok-IN': 'Konkani',
  'kok': 'Konkani',
  'ks-IN': 'Kashmiri',
  'ks': 'Kashmiri',
  'mai-IN': 'Maithili',
  'mai': 'Maithili',
  'doi-IN': 'Dogri',
  'doi': 'Dogri',
  'sat-IN': 'Santali',
  'sat': 'Santali',
  'mni-IN': 'Manipuri',
  'mni': 'Manipuri',
  'brx-IN': 'Bodo',
  'brx': 'Bodo',
};

/**
 * Get human-readable language name from a BCP-47 language code.
 */
export function getLanguageDisplayName(code: string): string {
  if (!code) return 'English';
  const normalized = normalizeLanguageCode(code);
  return LANGUAGE_DISPLAY_NAMES[normalized] || LANGUAGE_DISPLAY_NAMES[code] || code;
}

/**
 * Normalize language code to standard Indian BCP-47 tag (e.g. 'hi' -> 'hi-IN', 'en' -> 'en-IN').
 */
export function normalizeLanguageCode(code: string): string {
  if (!code) return 'en-IN';
  const trimmed = code.trim().replace('_', '-');
  if (trimmed.toLowerCase() === 'unknown') return 'unknown';

  const lower = trimmed.toLowerCase();
  const shortMap: Record<string, string> = {
    en: 'en-IN',
    hi: 'hi-IN',
    mr: 'mr-IN',
    bn: 'bn-IN',
    gu: 'gu-IN',
    kn: 'kn-IN',
    ml: 'ml-IN',
    od: 'od-IN',
    or: 'od-IN',
    pa: 'pa-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    as: 'as-IN',
    ur: 'ur-IN',
    ne: 'ne-IN',
    sa: 'sa-IN',
    sd: 'sd-IN',
    kok: 'kok-IN',
    ks: 'ks-IN',
    mai: 'mai-IN',
    doi: 'doi-IN',
    sat: 'sat-IN',
    mni: 'mni-IN',
    brx: 'brx-IN',
  };

  if (shortMap[lower]) {
    return shortMap[lower];
  }

  const parts = trimmed.split('-');
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }

  try {
    return normalizeLanguage(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * Check if candidate language matches any configured supported language.
 * Returns the matched supported language code or null if unsupported.
 */
export function matchSupportedLanguage(
  candidate: string,
  supportedLanguages: string[],
): string | null {
  if (!candidate || !supportedLanguages || supportedLanguages.length === 0) {
    return null;
  }
  const normCandidate = normalizeLanguageCode(candidate);
  const candPrefix = normCandidate.split('-')[0]?.toLowerCase() || '';

  // 1. Exact / normalized match
  for (const supported of supportedLanguages) {
    const normSupported = normalizeLanguageCode(supported);
    if (normSupported.toLowerCase() === normCandidate.toLowerCase()) {
      return normSupported;
    }
  }

  // 2. Base language prefix match (e.g. 'mr' matches 'mr-IN', 'en-US' matches 'en-IN')
  for (const supported of supportedLanguages) {
    const normSupported = normalizeLanguageCode(supported);
    const suppPrefix = normSupported.split('-')[0]?.toLowerCase() || '';
    if (suppPrefix && candPrefix && suppPrefix === candPrefix) {
      return normSupported;
    }
  }

  return null;
}

interface ExplicitLanguageRule {
  languageCode: string;
  patterns: RegExp[];
}

const EXPLICIT_LANGUAGE_RULES: ExplicitLanguageRule[] = [
  {
    languageCode: 'en-IN',
    patterns: [
      /(?:can|could|please|let'?s|would)\s+(?:you\s+)?(?:speak|talk|continue|switch)\s+(?:in|to|with)\s+english/i,
      /(?:speak|talk|continue|switch)\s+(?:in|to)\s+english/i,
      /talk\s+to\s+me\s+in\s+english/i,
      /can\s+you\s+speak\s+english/i,
      /\benglish\s+please\b/i,
      /\bswitch\s+to\s+english\b/i,
      /\benglish\s*me(?:in)?\s*(?:baat|bolo|batao|karo)\b/i,
      /\benglish\s*(?:madhe|it)\s*(?:bola|sanga)\b/i,
      /\bin\s+english\b/i,
      /\benglish\s+mein\b/i,
      /\bi\s+want\s+to\s+continue\s+in\s+english\b/i,
      /\bi\s+prefer\s+english\b/i,
    ],
  },
  {
    languageCode: 'hi-IN',
    patterns: [
      /हिंदी\s*में\s*(?:बात\s*करो|बोलो|बात\s*कीजिए|बात\s*कर\s*सकते\s*हो|संभाषण|बताओ|बताइए)/i,
      /हिन्दी\s*में\s*(?:बात\s*करो|बोलो|बात\s*कीजिए|बात\s*कर\s*सकते\s*हो|संभाषण|बताओ|बताइए)/i,
      /क्या\s*आप\s*हिंदी\s*में\s*बात\s*कर\s*सकते\s*हैं/i,
      /क्या\s*आप\s*हिन्दी\s*में\s*बात\s*कर\s*सकते\s*हैं/i,
      /हिंदी\s*में\s*बताओ/i,
      /हिंदी\s*में\s*बताइए/i,
      /हिंदी\s*बोलो/i,
      /\bhindi\s*me(?:in)?\s*(?:baat\s*karo|bolo|baat\s*kijiye|batao|bataiye)\b/i,
      /(?:can|could|please|let'?s|would)\s+(?:you\s+)?(?:speak|talk|continue|switch)\s+(?:in|to|with)\s+hindi/i,
      /(?:speak|talk|continue|switch)\s+(?:in|to)\s+hindi/i,
      /talk\s+to\s+me\s+in\s+hindi/i,
      /\bswitch\s+to\s+hindi\b/i,
      /\bhindi\s+please\b/i,
      /\bin\s+hindi\b/i,
      /\bhindi\s+mein\b/i,
    ],
  },
  {
    languageCode: 'mr-IN',
    patterns: [
      /मराठीत\s*(?:बोला|बोल|सांगा|संभाषण\s*करा)/i,
      /मराठी\s*मध्ये\s*(?:बोला|बोल|सांगा)/i,
      /तुम्ही\s*मराठीत\s*बोलू\s*शकता\s*का/i,
      /मराठी\s*भाषा\s*वापरा/i,
      /मराठी\s*बोला/i,
      /मराठी\s*सांगा/i,
      /\bmarathit\s*(?:bola|bol|sanga)\b/i,
      /\bmarathi\s*madhe\s*(?:bola|bol|sanga)\b/i,
      /(?:can|could|please|let'?s|would)\s+(?:you\s+)?(?:speak|talk|continue|switch)\s+(?:in|to|with)\s+marathi/i,
      /(?:speak|talk|continue|switch)\s+(?:in|to)\s+marathi/i,
      /talk\s+to\s+me\s+in\s+marathi/i,
      /\bswitch\s+to\s+marathi\b/i,
      /\bmarathi\s+please\b/i,
      /\bin\s+marathi\b/i,
    ],
  },
  {
    languageCode: 'bn-IN',
    patterns: [
      /বাংলায়\s*(?:বলুন|কথা\s*বলুন)/i,
      /(?:speak|talk|continue|switch)\s+(?:in|to)\s+bengali/i,
      /\bbangla\s+me(?:in)?\s+bolo\b/i,
    ],
  },
  {
    languageCode: 'gu-IN',
    patterns: [
      /ગુજરાતીમાં\s*(?:બોલો|વાત\s*કરો)/i,
      /(?:speak|talk|continue|switch)\s+(?:in|to)\s+gujarati/i,
      /\bgujarati\s+ma\s+bolo\b/i,
    ],
  },
  {
    languageCode: 'kn-IN',
    patterns: [
      /ಕನ್ನಡದಲ್ಲಿ\s*(?:ಮಾತನಾಡಿ|ಹೇಳಿ)/i,
      /(?:speak|talk|continue|switch)\s+(?:in|to)\s+kannada/i,
      /\bkannada\s+dalli\s+mathadi\b/i,
    ],
  },
  {
    languageCode: 'ml-IN',
    patterns: [
      /മലയാളത്തിൽ\s*സംസാരിക്കൂ/i,
      /(?:speak|talk|continue|switch)\s+(?:in|to)\s+malayalam/i,
    ],
  },
  {
    languageCode: 'pa-IN',
    patterns: [
      /ਪੰਜਾਬੀ\s*ਵਿੱਚ\s*(?:ਬੋਲੋ|ਗੱਲ\s*ਕਰੋ)/i,
      /(?:speak|talk|continue|switch)\s+(?:in|to)\s+punjabi/i,
      /\bpunjabi\s+vich\s+bolo\b/i,
    ],
  },
  {
    languageCode: 'ta-IN',
    patterns: [
      /தமிழில்\s*(?:பேசுங்கள்|பேசு)/i,
      /(?:speak|talk|continue|switch)\s+(?:in|to)\s+tamil/i,
      /\btamilil\s+pesunga\b/i,
    ],
  },
  {
    languageCode: 'te-IN',
    patterns: [
      /తెలుగులో\s*(?:మాట్లాడండి|చెప్పండి)/i,
      /(?:speak|talk|continue|switch)\s+(?:in|to)\s+telugu/i,
      /\btelugulo\s+matladandi\b/i,
    ],
  },
  {
    languageCode: 'od-IN',
    patterns: [
      /ଓଡ଼ିଆରେ\s*(?:କୁହନ୍ତୁ|କଥାବାର୍ତ୍ତା\s*କରନ୍ତୁ)/i,
      /(?:speak|talk|continue|switch)\s+(?:in|to)\s+odia/i,
    ],
  },
];

/**
 * Detect explicit user request to switch language.
 */
export function detectExplicitLanguageRequest(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  for (const rule of EXPLICIT_LANGUAGE_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(trimmed)) {
        return rule.languageCode;
      }
    }
  }
  return null;
}

// Regex matching common Indic scripts (Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam)
const INDIC_SCRIPT_REGEX = /[\u0900-\u0D7F]/;
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

// Common Hindi grammatical markers in Latin (Hinglish) script (excluding common English words like 'the')
const HINDI_LATIN_MARKERS_REGEX = /\b(?:ka|ki|ke|hai|hain|tha|thi|hoga|hogi|hoge|kya|chahiye|batao|bataiye|karo|kijiye|sakta|sakti|sakte|milna|lena|denge|dijiye|aaj|kal|samay|tarikh|nahi|nahin|haan|bhai|mujhe|aap|kaha|kahan|kaun|kaunsa|kitna|kitni|kitne|bolo|baat|liye|mein|se|ko)\b/i;

// Common Marathi grammatical markers in Latin (Minglish) script
const MARATHI_LATIN_MARKERS_REGEX = /\b(?:madhe|cha|chi|che|chya|ahe|aahe|ahet|hota|hoti|kay|hava|have|havi|sanga|bola|kara|shaktat|shakta|bhetayche|ghyayche|dya|aaj|udya|vel|tarikh|divas|nahi|nahin|yancha|yanchi|sathi|mala|tumhi|amhi|kiti|koni|konti|kadhi|kuthun|kuthe)\b/i;

/**
 * Evaluates whether an automatically detected STT language code represents reliable evidence
 * to switch the active conversation language, filtering out noise, fillers, single words, and natural code-switching.
 */
export function isReliableAutomaticSwitch(
  transcript: string,
  candidateLanguage: string,
  currentLanguage: string,
): boolean {
  if (!transcript || typeof transcript !== 'string') return false;
  const trimmed = transcript.trim();
  if (trimmed.length < 5) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  // An utterance with fewer than 3 words is not reliable for automatic switching (filters "okay", "doctor sharma", "नहीं नहीं", etc.)
  if (words.length < 3) return false;

  const candNorm = normalizeLanguageCode(candidateLanguage);
  const currNorm = normalizeLanguageCode(currentLanguage);

  const candBase = candNorm.split('-')[0]?.toLowerCase() || '';
  const currBase = currNorm.split('-')[0]?.toLowerCase() || '';

  // 1. Switching from an Indian language (e.g. Hindi, Marathi) to English ('en-IN'):
  if (candBase === 'en' && currBase !== 'en') {
    // If the text contains Indic script characters, it's definitely not English speech
    if (INDIC_SCRIPT_REGEX.test(trimmed)) {
      return false;
    }

    // If current is Hindi and the transcript contains Hindi grammatical particles (Hinglish):
    if (currBase === 'hi' && HINDI_LATIN_MARKERS_REGEX.test(trimmed)) {
      return false;
    }

    // If current is Marathi and the transcript contains Marathi grammatical particles (Minglish):
    if (currBase === 'mr' && MARATHI_LATIN_MARKERS_REGEX.test(trimmed)) {
      return false;
    }

    // Genuine English switch requires English words and length >= 3
    return words.length >= 3;
  }

  // 2. Switching to Hindi ('hi-IN') from English or other language:
  if (candBase === 'hi') {
    // Check if text has Devanagari or Hindi markers
    if (DEVANAGARI_REGEX.test(trimmed) || HINDI_LATIN_MARKERS_REGEX.test(trimmed)) {
      return words.length >= 2;
    }
    return words.length >= 3;
  }

  // 3. Switching to Marathi ('mr-IN') from English or other language:
  if (candBase === 'mr') {
    // Check if text has Marathi markers
    if (MARATHI_LATIN_MARKERS_REGEX.test(trimmed)) {
      return words.length >= 2;
    }
    return words.length >= 3;
  }

  // 4. Switching to any other Indian language (e.g. Bengali, Gujarati, Kannada, Tamil, etc.):
  return words.length >= 3;
}

/**
 * Build dynamic language directive to append to the system prompt.
 */
export function buildLanguageInstruction(languageCode: string): string {
  const norm = normalizeLanguageCode(languageCode);
  const langName = getLanguageDisplayName(norm);
  const baseLang = norm.split('-')[0]?.toLowerCase() || '';

  let codeSwitchingGuidance = '';
  if (baseLang === 'hi') {
    codeSwitchingGuidance =
      `- Respond in Hindi (conversational Hinglish).\n` +
      `- Speak natural conversational Hinglish (Hindi + English). Do not force archaic or pure textbook Hindi.\n` +
      `- Keep standard business/everyday terms in English naturally (e.g. appointment, booking, timing, phone number, team, fees, pricing, WhatsApp, payment, confirm).\n` +
      `- DO NOT switch the entire conversation to English merely because the caller uses English words or numbers.`;
  } else if (baseLang === 'mr') {
    codeSwitchingGuidance =
      `- Respond in Marathi (conversational Minglish).\n` +
      `- Speak natural conversational Minglish (Marathi + English). Do not force archaic or pure textbook Marathi.\n` +
      `- Keep standard business/everyday terms in English naturally (e.g. appointment, booking, timing, phone number, team, fees, pricing, WhatsApp, payment, confirm).\n` +
      `- DO NOT switch the entire conversation to English merely because the caller uses English words or numbers.`;
  } else {
    codeSwitchingGuidance =
      `- Respond in ${langName}.\n` +
      `- Maintain this language as the active conversation language until the user explicitly requests another supported language or clearly switches.`;
  }

  return (
    `\n\n=== ACTIVE CONVERSATION LANGUAGE POLICY ===\n` +
    `- Active Conversation Language: ${langName} (${norm})\n` +
    `${codeSwitchingGuidance}\n` +
    `- LATEST USER INTENT: Always prioritize answering the user's latest question directly first (e.g. today's date, operating hours, fees/pricing, location) before continuing any prior conversational step.\n` +
    `- SHORT UTTERANCES: Interpret short utterances (e.g. "हाँ", "नहीं", "नहीं नहीं", "Okay") in context of the previous turn rather than treating them as language changes.\n` +
    `- PHONE NUMBER SEMANTICS: If the caller says "यही नंबर है" or "use this number", use incoming caller phone if available; if not available, politely ask for their number without claiming fake caller ID.`
  );
}

/**
 * Combine base system prompt with active conversation language directive.
 */
export function buildFullInstructions(baseInstructions: string, languageCode: string): string {
  const cleanBase = baseInstructions
    .replace(/\n\n=== ACTIVE CONVERSATION LANGUAGE POLICY ===[\s\S]*$/, '')
    .replace(/\n\n# Active Conversation Language[\s\S]*$/, '');
  return `${cleanBase}${buildLanguageInstruction(languageCode)}`;
}

export interface ProcessTurnResult {
  switched: boolean;
  previousLanguage: string;
  currentLanguage: string;
  reason: 'explicit' | 'auto_detect' | 'none';
  decision?: 'SWITCHED' | 'REJECTED' | 'SAME_LANGUAGE' | 'NO_DETECTION';
  details?: string;
}

/**
 * Source of truth for active conversation language state and language switching rules.
 */
export class ConversationLanguageManager {
  private primary: string;
  private supported: string[];
  private autoDetect: boolean;
  private languageSwitching: boolean;
  private current: string;

  constructor(config?: {
    primary?: string;
    supportedLanguages?: string[];
    autoDetectEnabled?: boolean;
    languageSwitchingEnabled?: boolean;
  }) {
    this.primary = config?.primary ? normalizeLanguageCode(config.primary) : 'en-IN';
    const rawSupported =
      config?.supportedLanguages && config.supportedLanguages.length > 0
        ? config.supportedLanguages
        : [this.primary];
    this.supported = rawSupported.map(normalizeLanguageCode);
    if (!this.supported.includes(this.primary)) {
      this.supported.unshift(this.primary);
    }
    // Default autoDetectEnabled to true unless explicitly set to false
    this.autoDetect = config?.autoDetectEnabled !== false;
    // Default languageSwitchingEnabled to true unless explicitly set to false
    this.languageSwitching = config?.languageSwitchingEnabled !== false;
    this.current = this.primary;
  }

  get primaryLanguage(): string {
    return this.primary;
  }

  get supportedLanguages(): string[] {
    return [...this.supported];
  }

  get autoDetectEnabled(): boolean {
    return this.autoDetect;
  }

  get languageSwitchingEnabled(): boolean {
    return this.languageSwitching;
  }

  get currentLanguage(): string {
    return this.current;
  }

  /**
   * Returns 'unknown' for Sarvam Saaras v3 auto-detection when autoDetect is enabled,
   * otherwise returns the configured primary language.
   */
  getSttInitialLanguage(): string {
    return this.autoDetect ? 'unknown' : this.primary;
  }

  getTtsCurrentLanguage(): string {
    return this.current;
  }

  /**
   * Process a user turn to determine if language should switch.
   * Priority:
   * 1. Explicit user request (only if requested language is in supportedLanguages)
   * 2. Automatic language detection (only if autoDetect and languageSwitching are enabled, candidate is in supportedLanguages, and evidence is reliable)
   * 3. Language persists if no switch triggered.
   */
  processUserTurn(transcript: string, detectedLanguageCode?: string | null): ProcessTurnResult {
    const prev = this.current;

    // 1. Check for explicit language switch request first (Highest Priority)
    const explicitCode = detectExplicitLanguageRequest(transcript);
    if (explicitCode) {
      const matched = matchSupportedLanguage(explicitCode, this.supported);
      if (matched) {
        if (matched !== this.current) {
          this.current = matched;
          return {
            switched: true,
            previousLanguage: prev,
            currentLanguage: this.current,
            reason: 'explicit',
            decision: 'SWITCHED',
            details: `Explicit request for ${getLanguageDisplayName(matched)} (${matched})`,
          };
        }
        return {
          switched: false,
          previousLanguage: prev,
          currentLanguage: this.current,
          reason: 'none',
          decision: 'SAME_LANGUAGE',
          details: `Explicit request for current active language (${matched})`,
        };
      }
      // Explicit request is for an unsupported language: SAFETY -> do NOT switch
      return {
        switched: false,
        previousLanguage: prev,
        currentLanguage: this.current,
        reason: 'none',
        decision: 'REJECTED',
        details: `Explicit request for unsupported language (${explicitCode})`,
      };
    }

    // 2. Automatic language detection (Evidence, not absolute authority)
    if (!this.languageSwitching || !this.autoDetect) {
      return {
        switched: false,
        previousLanguage: prev,
        currentLanguage: this.current,
        reason: 'none',
        decision: 'REJECTED',
        details: !this.languageSwitching ? 'Language switching disabled in configuration' : 'Auto detection disabled in configuration',
      };
    }

    if (detectedLanguageCode && detectedLanguageCode !== 'unknown') {
      const matched = matchSupportedLanguage(detectedLanguageCode, this.supported);
      if (matched) {
        if (matched !== this.current) {
          // Validate that this is a genuine, reliable language change rather than noise, single word, or Hinglish/Minglish
          if (isReliableAutomaticSwitch(transcript, matched, this.current)) {
            this.current = matched;
            return {
              switched: true,
              previousLanguage: prev,
              currentLanguage: this.current,
              reason: 'auto_detect',
              decision: 'SWITCHED',
              details: `Reliable automatic speech detection in ${getLanguageDisplayName(matched)} (${matched})`,
            };
          }
          return {
            switched: false,
            previousLanguage: prev,
            currentLanguage: this.current,
            reason: 'none',
            decision: 'REJECTED',
            details: `STT detection for ${matched} rejected: isolated word, filler, noise, or natural code-switching`,
          };
        }
        return {
          switched: false,
          previousLanguage: prev,
          currentLanguage: this.current,
          reason: 'none',
          decision: 'SAME_LANGUAGE',
          details: `Detected language matches active language (${this.current})`,
        };
      }
      return {
        switched: false,
        previousLanguage: prev,
        currentLanguage: this.current,
        reason: 'none',
        decision: 'REJECTED',
        details: `Detected language (${detectedLanguageCode}) not in configured supportedLanguages`,
      };
    }

    return {
      switched: false,
      previousLanguage: prev,
      currentLanguage: this.current,
      reason: 'none',
      decision: 'NO_DETECTION',
      details: 'No STT language code detected on utterance',
    };
  }
}

