import { createChildLogger } from '../lib/logger.js';

const logger = createChildLogger({ module: 'live-transcript-store' });

export interface TranscriptItem {
  id: string;
  role: 'system' | 'user' | 'agent';
  speakerName?: string;
  text: string;
  timestamp: number;
  turnId?: string;
}

export interface CallSessionTranscript {
  sessionId: string;
  agentId?: string;
  phoneNumber?: string;
  startTime: number;
  endTime?: number;
  status: 'active' | 'completed';
  items: TranscriptItem[];
}

class LiveTranscriptStore {
  private sessions = new Map<string, CallSessionTranscript>();
  private latestSessionId: string | null = null;

  startSession(sessionId: string, details?: { agentId?: string; phoneNumber?: string }): void {
    const newSession: CallSessionTranscript = {
      sessionId,
      agentId: details?.agentId,
      phoneNumber: details?.phoneNumber,
      startTime: Date.now(),
      status: 'active',
      items: [
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          text: 'Call connected & pipeline initialized',
          timestamp: Date.now(),
        },
      ],
    };
    this.sessions.set(sessionId, newSession);
    this.latestSessionId = sessionId;

    if (process.env.NODE_ENV !== 'test') {
      console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
      console.log(`│ 📞 NEW LIVE CALL STARTED | Session ID: ${sessionId.slice(0, 8)}...                 │`);
      console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');
    }
  }

  addGreeting(sessionId: string, greetingText: string): void {
    this.addItem(sessionId, {
      role: 'agent',
      speakerName: 'AGENT (Greeting)',
      text: greetingText,
      turnId: 'turn-000',
    });
  }

  addTurn(sessionId: string, turnId: string, userText: string, agentText: string): void {
    // Add user entry
    this.addItem(sessionId, {
      role: 'user',
      speakerName: 'USER',
      text: userText,
      turnId,
    });

    // Add agent entry
    this.addItem(sessionId, {
      role: 'agent',
      speakerName: 'AGENT',
      text: agentText,
      turnId,
    });

    // Print high-visibility turn box in console
    if (process.env.NODE_ENV !== 'test') {
      console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
      console.log(`│ 🗣️ LIVE TURN [${turnId}] | Session: ${sessionId.slice(0, 8)}                              │`);
      console.log(`│ 👤 USER  : "${userText}"`);
      console.log(`│ 🤖 AGENT : "${agentText}"`);
      console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');
    }
  }

  addItem(sessionId: string, item: { role: 'system' | 'user' | 'agent'; speakerName?: string; text: string; turnId?: string }): void {
    let session = this.sessions.get(sessionId);
    if (!session) {
      this.startSession(sessionId);
      session = this.sessions.get(sessionId)!;
    }

    const newItem: TranscriptItem = {
      id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: item.role,
      speakerName: item.speakerName ?? item.role.toUpperCase(),
      text: item.text,
      timestamp: Date.now(),
      turnId: item.turnId,
    };

    session.items.push(newItem);
    logger.info({ sessionId, role: item.role, turnId: item.turnId, text: item.text }, `TRANSCRIPT [${item.turnId ?? 'SYS'}]: ${item.role.toUpperCase()} -> "${item.text}"`);
  }

  endSession(sessionId: string, reason?: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.endTime = Date.now();
      session.items.push({
        id: `sys-end-${Date.now()}`,
        role: 'system',
        text: `Call ended (${reason ?? 'normal'})`,
        timestamp: Date.now(),
      });

      console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
      console.log(`│ 🛑 CALL ENDED | Session ID: ${sessionId.slice(0, 8)}... (${reason ?? 'normal'})           │`);
      console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');
    }
  }

  getTranscript(sessionId: string): CallSessionTranscript | null {
    return this.sessions.get(sessionId) ?? null;
  }

  getLatestTranscript(): CallSessionTranscript | null {
    if (!this.latestSessionId) return null;
    return this.sessions.get(this.latestSessionId) ?? null;
  }

  getAllSessions(): CallSessionTranscript[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.startTime - a.startTime);
  }
}

export const liveTranscriptStore = new LiveTranscriptStore();
