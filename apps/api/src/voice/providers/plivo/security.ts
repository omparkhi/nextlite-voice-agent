import crypto from 'crypto';

/**
 * Validates Plivo V3 signature for incoming WebSocket/HTTP requests.
 * Checks X-Plivo-Signature-V3 and X-Plivo-Signature-V3-Nonce using PLIVO_AUTH_TOKEN.
 */
export function validatePlivoV3Signature(
  url: string,
  nonce: string | undefined,
  signature: string | undefined,
  authToken: string,
): boolean {
  if (!signature || !authToken) return false;

  try {
    const dataToSign = nonce ? `${url}${nonce}` : url;
    const computedSignature = crypto
      .createHmac('sha256', authToken)
      .update(dataToSign)
      .digest('base64');

    const signatureBuffer = Buffer.from(signature);
    const computedBuffer = Buffer.from(computedSignature);

    if (signatureBuffer.length !== computedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}
