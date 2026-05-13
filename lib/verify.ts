import crypto from 'node:crypto';
import { env } from './env';

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

export function verifyLinqSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): VerifyResult {
  if (!timestamp) return { valid: false, reason: 'missing_timestamp' };
  if (!signature) return { valid: false, reason: 'missing_signature' };

  const ts = Number.parseInt(timestamp, 10);
  if (Number.isNaN(ts)) return { valid: false, reason: 'invalid_timestamp' };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return { valid: false, reason: 'timestamp_skew' };
  }

  const signedData = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', env.LINQ_WEBHOOK_SECRET)
    .update(signedData)
    .digest('hex');

  let expectedBuf: Buffer;
  let actualBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expected, 'hex');
    actualBuf = Buffer.from(signature, 'hex');
  } catch {
    return { valid: false, reason: 'signature_decode_failed' };
  }

  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, reason: 'signature_length_mismatch' };
  }

  const match = crypto.timingSafeEqual(expectedBuf, actualBuf);
  return match ? { valid: true } : { valid: false, reason: 'signature_mismatch' };
}