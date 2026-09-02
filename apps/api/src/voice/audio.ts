/**
 * Audio format conversion utilities for voice runtime.
 * Converts between μ-law 8kHz (telephony), PCM 16kHz (processing), and browser audio.
 */

// μ-law 8kHz → PCM 16kHz conversion
export function mulawToPcm16(mulawBuffer: Buffer): Buffer {
  const alignedMulaw = Buffer.from(mulawBuffer);
  const samples = new Int16Array(alignedMulaw.length);

  for (let i = 0; i < alignedMulaw.length; i++) {
    samples[i] = mulawDecode(alignedMulaw[i]);
  }

  // Upsample 8kHz → 16kHz (linear interpolation)
  const upsampled = new Int16Array(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    upsampled[i * 2] = samples[i];
    if (i + 1 < samples.length) {
      upsampled[i * 2 + 1] = Math.round((samples[i] + samples[i + 1]) / 2);
    } else {
      upsampled[i * 2 + 1] = samples[i];
    }
  }

  return Buffer.from(upsampled.buffer, upsampled.byteOffset, upsampled.byteLength);
}

// PCM 16kHz → μ-law 8kHz conversion with anti-aliasing low-pass filter
export function pcm16ToMulaw(pcm16Buffer: Buffer): Buffer {
  const alignedPcm = Buffer.from(pcm16Buffer);
  const sampleCount = Math.floor(alignedPcm.length / 2);
  const downsampleCount = Math.floor(sampleCount / 2);
  const output = new Uint8Array(downsampleCount);

  for (let i = 0; i < downsampleCount; i++) {
    const offset = i * 4;
    if (offset + 2 < alignedPcm.length) {
      // Average 2 adjacent 16kHz samples to prevent high-frequency aliasing noise
      const s1 = alignedPcm.readInt16LE(offset);
      const s2 = alignedPcm.readInt16LE(offset + 2);
      const avgSample = Math.round((s1 + s2) / 2);
      output[i] = mulawEncode(avgSample);
    }
  }

  return Buffer.from(output.buffer, output.byteOffset, output.byteLength);
}

// PCM 16kHz → base64 for WebSocket transport
export function pcm16ToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

// base64 → PCM 16kHz
export function base64ToPcm16(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

/**
 * Downsample 16kHz PCM16 -> 8kHz PCM16 with anti-aliasing low-pass filter.
 * Used for audio/x-l16;rate=8000 streaming (Plivo & Exotel).
 */
export function pcm16ToPcm8(buffer: Buffer): Buffer {
  const alignedPcm = Buffer.from(buffer);
  const inputSamples = Math.floor(alignedPcm.length / 2);
  const outputSamples = Math.floor(inputSamples / 2);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const byteOffset = i * 4;
    if (byteOffset + 2 < alignedPcm.length) {
      const s1 = alignedPcm.readInt16LE(byteOffset);
      const s2 = alignedPcm.readInt16LE(byteOffset + 2);
      const avg = Math.round((s1 + s2) / 2);
      output.writeInt16LE(avg, i * 2);
    }
  }

  return output;
}

/**
 * Upsample 8kHz PCM16 -> 16kHz PCM16 with linear interpolation.
 * Used for audio/x-l16;rate=8000 incoming streams -> Sarvam STT.
 */
export function pcm8ToPcm16(buffer: Buffer): Buffer {
  const alignedPcm = Buffer.from(buffer);
  const sampleCount = Math.floor(alignedPcm.length / 2);
  const upsampled = new Int16Array(sampleCount * 2);

  for (let i = 0; i < sampleCount; i++) {
    const s1 = alignedPcm.readInt16LE(i * 2);
    upsampled[i * 2] = s1;
    if ((i + 1) * 2 < alignedPcm.length) {
      const s2 = alignedPcm.readInt16LE((i + 1) * 2);
      upsampled[i * 2 + 1] = Math.round((s1 + s2) / 2);
    } else {
      upsampled[i * 2 + 1] = s1;
    }
  }

  return Buffer.from(upsampled.buffer, upsampled.byteOffset, upsampled.byteLength);
}

/**
 * μ-law encode a single 16-bit PCM sample.
 * ITU-T G.711 μ-law encoding.
 */
function mulawEncode(sample: number): number {
  const MULAW_MAX = 0x1FFF;
  const MULAW_BIAS = 33;

  // Clamp to 16-bit range
  sample = Math.max(-32768, Math.min(32767, sample));

  let sign = 0;
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }

  sample += MULAW_BIAS;

  let exponent = 0;
  let mantissa = 0;

  // Find the exponent (segment)
  for (let i = 0; i < 8; i++) {
    if (sample >= (1 << (exponent + 7))) {
      exponent = i + 1;
    }
  }

  if (exponent >= 8) {
    exponent = 7;
  }

  // Find mantissa
  mantissa = (sample >> (exponent + 3)) & 0x0F;

  // Combine into μ-law byte
  const mulawByte = ~(sign | (exponent << 4) | mantissa) & 0xFF;
  return mulawByte;
}

/**
 * μ-law decode a single byte to 16-bit PCM sample.
 * ITU-T G.711 μ-law decoding.
 */
function mulawDecode(mulawByte: number): number {
  const MULAW_BIAS = 33;

  mulawByte = ~mulawByte & 0xFF;

  const sign = (mulawByte & 0x80) !== 0;
  let exponent = (mulawByte >> 4) & 0x07;
  const mantissa = mulawByte & 0x0F;

  let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
  sample -= MULAW_BIAS;

  return sign ? -sample : sample;
}

/**
 * Detect audio format from buffer (heuristic — not perfect).
 * For real detection, format should come from session config.
 */
export function detectAudioFormat(buffer: Buffer): 'mulaw' | 'pcm16' | 'unknown' {
  if (buffer.length === 0) return 'unknown';

  // Check for MP3 header
  if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
    return 'unknown'; // MP3 — not our primary format
  }

  // Simple heuristic: μ-law has more concentrated values (0-255)
  // PCM has wider range of values
  const first100 = buffer.slice(0, Math.min(100, buffer.length));
  const avgValue = first100.reduce((sum, b) => sum + b, 0) / first100.length;

  // μ-law values tend to cluster around the middle (128 ± some range)
  if (avgValue > 90 && avgValue < 170) {
    return 'mulaw';
  }

  return 'pcm16';
}
