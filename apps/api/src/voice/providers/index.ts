// Telephony providers
// Pluggable provider architecture for telephony services

export { ExotelClient, createExotelClient, ExotelTransport } from './exotel/index.js';
export type { ExotelConfig, ExotelOutboundCallParams } from './exotel/types.js';

// STT providers
export { SarvamSTTAdapter, createSarvamSTTAdapter } from './sarvam/index.js';
export type { SarvamSTTConfig } from './sarvam/index.js';
