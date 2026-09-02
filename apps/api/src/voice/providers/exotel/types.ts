// Exotel AgentStream types
// Reference: https://docs.exotel.com/exotel-agentstream/connect-voice-ai-api
// Reference: https://docs.exotel.com/exotel-agentstream/voicebot-applet

export interface ExotelConfig {
  accountSid: string;
  apiKey: string;
  apiToken: string;
  callerId: string;
  baseUrl: string;
}

export interface ExotelTransportOptions {
  /** Sample rate negotiated via query parameter (default: 8000) */
  sampleRate?: number;
}

// --- WebSocket Events (Exotel → Bot) ---
// IMPORTANT: Exotel uses snake_case field names
// The start event has a nested start object

export interface ExotelConnectedEvent {
  event: 'connected';
}

/**
 * Exotel start event — has nested structure.
 * Official format:
 * {
 *   "event": "start",
 *   "sequence_number": 1,
 *   "stream_sid": "<stream sid>",
 *   "start": {
 *     "stream_sid": "<>",
 *     "call_sid": "",
 *     "account_sid": "",
 *     "from": "",
 *     "to": "",
 *     "custom_parameters": {...},
 *     "media_format": {
 *       "encoding": "<>",
 *       "sample_rate": "<>",
 *       "bit_rate": "<>"
 *     }
 *   }
 * }
 */
export interface ExotelStartEvent {
  event: 'start';
  sequence_number?: number;
  stream_sid?: string;
  start?: {
    stream_sid?: string;
    call_sid?: string;
    account_sid?: string;
    from?: string;
    to?: string;
    custom_parameters?: Record<string, string>;
    media_format?: {
      encoding?: string;
      sample_rate?: string;
      bit_rate?: string;
    };
  };
  // Legacy camelCase support (for backwards compatibility)
  streamSid?: string;
  callSid?: string;
  from?: string;
  to?: string;
  direction?: string;
  customField?: string;
}

/**
 * Exotel media event.
 * Official format:
 * {
 *   "event": "media",
 *   "sequence_number": 3,
 *   "stream_sid": "<stream sid>",
 *   "media": {
 *     "chunk": 2,
 *     "timestamp": "10",
 *     "payload": "<base64 PCM16>"
 *   }
 * }
 *
 * Audio format: raw/slin (16-bit, 8kHz, mono PCM little-endian) encoded in base64.
 * NOT μ-law.
 */
export interface ExotelMediaEvent {
  event: 'media';
  sequence_number?: number;
  stream_sid?: string;
  media: {
    chunk?: number;
    timestamp?: string;
    payload: string; // base64-encoded PCM16 audio
  };
}

export interface ExotelMarkEvent {
  event: 'mark';
  sequence_number?: number;
  stream_sid?: string;
  mark: {
    name: string;
  };
}

/**
 * Exotel stop event.
 * Official format:
 * {
 *   "event": "stop",
 *   "sequence_number": 10,
 *   "stream_sid": "<stream sid>",
 *   "stop": {
 *     "call_sid": "<>",
 *     "account_sid": "<>",
 *     "reason": "stopped or callended"
 *   }
 * }
 */
export interface ExotelStopEvent {
  event: 'stop';
  sequence_number?: number;
  stream_sid?: string;
  stop?: {
    call_sid?: string;
    account_sid?: string;
    reason?: string;
  };
  // Legacy support
  callSid?: string;
}

export interface ExotelDtmfEvent {
  event: 'dtmf';
  sequence_number?: number;
  stream_sid?: string;
  dtmf: {
    duration?: string;
    digit?: string;
  };
}

export type ExotelInboundEvent =
  | ExotelConnectedEvent
  | ExotelStartEvent
  | ExotelMediaEvent
  | ExotelMarkEvent
  | ExotelStopEvent
  | ExotelDtmfEvent;

// --- WebSocket Events (Bot → Exotel) ---
// Official format uses snake_case

export interface ExotelMediaOutEvent {
  event: 'media';
  stream_sid: string;
  media: {
    payload: string; // base64-encoded PCM16 audio
  };
}

export interface ExotelClearEvent {
  event: 'clear';
  stream_sid: string;
}

export interface ExotelMarkOutEvent {
  event: 'mark';
  stream_sid: string;
  mark: {
    name: string;
  };
}

export type ExotelOutboundEvent =
  | ExotelMediaOutEvent
  | ExotelClearEvent
  | ExotelMarkOutEvent;

// --- API Types ---

export interface ExotelOutboundCallParams {
  from: string;
  callerid: string;
  streamUrl: string;
  streamType: 'bidirectional';
  record?: boolean;
  statusCallback?: string;
  statusCallbackEvents?: string[];
  timeLimit?: number;
  customField?: string;
}

export interface ExotelCallResponse {
  call: {
    sid: string;
    status: string;
    from: string;
    to?: string;
    accountSid?: string;
    phonenumbersid?: string;
    direction?: string;
    datecreated?: string;
    recordingurl?: string | null;
  };
}

export type ExotelCallStatus =
  | 'queued'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'busy'
  | 'no-answer';

// --- Call Status Callback ---

export interface ExotelStatusCallback {
  CallSid: string;
  CallStatus: ExotelCallStatus;
  From: string;
  To: string;
  Direction: string;
  StartTime?: string;
  EndTime?: string;
  Duration?: string;
  RecordingUrl?: string;
}
