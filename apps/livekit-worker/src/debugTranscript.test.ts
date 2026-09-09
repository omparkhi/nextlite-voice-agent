import { describe, it, expect, vi } from 'vitest';
import {
  DebugTranscriptCollector,
  maskSensitive,
  sanitizeToolArgs,
} from './debugTranscript.ts';

describe('Module 3.4.1 — Production Phone Call Debug Transcript / Turn Trace', () => {
  describe('1. Masking and Privacy Protection', () => {
    it('9. masks 10-digit Indian phone numbers and redacts credentials/secrets', () => {
      // Direct 10-digit numbers
      expect(maskSensitive('User said my number is 9657954641')).toBe('User said my number is ******4641');
      expect(maskSensitive('Call me on 9822334455 please')).toBe('Call me on ******4455 please');

      // With country code
      expect(maskSensitive('+919876543210')).toBe('******3210');

      // Redact auth/bearer tokens and passwords
      expect(maskSensitive('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test')).toBe('Authorization: Bearer [REDACTED]');
      expect(maskSensitive('apiKey="sarvam-secret-key-12345"')).toBe('apiKey=[REDACTED]');
      expect(maskSensitive('password="mySecretDbPassword123"')).toBe('password=[REDACTED]');
    });

    it('sanitizes tool arguments object recursively without leaking secrets or unmasked PII', () => {
      const args = {
        query: 'Cardiology OPD timings',
        apiKey: 'secret_sarvam_key',
        callerPhone: '9876543210',
        nested: {
          token: 'jwt_token_123',
          patientName: 'Rahul Sharma',
        },
      };

      const sanitized = sanitizeToolArgs(args);
      expect(sanitized.query).toBe('Cardiology OPD timings');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.callerPhone).toBe('******3210');
      expect((sanitized.nested as any).token).toBe('[REDACTED]');
      expect((sanitized.nested as any).patientName).toBe('Rahul Sharma');
    });
  });

  describe('2. Turn Trace Recording & Event Lifecycle', () => {
    it('1. records user turn with transcript, timestamps, and active languages', () => {
      const collector = new DebugTranscriptCollector({ enabled: false });
      collector.startCall({
        callId: 'call-101',
        roomName: 'room-101',
        agentName: 'Aarav',
        primaryLanguage: 'hi-IN',
        supportedLanguages: ['hi-IN', 'en-IN'],
      });

      const turn = collector.recordUserTurn({
        transcript: 'आज की तारीख क्या है?',
        detectedLanguage: 'hi-IN',
        activeLanguageBefore: 'hi-IN',
        activeLanguageAfter: 'hi-IN',
        languageDecision: 'SAME_LANGUAGE',
        languageDecisionReason: 'Detected language matches active language (hi-IN)',
      });

      expect(turn.turnId).toBe(1);
      expect(turn.user?.transcript).toBe('आज की तारीख क्या है?');
      expect(turn.user?.detectedLanguage).toBe('hi-IN');
      expect(turn.user?.activeLanguageBefore).toBe('hi-IN');
      expect(turn.user?.activeLanguageAfter).toBe('hi-IN');
      expect(turn.user?.languageDecision).toBe('SAME_LANGUAGE');
      expect(turn.user?.languageDecisionReason).toContain('Detected language matches active language');
    });

    it('2. records agent turn with response text, TTFT metrics, and speaking duration', () => {
      const collector = new DebugTranscriptCollector({ enabled: false });
      collector.startCall({ callId: 'call-102' });

      collector.recordUserTurn({
        transcript: 'Cardiology OPD timings?',
        detectedLanguage: 'en-IN',
        activeLanguageBefore: 'en-IN',
        activeLanguageAfter: 'en-IN',
        languageDecision: 'SAME_LANGUAGE',
        languageDecisionReason: 'Detected language matches active language',
      });

      collector.recordAgentMessage({
        response: 'The Cardiology OPD is open Monday to Friday from 10 AM to 2 PM.',
        activeLanguage: 'en-IN',
        interrupted: false,
        metrics: {
          llmNodeTtft: 0.35,
          startedSpeakingAt: 1000,
          stoppedSpeakingAt: 1002.5,
        },
      });

      const transcript = collector.getTranscript();
      expect(transcript.turns.length).toBe(1);
      const turn = transcript.turns[0]!;
      expect(turn.agent?.response).toBe('The Cardiology OPD is open Monday to Friday from 10 AM to 2 PM.');
      expect(turn.agent?.activeLanguage).toBe('en-IN');
      expect(turn.agent?.interrupted).toBe(false);
      expect(turn.agent?.ttftMs).toBe(350);
      expect(turn.agent?.durationMs).toBe(2500);
    });

    it('3. records detected language when available and handles null/undefined gracefully', () => {
      const collector = new DebugTranscriptCollector({ enabled: false });
      collector.startCall({ callId: 'call-103' });

      const turn = collector.recordUserTurn({
        transcript: 'Hello there',
        detectedLanguage: null,
        activeLanguageBefore: 'en-IN',
        activeLanguageAfter: 'en-IN',
        languageDecision: 'NO_DETECTION',
        languageDecisionReason: 'No STT language code detected on utterance',
      });

      expect(turn.user?.detectedLanguage).toBeNull();
      expect(turn.user?.languageDecision).toBe('NO_DETECTION');
    });

    it('4. records active language transition on switch', () => {
      const collector = new DebugTranscriptCollector({ enabled: false });
      collector.startCall({
        callId: 'call-104',
        primaryLanguage: 'hi-IN',
        supportedLanguages: ['hi-IN', 'en-IN', 'mr-IN'],
      });

      // User explicitly requests English
      const turn = collector.recordUserTurn({
        transcript: 'English mein baat karo',
        detectedLanguage: 'hi-IN',
        activeLanguageBefore: 'hi-IN',
        activeLanguageAfter: 'en-IN',
        languageDecision: 'SWITCHED',
        languageDecisionReason: 'Explicit request for English (en-IN)',
      });

      expect(turn.user?.activeLanguageBefore).toBe('hi-IN');
      expect(turn.user?.activeLanguageAfter).toBe('en-IN');
      expect(turn.user?.languageDecision).toBe('SWITCHED');
      expect(turn.user?.languageDecisionReason).toContain('Explicit request for English');
    });

    it('5. records language switch rejection reasons (e.g. noise / isolated word)', () => {
      const collector = new DebugTranscriptCollector({ enabled: false });
      collector.startCall({
        callId: 'call-105',
        primaryLanguage: 'hi-IN',
        supportedLanguages: ['hi-IN', 'en-IN'],
      });

      // Isolated English word "Okay" inside Hindi conversation
      const turn = collector.recordUserTurn({
        transcript: 'Okay',
        detectedLanguage: 'en-IN',
        activeLanguageBefore: 'hi-IN',
        activeLanguageAfter: 'hi-IN',
        languageDecision: 'REJECTED',
        languageDecisionReason: 'STT detection for en-IN rejected: isolated word, filler, noise, or natural code-switching',
      });

      expect(turn.user?.activeLanguageBefore).toBe('hi-IN');
      expect(turn.user?.activeLanguageAfter).toBe('hi-IN');
      expect(turn.user?.languageDecision).toBe('REJECTED');
      expect(turn.user?.languageDecisionReason).toContain('isolated word');
    });

    it('6. records tool execution metadata (name, sanitized args, timing, success, resultCount)', () => {
      const collector = new DebugTranscriptCollector({ enabled: false });
      collector.startCall({ callId: 'call-106' });

      collector.recordUserTurn({
        transcript: 'Dr. Sharma timings kya hai?',
        detectedLanguage: 'hi-IN',
        activeLanguageBefore: 'hi-IN',
        activeLanguageAfter: 'hi-IN',
        languageDecision: 'SAME_LANGUAGE',
        languageDecisionReason: 'Same language',
      });

      const callId = 'call_tool_abc123';
      const t0 = Date.now();
      collector.recordToolCall({
        toolName: 'query_knowledge_base',
        callId,
        args: { query: 'Dr. Sharma OPD timings' },
        createdAt: t0,
      });

      collector.recordToolResult({
        callId,
        resultCount: 2,
        isError: false,
        createdAt: t0 + 120,
      });

      const transcript = collector.getTranscript();
      const turn = transcript.turns[0]!;
      expect(turn.tools.length).toBe(1);
      const tool = turn.tools[0]!;
      expect(tool.toolName).toBe('query_knowledge_base');
      expect(tool.callId).toBe(callId);
      expect(tool.args).toEqual({ query: 'Dr. Sharma OPD timings' });
      expect(tool.resultCount).toBe(2);
      expect(tool.success).toBe(true);
      expect(tool.durationMs).toBe(120);
      expect(tool.error).toBeNull();
    });

    it('7. records errors safely without throwing or losing prior turns', () => {
      const collector = new DebugTranscriptCollector({ enabled: false });
      collector.startCall({ callId: 'call-107' });

      collector.recordUserTurn({
        transcript: 'Hello',
        activeLanguageBefore: 'en-IN',
        activeLanguageAfter: 'en-IN',
        languageDecision: 'SAME_LANGUAGE',
        languageDecisionReason: 'Same language',
      });

      collector.recordError('Connection to Sarvam STT stream dropped', 'stt');

      const transcript = collector.getTranscript();
      expect(transcript.errors.length).toBe(1);
      expect(transcript.errors[0]?.message).toBe('Connection to Sarvam STT stream dropped');
      expect(transcript.errors[0]?.source).toBe('stt');
      expect(transcript.turns[0]?.error).toBe('Connection to Sarvam STT stream dropped');
    });

    it('8. call/session correlation works across turns and endCall calculates total duration', () => {
      const collector = new DebugTranscriptCollector({ enabled: false });
      collector.startCall({
        callId: 'call-sip-999',
        roomName: 'sip-room-xyz',
        roomSid: 'RM_12345678',
        jobId: 'AJ_87654321',
        deploymentId: 'dep-456',
        agentId: 'agent-123',
        agentName: 'Medicare Receptionist',
        primaryLanguage: 'hi-IN',
        supportedLanguages: ['hi-IN', 'en-IN', 'mr-IN'],
      });

      // Turn 1
      collector.recordUserTurn({
        transcript: 'नमस्ते',
        detectedLanguage: 'hi-IN',
        activeLanguageBefore: 'hi-IN',
        activeLanguageAfter: 'hi-IN',
        languageDecision: 'SAME_LANGUAGE',
        languageDecisionReason: 'Same language',
      });
      collector.recordAgentMessage({
        response: 'नमस्ते! मैं आपकी क्या मदद कर सकता हूँ?',
        activeLanguage: 'hi-IN',
      });

      // Turn 2
      collector.recordUserTurn({
        transcript: 'What is your clinic address?',
        detectedLanguage: 'en-IN',
        activeLanguageBefore: 'hi-IN',
        activeLanguageAfter: 'en-IN',
        languageDecision: 'SWITCHED',
        languageDecisionReason: 'Reliable automatic detection in English',
      });
      collector.recordAgentMessage({
        response: 'We are located at Medical Square, Nagpur.',
        activeLanguage: 'en-IN',
      });

      const finalized = collector.endCall();
      expect(finalized.callId).toBe('call-sip-999');
      expect(finalized.roomName).toBe('sip-room-xyz');
      expect(finalized.roomSid).toBe('RM_12345678');
      expect(finalized.jobId).toBe('AJ_87654321');
      expect(finalized.deploymentId).toBe('dep-456');
      expect(finalized.agentId).toBe('agent-123');
      expect(finalized.agentName).toBe('Medicare Receptionist');
      expect(finalized.totalTurns).toBe(2);
      expect(finalized.turns.length).toBe(2);
      expect(typeof finalized.durationSeconds).toBe('number');
      expect(finalized.endTime).toBeDefined();
    });
  });

  describe('3. Feature Flagging and Output Formatting', () => {
    it('10. debug instrumentation disabled -> does not output verbose logs', () => {
      const mockLogger = vi.fn();
      const collector = new DebugTranscriptCollector({ enabled: false, customLogger: mockLogger });

      collector.startCall({ callId: 'call-disabled' });
      collector.recordUserTurn({
        transcript: 'Test utterance',
        activeLanguageBefore: 'en-IN',
        activeLanguageAfter: 'en-IN',
        languageDecision: 'SAME_LANGUAGE',
        languageDecisionReason: 'Same language',
      });
      collector.recordAgentMessage({
        response: 'Test response',
        activeLanguage: 'en-IN',
      });
      collector.endCall();

      expect(mockLogger).not.toHaveBeenCalled();
    });

    it('11. debug instrumentation enabled -> generates ASCII tree and JSON summary', () => {
      const logs: string[] = [];
      const collector = new DebugTranscriptCollector({
        enabled: true,
        customLogger: (msg) => logs.push(msg),
      });

      collector.startCall({
        callId: 'call-enabled-1',
        roomName: 'room-voice-1',
        agentName: 'Aarav',
        primaryLanguage: 'hi-IN',
        supportedLanguages: ['hi-IN', 'en-IN'],
      });

      collector.recordUserTurn({
        transcript: 'आज की तारीख क्या है?',
        detectedLanguage: 'hi-IN',
        activeLanguageBefore: 'hi-IN',
        activeLanguageAfter: 'hi-IN',
        languageDecision: 'SAME_LANGUAGE',
        languageDecisionReason: 'Matches active language',
      });

      collector.recordAgentMessage({
        response: 'आज शनिवार, 5 सितंबर 2026 है।',
        activeLanguage: 'hi-IN',
        metrics: { llmNodeTtft: 0.28 },
      });

      collector.endCall();

      expect(logs.length).toBeGreaterThan(0);
      const combined = logs.join('\n');
      expect(combined).toContain('CALL [call-enabled-1]');
      expect(combined).toContain('TURN 1');
      expect(combined).toContain('USER');
      expect(combined).toContain('आज की तारीख क्या है?');
      expect(combined).toContain('AGENT');
      expect(combined).toContain('आज शनिवार, 5 सितंबर 2026 है।');
      expect(combined).toContain('CALL DEBUG TRANSCRIPT (JSON)');
    });

    it('12. instrumentation does not throw when optional runtime metadata is missing', () => {
      const collector = new DebugTranscriptCollector({ enabled: false });

      // Call start with empty object
      expect(() => collector.startCall({})).not.toThrow();

      // Record user turn with minimal fields
      expect(() =>
        collector.recordUserTurn({
          transcript: '',
          activeLanguageBefore: 'en-IN',
          activeLanguageAfter: 'en-IN',
          languageDecision: 'NO_DETECTION',
          languageDecisionReason: '',
        }),
      ).not.toThrow();

      // Record tool call with empty args
      expect(() =>
        collector.recordToolCall({
          toolName: 'query_knowledge_base',
          callId: 'call-1',
          args: null,
        }),
      ).not.toThrow();

      // Record agent message with minimal fields
      expect(() =>
        collector.recordAgentMessage({
          response: '',
          activeLanguage: 'en-IN',
        }),
      ).not.toThrow();

      // End call
      expect(() => collector.endCall()).not.toThrow();

      const tree = collector.formatAsciiTree();
      expect(tree).toBeDefined();
    });
  });
});
