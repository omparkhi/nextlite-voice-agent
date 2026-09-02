/**
 * Plivo Telephony Provider Types
 * Defines current official Plivo Audio Streaming WebSocket protocol & REST API structures.
 */

// Incoming Plivo-to-Server WebSocket Events
export interface PlivoStartEvent {
  event: 'start';
  sequenceNumber?: string;
  start: {
    streamId: string;
    callId?: string;
    accountSid?: string;
    tracks?: string[];
    mediaFormat?: {
      encoding?: string;
      sampleRate?: number;
      channels?: number;
    };
    customHeaders?: Record<string, string>;
  };
  streamId: string;
}

export interface PlivoMediaEvent {
  event: 'media';
  sequenceNumber?: string;
  media: {
    track?: string;
    chunk?: string;
    timestamp?: string;
    payload: string; // Base64 audio string
  };
  streamId: string;
}

export interface PlivoDtmfEvent {
  event: 'dtmf';
  streamId: string;
  dtmf: {
    digit: string;
  };
}

export interface PlivoPlayedStreamEvent {
  event: 'playedStream';
  streamId: string;
  name?: string;
}

export interface PlivoClearedAudioEvent {
  event: 'clearedAudio';
  streamId: string;
}

export interface PlivoStopEvent {
  event: 'stop';
  streamId: string;
}

export type PlivoIncomingWebSocketEvent =
  | PlivoStartEvent
  | PlivoMediaEvent
  | PlivoDtmfEvent
  | PlivoPlayedStreamEvent
  | PlivoClearedAudioEvent
  | PlivoStopEvent;

// Outbound Server-to-Plivo WebSocket Events
export interface PlivoPlayAudioOutbound {
  event: 'playAudio';
  media: {
    contentType: string; // e.g. "audio/x-l16" or "audio/x-mulaw"
    sampleRate: number; // e.g. 16000 or 8000
    payload: string; // Base64 audio string
  };
}

export interface PlivoCheckpointOutbound {
  event: 'checkpoint';
  name: string;
}

export interface PlivoClearAudioOutbound {
  event: 'clearAudio';
}

export type PlivoOutboundWebSocketEvent =
  | PlivoPlayAudioOutbound
  | PlivoCheckpointOutbound
  | PlivoClearAudioOutbound;

// Outbound Call API Options & Credentials
export interface PlivoOutboundCallOptions {
  from: string;
  to: string;
  answerUrl: string;
  answerMethod?: 'GET' | 'POST';
  statusCallbackUrl?: string;
  statusCallbackMethod?: 'GET' | 'POST';
  record?: boolean;
  timeLimit?: number;
  customHeaders?: Record<string, string>;
}

export interface PlivoCallResponse {
  callUuid: string;
  message: string;
  apiId?: string;
  status?: string;
}

export interface PlivoRecordingRecord {
  recordingId: string;
  recordingUrl: string;
  duration?: number;
  status?: string;
  callUuid?: string;
}
