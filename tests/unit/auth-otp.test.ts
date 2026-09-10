import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Secret, TOTP } from 'otpauth';

// Mocked so authorizeOtp is exercised against controllable challenge/user
// state without a real database. recordAuthEvent (Task 7) calls
// prisma.authEvent.create internally, so that method is stubbed too —
// otherwise every branch that logs an AuthEvent would throw on a real
// Prisma client call.
const authChallengeFindUnique = vi.fn();
const authChallengeUpdate = vi.fn();
const userUpdate = vi.fn();
const authEventCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    authChallenge: { findUnique: authChallengeFindUnique, update: authChallengeUpdate },
    user: { update: userUpdate },
    authEvent: { create: authEventCreate },
  },
}));

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'test-auth-secret-32-chars-min-12345';
  process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 3).toString('base64');
});

const { authorizeOtp } = await import('@/lib/auth-otp');
const { encryptSecret } = await import('@/lib/crypto');
const { generateTotpSecret } = await import('@/lib/totp');

/** Mirrors totp.ts's `totpFor` exactly, so the code it produces is one
 * `verifyTotp` genuinely accepts — not a value assumed to work. */
function currentTotpCode(secretBase32: string): string {
  const totp = new TOTP({
    issuer: 'PBK',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}

type StoredChallenge = {
  id: string;
  userId: string;
  purpose: string;
  method: string;
  otpHash: string | null;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
};

let stored: StoredChallenge;
let plainSecret: string;
let user: {
  id: string;
  name: string;
  email: string | null;
  role: string;
  isActive: boolean;
  totpEnabledAt: Date | null;
  totpSecret: string | null;
  phone: string | null;
  username: string;
};

function resetChallenge(overrides: Partial<StoredChallenge> = {}) {
  stored = {
    id: 'chal-1',
    userId: user.id,
    purpose: 'LOGIN',
    method: 'TOTP',
    otpHash: null,
    expiresAt: new Date(Date.now() + 5 * 60_000),
    attempts: 0,
    consumedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  plainSecret = generateTotpSecret();
  user = {
    id: 'u1',
    name: 'Admin',
    email: 'admin@pbk.local',
    role: 'SUPERADMIN',
    isActive: true,
    totpEnabledAt: new Date('2026-01-01T00:00:00Z'),
    totpSecret: encryptSecret(plainSecret),
    phone: null,
    username: 'admin',
  };
  resetChallenge();

  authChallengeFindUnique.mockImplementation(async () => ({ ...stored, user }));
  // Faithful enough to real Prisma semantics for this test's purposes:
  // applies a plain field assignment, or a numeric `{ increment }` update.
  authChallengeUpdate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => {
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && 'increment' in value) {
          const current = stored[key as keyof StoredChallenge] as unknown as number;
          (stored as unknown as Record<string, unknown>)[key] =
            current + (value as { increment: number }).increment;
        } else {
          (stored as unknown as Record<string, unknown>)[key] = value;
        }
      }
      return { ...stored, user };
    },
  );
  userUpdate.mockResolvedValue(user);
  authEventCreate.mockResolvedValue({});
});

describe('authorizeOtp — TOTP: replay of a consumed challenge (regression)', () => {
  // This is the exact hole the amendment closed: an earlier draft inferred
  // "bootstrap" from `state === 'consumed' && challenge.otpHash === null`,
  // which is indistinguishable from a *legitimately consumed TOTP challenge*
  // (only WA_OTP challenges ever carry an otpHash). That predicate let the
  // very same correct TOTP code be replayed indefinitely, because a
  // consumed challenge was never checked for "already used" at all.
  it('accepts a correct code once, then rejects the identical replay', async () => {
    const code = currentTotpCode(plainSecret);

    const first = await authorizeOtp({ challengeId: stored.id, code });
    expect(first).toEqual({ id: user.id, name: user.name, email: user.email, role: user.role });
    expect(stored.consumedAt).not.toBeNull();

    const second = await authorizeOtp({ challengeId: stored.id, code });
    expect(second).toBeNull();
  });

  it('rejects a challenge that starts out already consumed, even with the correct code', async () => {
    resetChallenge({ consumedAt: new Date(Date.now() - 60_000) });
    const code = currentTotpCode(plainSecret);

    const result = await authorizeOtp({ challengeId: stored.id, code });

    expect(result).toBeNull();
  });
});

describe('authorizeOtp — kode TOTP salah', () => {
  it('menaikkan attempts dan menolak', async () => {
    const result = await authorizeOtp({ challengeId: stored.id, code: '000000' });

    expect(result).toBeNull();
    expect(stored.attempts).toBe(1);
    expect(stored.consumedAt).toBeNull();
  });
});

describe('authorizeOtp — challenge kedaluwarsa', () => {
  it('ditolak walau kode benar', async () => {
    resetChallenge({ expiresAt: new Date(Date.now() - 60_000) });
    const code = currentTotpCode(plainSecret);

    const result = await authorizeOtp({ challengeId: stored.id, code });

    expect(result).toBeNull();
  });
});

describe('authorizeOtp — bootstrap (tanpa TOTP maupun telepon)', () => {
  beforeEach(() => {
    user.totpEnabledAt = null;
    user.totpSecret = null;
    user.phone = null;
    resetChallenge({ method: 'TOTP', otpHash: null });
  });

  it('diterima tanpa kode, lalu ditolak saat challenge yang sama dipakai ulang', async () => {
    const first = await authorizeOtp({ challengeId: stored.id, code: '' });
    expect(first).toEqual({ id: user.id, name: user.name, email: user.email, role: user.role });
    expect(stored.consumedAt).not.toBeNull();

    const second = await authorizeOtp({ challengeId: stored.id, code: '' });
    expect(second).toBeNull();
  });
});

describe('authorizeOtp — purpose selain LOGIN', () => {
  it('ditolak', async () => {
    resetChallenge({ purpose: 'PASSWORD_RESET' });
    const code = currentTotpCode(plainSecret);

    const result = await authorizeOtp({ challengeId: stored.id, code });

    expect(result).toBeNull();
  });
});
