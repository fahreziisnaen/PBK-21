import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const CHALLENGE_COOKIE = 'pbk_chal';
export const CHALLENGE_TTL_MINUTES = 5;
export const MAX_CHALLENGE_ATTEMPTS = 5;

export type ChallengeState = 'usable' | 'expired' | 'consumed' | 'exhausted';

/** Pure, so the state machine is testable without a database. */
export function evaluateChallenge(
  c: { expiresAt: Date; consumedAt: Date | null; attempts: number },
  now: Date,
): ChallengeState {
  if (c.consumedAt) return 'consumed';
  if (c.attempts >= MAX_CHALLENGE_ATTEMPTS) return 'exhausted';
  if (c.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'usable';
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function otpKey(): string {
  // Reuses AUTH_SECRET: the OTP hash only needs to be unforgeable by someone
  // holding the database, and it lives for five minutes.
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET belum diisi — lihat .env.example.');
  return secret;
}

export function hashOtp(code: string): string {
  return createHmac('sha256', otpKey()).update(code).digest('hex');
}

export function verifyOtpHash(code: string, hash: string): boolean {
  const a = Buffer.from(hashOtp(code), 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
