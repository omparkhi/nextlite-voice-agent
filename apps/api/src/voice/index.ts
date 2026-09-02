// Voice runtime module — shared agent runtime for all transports

export { VoiceRuntime, createVoiceRuntime } from './runtime.js';
export type { VoiceRuntimeConfig } from './runtime.js';
export { VoiceSession } from './session.js';
export { ChatTestTransport, BaseTransport } from './transports.js';
export * from './types.js';
export * from './audio.js';

// Telephony providers
export { ExotelClient, createExotelClient, ExotelTransport } from './providers/exotel/index.js';
export type { ExotelConfig, ExotelOutboundCallParams } from './providers/exotel/types.js';

// Browser Web Voice transport
export { BrowserTransport } from './providers/browser/index.js';
export type { BrowserTransportOptions } from './providers/browser/index.js';

// STT providers
export { SarvamSTTAdapter, createSarvamSTTAdapter } from './providers/sarvam/index.js';
export type { SarvamSTTConfig } from './providers/sarvam/index.js';

// TTS providers
export { SarvamTTSAdapter, createSarvamTTSAdapter } from './providers/sarvam/index.js';
export type { SarvamTTSConfig } from './providers/sarvam/index.js';

// Telephony service
export { createTelephonyService } from './telephony.js';
export type { TelephonyService } from './telephony.js';

// Voice WebSocket server and routes
export { setupVoiceWebSocket, getActiveSessions } from './server.js';
