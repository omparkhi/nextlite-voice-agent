/**
 * MODULE 3.4.1 — PRODUCTION PHONE CALL DEBUG TRANSCRIPT / TURN TRACE
 * 
 * Developer diagnostic turn trace for real phone call debugging.
 * Captures STT, language detection, language policy decisions, LLM requests/responses,
 * tool execution metadata, turn timings, interruptions, and errors per call.
 */

export type DebugLanguageDecision = 'SWITCHED' | 'REJECTED' | 'SAME_LANGUAGE' | 'NO_DETECTION';

export interface DebugToolExecution {
  toolName: string;
  callId: string;
  args: Record<string, unknown>;
  resultCount?: number | undefined;
  durationMs?: number | undefined;
  success: boolean;
  error?: string | null | undefined;
  executedAt: string;
}

export interface DebugUserTurn {
  transcript: string;
  detectedLanguage: string | null;
  activeLanguageBefore: string;
  activeLanguageAfter: string;
  languageDecision: DebugLanguageDecision;
  languageDecisionReason: string;
  timestamp: string;
}

export interface DebugAgentTurn {
  response: string;
  activeLanguage: string;
  interrupted: boolean;
  ttftMs?: number | undefined;
  durationMs?: number | undefined;
  error?: string | null | undefined;
  timestamp: string;
}

export interface DebugTurn {
  turnId: number;
  startTime: string;
  endTime?: string | undefined;
  user?: DebugUserTurn | undefined;
  agent?: DebugAgentTurn | undefined;
  tools: DebugToolExecution[];
  error?: string | null | undefined;
}

export interface DebugCallTranscript {
  callId: string;
  roomName: string;
  roomSid?: string | undefined;
  jobId?: string | undefined;
  deploymentId: string;
  agentId: string;
  agentName: string;
  primaryLanguage: string;
  supportedLanguages: string[];
  startTime: string;
  endTime?: string | undefined;
  durationSeconds?: number | undefined;
  totalTurns: number;
  turns: DebugTurn[];
  errors: Array<{ timestamp: string; message: string; source?: string | undefined }>;
}

/**
 * Masks sensitive user personal info (e.g. 10-digit Indian phone numbers) and redacts secrets.
 */
export function maskSensitive(text: string): string {
  if (!text || typeof text !== 'string') return text;

  // Mask 10-digit Indian mobile numbers (e.g., 9876543210 -> ******3210, +919876543210 -> +91******3210)
  const phoneRegex = /(?:\+?91[\s-]?)?([6-9]\d{1})(\d{4})(\d{4})\b/g;
  let masked = text.replace(phoneRegex, (_match, _p1, _p2, p3) => `******${p3}`);

  // Redact potential bearer tokens, secret keys, or api keys
  masked = masked.replace(/(?:Bearer\s+[A-Za-z0-9-_.]+)/gi, 'Bearer [REDACTED]');
  masked = masked.replace(/(?:api[_-]?key[:=]\s*["']?)[A-Za-z0-9-_.]+(?:["']?)/gi, 'apiKey=[REDACTED]');
  masked = masked.replace(/(?:password[:=]\s*["']?)[^\s"']+(?:["']?)/gi, 'password=[REDACTED]');

  return masked;
}

/**
 * Sanitizes tool arguments object to prevent logging secrets or unmasked PII.
 */
export function sanitizeToolArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') {
    return { raw: typeof args === 'string' ? maskSensitive(args) : args };
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('secret') ||
      lowerKey.includes('key') ||
      lowerKey.includes('token') ||
      lowerKey.includes('password') ||
      lowerKey.includes('auth')
    ) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      sanitized[key] = maskSensitive(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeToolArgs(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export interface CollectorOptions {
  enabled?: boolean | undefined;
  customLogger?: ((msg: string) => void) | undefined;
}

/**
 * Production-safe diagnostic turn trace collector for LiveKit phone & web voice calls.
 */
export class DebugTranscriptCollector {
  private enabled: boolean;
  private customLogger?: ((msg: string) => void) | undefined;
  private transcript: DebugCallTranscript;
  private currentTurn: DebugTurn | null = null;
  private turnCounter = 0;
  private toolStartTimes: Map<string, number> = new Map();

  constructor(options?: CollectorOptions) {
    this.enabled =
      options?.enabled !== undefined
        ? options.enabled
        : process.env.LIVEKIT_DEBUG_TRANSCRIPT === 'true' ||
          process.env.NEXTLITE_DEBUG_TRANSCRIPT === 'true';
    this.customLogger = options?.customLogger;

    this.transcript = {
      callId: 'unknown',
      roomName: 'unknown',
      deploymentId: 'unknown',
      agentId: 'unknown',
      agentName: 'unknown',
      primaryLanguage: 'en-IN',
      supportedLanguages: [],
      startTime: new Date().toISOString(),
      totalTurns: 0,
      turns: [],
      errors: [],
    };
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Initializes call-level metadata at session start.
   */
  public startCall(metadata: {
    callId?: string | undefined;
    roomName?: string | undefined;
    roomSid?: string | undefined;
    jobId?: string | undefined;
    deploymentId?: string | undefined;
    agentId?: string | undefined;
    agentName?: string | undefined;
    primaryLanguage?: string | undefined;
    supportedLanguages?: string[] | undefined;
  }): void {
    try {
      this.transcript.callId = metadata.callId || metadata.roomName || 'call-' + Date.now();
      this.transcript.roomName = metadata.roomName || 'unknown';
      this.transcript.roomSid = metadata.roomSid ?? undefined;
      this.transcript.jobId = metadata.jobId ?? undefined;
      this.transcript.deploymentId = metadata.deploymentId || 'unknown';
      this.transcript.agentId = metadata.agentId || 'unknown';
      this.transcript.agentName = metadata.agentName || 'unknown';
      this.transcript.primaryLanguage = metadata.primaryLanguage || 'en-IN';
      this.transcript.supportedLanguages = metadata.supportedLanguages || [this.transcript.primaryLanguage];
      this.transcript.startTime = new Date().toISOString();

      if (this.enabled) {
        this.log(
          `[DebugTrace] 🚀 Call started: callId=${this.transcript.callId}, room=${this.transcript.roomName}, agent=${this.transcript.agentName}, primary=${this.transcript.primaryLanguage}, supported=[${this.transcript.supportedLanguages.join(',')}]`,
        );
      }
    } catch {
      // Defensive: debugging must never throw
    }
  }

  /**
   * Records a user speech turn with STT detection and language policy decision.
   */
  public recordUserTurn(data: {
    transcript: string;
    detectedLanguage?: string | null | undefined;
    activeLanguageBefore: string;
    activeLanguageAfter: string;
    languageDecision: DebugLanguageDecision;
    languageDecisionReason: string;
    createdAt?: number | undefined;
  }): DebugTurn {
    try {
      // Finalize previous turn if still open
      if (this.currentTurn && !this.currentTurn.endTime) {
        this.currentTurn.endTime = new Date().toISOString();
      }

      this.turnCounter += 1;
      const turnId = this.turnCounter;
      const timestamp = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();

      const userTurn: DebugUserTurn = {
        transcript: maskSensitive(data.transcript),
        detectedLanguage: data.detectedLanguage || null,
        activeLanguageBefore: data.activeLanguageBefore,
        activeLanguageAfter: data.activeLanguageAfter,
        languageDecision: data.languageDecision,
        languageDecisionReason: data.languageDecisionReason,
        timestamp,
      };

      const turn: DebugTurn = {
        turnId,
        startTime: timestamp,
        user: userTurn,
        tools: [],
      };

      this.currentTurn = turn;
      this.transcript.turns.push(turn);
      this.transcript.totalTurns = this.transcript.turns.length;

      if (this.enabled) {
        this.log(
          `[DebugTrace] 👤 Turn ${turnId} [USER]: "${userTurn.transcript}" | STT: ${userTurn.detectedLanguage || 'none'} | ActiveBefore: ${userTurn.activeLanguageBefore} | Decision: ${userTurn.languageDecision} (${userTurn.languageDecisionReason}) | ActiveAfter: ${userTurn.activeLanguageAfter}`,
        );
      }

      return turn;
    } catch {
      // Defensive fallback
      return {
        turnId: this.turnCounter || 1,
        startTime: new Date().toISOString(),
        tools: [],
      };
    }
  }

  /**
   * Records a tool invocation (e.g. query_knowledge_base).
   */
  public recordToolCall(data: {
    toolName: string;
    callId: string;
    args: unknown;
    createdAt?: number | undefined;
  }): void {
    try {
      const now = data.createdAt || Date.now();
      this.toolStartTimes.set(data.callId, now);

      let parsedArgs: Record<string, unknown> = {};
      if (typeof data.args === 'string') {
        try {
          parsedArgs = JSON.parse(data.args);
        } catch {
          parsedArgs = { raw: data.args };
        }
      } else if (data.args && typeof data.args === 'object') {
        parsedArgs = data.args as Record<string, unknown>;
      }

      const toolExec: DebugToolExecution = {
        toolName: data.toolName,
        callId: data.callId,
        args: sanitizeToolArgs(parsedArgs),
        success: true,
        executedAt: new Date(now).toISOString(),
      };

      if (this.currentTurn) {
        this.currentTurn.tools.push(toolExec);
      }

      if (this.enabled) {
        this.log(
          `[DebugTrace] 🔧 Tool Call [${data.toolName}] (callId=${data.callId}): args=${JSON.stringify(toolExec.args)}`,
        );
      }
    } catch {
      // Defensive
    }
  }

  /**
   * Records a tool execution result.
   */
  public recordToolResult(data: {
    callId: string;
    resultCount?: number | undefined;
    isError?: boolean | undefined;
    error?: string | undefined;
    createdAt?: number | undefined;
  }): void {
    try {
      const now = data.createdAt || Date.now();
      const startTime = this.toolStartTimes.get(data.callId);
      const durationMs = startTime ? now - startTime : undefined;

      if (this.currentTurn) {
        const toolExec = this.currentTurn.tools.find((t) => t.callId === data.callId);
        if (toolExec) {
          toolExec.resultCount = data.resultCount ?? undefined;
          toolExec.durationMs = durationMs ?? undefined;
          toolExec.success = !data.isError;
          toolExec.error = data.error || null;
        }
      }

      if (this.enabled) {
        this.log(
          `[DebugTrace] 📦 Tool Result (callId=${data.callId}): success=${!data.isError}, results=${data.resultCount ?? 0}${durationMs ? `, duration=${durationMs}ms` : ''}${data.error ? `, error="${data.error}"` : ''}`,
        );
      }
    } catch {
      // Defensive
    }
  }

  /**
   * Records the agent's spoken response.
   */
  public recordAgentMessage(data: {
    response: string;
    activeLanguage: string;
    interrupted?: boolean | undefined;
    metrics?: {
      llmNodeTtft?: number | undefined;
      startedSpeakingAt?: number | undefined;
      stoppedSpeakingAt?: number | undefined;
    } | undefined;
    createdAt?: number | undefined;
  }): void {
    try {
      const timestamp = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
      const ttftMs =
        typeof data.metrics?.llmNodeTtft === 'number'
          ? Math.round(data.metrics.llmNodeTtft * 1000)
          : undefined;

      let durationMs: number | undefined = undefined;
      if (
        typeof data.metrics?.startedSpeakingAt === 'number' &&
        typeof data.metrics?.stoppedSpeakingAt === 'number'
      ) {
        durationMs = Math.round(
          (data.metrics.stoppedSpeakingAt - data.metrics.startedSpeakingAt) * 1000,
        );
      }

      const agentTurn: DebugAgentTurn = {
        response: maskSensitive(data.response.trim()),
        activeLanguage: data.activeLanguage,
        interrupted: data.interrupted || false,
        ttftMs: ttftMs ?? undefined,
        durationMs: durationMs ?? undefined,
        timestamp,
      };

      if (!this.currentTurn) {
        this.turnCounter += 1;
        this.currentTurn = {
          turnId: this.turnCounter,
          startTime: timestamp,
          tools: [],
        };
        this.transcript.turns.push(this.currentTurn);
        this.transcript.totalTurns = this.transcript.turns.length;
      }

      this.currentTurn.agent = agentTurn;
      this.currentTurn.endTime = timestamp;

      if (this.enabled) {
        this.log(
          `[DebugTrace] 🤖 Turn ${this.currentTurn.turnId} [AGENT]: "${agentTurn.response}" | Lang: ${agentTurn.activeLanguage} | Interrupted: ${agentTurn.interrupted}${ttftMs !== undefined ? ` | TTFT: ${ttftMs}ms` : ''}${durationMs !== undefined ? ` | SpeakDuration: ${durationMs}ms` : ''}`,
        );
      }
    } catch {
      // Defensive
    }
  }

  /**
   * Records an error during session execution.
   */
  public recordError(message: string, source?: string | undefined): void {
    try {
      const errorItem = {
        timestamp: new Date().toISOString(),
        message: maskSensitive(message),
        source: source ?? undefined,
      };
      this.transcript.errors.push(errorItem);

      if (this.currentTurn) {
        this.currentTurn.error = errorItem.message;
      }

      if (this.enabled) {
        this.log(`[DebugTrace] ❌ Error [${source || 'session'}]: ${errorItem.message}`);
      }
    } catch {
      // Defensive
    }
  }

  /**
   * Ends call and calculates total elapsed duration.
   */
  public endCall(): DebugCallTranscript {
    try {
      this.transcript.endTime = new Date().toISOString();
      const start = new Date(this.transcript.startTime).getTime();
      const end = new Date(this.transcript.endTime).getTime();
      this.transcript.durationSeconds = Math.max(0, Math.round((end - start) / 1000));

      if (this.enabled) {
        this.logSummary();
      }

      return this.transcript;
    } catch {
      return this.transcript;
    }
  }

  public getTranscript(): DebugCallTranscript {
    return this.transcript;
  }

  /**
   * Formats the call transcript as a readable ASCII hierarchical tree.
   */
  public formatAsciiTree(): string {
    const lines: string[] = [];
    lines.push(`CALL [${this.transcript.callId}]`);
    lines.push(`├── Session ID: ${this.transcript.roomSid || this.transcript.callId}`);
    lines.push(`├── Room: ${this.transcript.roomName}`);
    lines.push(`├── Agent: ${this.transcript.agentName} (${this.transcript.agentId})`);
    lines.push(`├── Deployment: ${this.transcript.deploymentId}`);
    lines.push(`├── Primary Language: ${this.transcript.primaryLanguage}`);
    lines.push(`├── Supported Languages: [${this.transcript.supportedLanguages.join(', ')}]`);
    lines.push(`├── Start Time: ${this.transcript.startTime}`);
    lines.push(`├── End Time: ${this.transcript.endTime || 'ongoing'}`);
    lines.push(`├── Total Turns: ${this.transcript.totalTurns}`);
    lines.push(`│`);

    this.transcript.turns.forEach((turn, idx) => {
      const isLastTurn = idx === this.transcript.turns.length - 1;
      const prefix = isLastTurn ? '└──' : '├──';
      const subPrefix = isLastTurn ? '    ' : '│   ';

      lines.push(`${prefix} TURN ${turn.turnId}`);
      if (turn.user) {
        lines.push(`${subPrefix}├── USER`);
        lines.push(`${subPrefix}│   ├── transcript: "${turn.user.transcript}"`);
        lines.push(`${subPrefix}│   ├── STT language: ${turn.user.detectedLanguage || 'none'}`);
        lines.push(`${subPrefix}│   ├── active language before: ${turn.user.activeLanguageBefore}`);
        lines.push(`${subPrefix}│   ├── language decision: ${turn.user.languageDecision}`);
        lines.push(`${subPrefix}│   ├── decision reason: ${turn.user.languageDecisionReason}`);
        lines.push(`${subPrefix}│   └── active language after: ${turn.user.activeLanguageAfter}`);
      }

      if (turn.tools && turn.tools.length > 0) {
        lines.push(`${subPrefix}├── TOOLS`);
        turn.tools.forEach((t) => {
          lines.push(
            `${subPrefix}│   └── ${t.toolName} (callId=${t.callId}): args=${JSON.stringify(t.args)}, success=${t.success}, results=${t.resultCount ?? 0}${t.durationMs ? `, duration=${t.durationMs}ms` : ''}`,
          );
        });
      }

      if (turn.agent) {
        lines.push(`${subPrefix}└── AGENT`);
        lines.push(`${subPrefix}    ├── response: "${turn.agent.response}"`);
        lines.push(`${subPrefix}    ├── active language: ${turn.agent.activeLanguage}`);
        lines.push(`${subPrefix}    ├── interrupted: ${turn.agent.interrupted}`);
        if (turn.agent.ttftMs !== undefined) {
          lines.push(`${subPrefix}    ├── TTFT: ${turn.agent.ttftMs}ms`);
        }
        if (turn.agent.durationMs !== undefined) {
          lines.push(`${subPrefix}    └── speech duration: ${turn.agent.durationMs}ms`);
        }
      }

      if (turn.error) {
        lines.push(`${subPrefix}└── ERROR: ${turn.error}`);
      }

      if (!isLastTurn) {
        lines.push(`│`);
      }
    });

    if (this.transcript.errors.length > 0) {
      lines.push(`├── CALL ERRORS (${this.transcript.errors.length}):`);
      this.transcript.errors.forEach((err) => {
        lines.push(`│   └── [${err.timestamp}] (${err.source || 'session'}): ${err.message}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Logs a formatted turn tree and JSON summary to logger/console.
   */
  public logSummary(): void {
    if (!this.enabled) return;

    this.log('\n================== CALL DEBUG TRANSCRIPT (ASCII) ==================');
    this.log(this.formatAsciiTree());
    this.log('================== CALL DEBUG TRANSCRIPT (JSON) ===================');
    this.log(JSON.stringify(this.transcript, null, 2));
    this.log('===================================================================\n');
  }

  private log(message: string): void {
    if (this.customLogger) {
      this.customLogger(message);
    } else {
      console.log(message);
    }
  }
}
