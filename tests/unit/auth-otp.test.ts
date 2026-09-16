import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Secret, TOTP } from 'otpauth';

// Mocked so authorizeOtp is exercised against controllable challenge/user
// state without a real database. recordAuthEvent (Task 7) calls
// prisma.authEvent.create internally, so that method is stubbed too —
// otherwise every branch that logs an AuthEvent would throw on a real
// Prisma client call.
const authChallengeFindUnique = vi.fn();
const authChallengeUpdate = vi.fn();
const authChallengeUpdateMany = vi.fn();
const authChallengeAggregate = vi.fn();
const userUpdate = vi.fn();
const authEventCreate = vi.fn();
const executeRaw = vi.fn();

// spendChallenge runs inside prisma.$transaction and takes an advisory lock
// with $executeRaw. The mock hands the same client back as the transaction
// client, so the stateful stubs below see every write. It does NOT serialize
// concurrent callers — the real lock is proven against PostgreSQL in
// tests/e2e/challenge-concurrency.spec.ts, which a mock cannot do.
vi.mock('@/lib/prisma', () => {
  const client: Record<string, unknown> = {
    authChallenge: {
      findUnique: authChallengeFindUnique,
      update: authChallengeUpdate,
      updateMany: authChallengeUpdateMany,
      aggregate: authChallengeAggregate,
    },
    user: { update: userUpdate },
    authEvent: { create: authEventCreate },
    $executeRaw: executeRaw,
  };
  client.$transaction = async (fn: (tx: unknown) => unknown) => fn(client);
  return { prisma: client };
});

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'test-auth-secret-32-chars-min-12345';
  process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 3).toString('base64');
});

const { authorizeOtp } = await import('@/lib/auth-otp');
const { encryptSecret } = await import('@/lib/crypto');
const { generateTotpSecret } = await import('@/lib/totp');

/** Mirrors totp.ts's `totpFor` exactly, so the code it produces is one
 * `verifyTotp` genuinely accepts — not a value assumed to work. The issuer is
 * display-only metadata and never enters the hash, which is exactly why the
 * rename to KASERA cannot lock out an already-enrolled account. */
function currentTotpCode(secretBase32: string): string {
  const totp = new TOTP({
    issuer: 'KASERA',
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
  executeRaw.mockResolvedValue(1);
  // The trailing-day wrong-code sum, drawn from the one stored challenge.
  authChallengeAggregate.mockImplementation(async () => ({ _sum: { attempts: stored.attempts } }));
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
  // Models the database's conditional write: the `consumedAt: null` filter
  // is applied to the row itself, so a second caller racing the first sees
  // count 0. Without honouring the filter here the test could not tell an
  // atomic consume from a read-then-write one.
  authChallengeUpdateMany.mockImplementation(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if ('consumedAt' in where && where.consumedAt === null && stored.consumedAt !== null) {
        return { count: 0 };
      }
      for (const [key, value] of Object.entries(data)) {
        (stored as unknown as Record<string, unknown>)[key] = value;
      }
      return { count: 1 };
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
    expect(first).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      // Frozen into the JWT so a later password change invalidates this
      // session; 0 because this fixture has never changed its password.
      passwordChangedAt: 0,
    });
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
    expect(first).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      // Frozen into the JWT so a later password change invalidates this
      // session; 0 because this fixture has never changed its password.
      passwordChangedAt: 0,
    });
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

describe('authorizeOtp — ketahanan tepi', () => {
  it('hanya satu dari dua pengiriman serentak dengan kode benar yang menerbitkan sesi', async () => {
    resetChallenge({});
    const code = currentTotpCode(plainSecret);

    // Both start before either finishes, so a read-then-write consume would
    // let both through — the single-use guarantee has to come from the
    // conditional write itself.
    const [a, b] = await Promise.all([
      authorizeOtp({ challengeId: stored.id, code }),
      authorizeOtp({ challengeId: stored.id, code }),
    ]);

    const issued = [a, b].filter((r) => r !== null);
    expect(issued).toHaveLength(1);
  });

  it('menghitung kegagalan saat rahasia TOTP rusak, bukan melempar keluar', async () => {
    resetChallenge({});
    user.totpSecret = 'bukan-payload-terenkripsi-yang-sah';
    const before = stored.attempts;

    const result = await authorizeOtp({ challengeId: stored.id, code: '123456' });

    expect(result).toBeNull();
    expect(stored.attempts).toBe(before + 1);
  });
});

describe('authorizeOtp — batas kode salah harian', () => {
  it('menolak kode yang BENAR bila jatah kode salah hari ini sudah habis', async () => {
    // The daily limit is enforced on every guess, not only when a challenge
    // is issued. Otherwise a burst of parallel requests could issue rows past
    // the budget and every guess on them would go unmetered.
    resetChallenge({});
    authChallengeAggregate.mockResolvedValue({ _sum: { attempts: 10 } });
    const before = stored.attempts;

    const result = await authorizeOtp({ challengeId: stored.id, code: currentTotpCode(plainSecret) });

    expect(result).toBeNull();
    // Refused before verification: no attempt spent, nothing consumed.
    expect(stored.attempts).toBe(before);
    expect(stored.consumedAt).toBeNull();
    const logged = authEventCreate.mock.calls.map((c) => c[0]?.data);
    expect(logged).toContainEqual(
      expect.objectContaining({ event: 'login.otp_exhausted', meta: { scope: 'daily' } }),
    );
  });

  it('masih menerima kode benar selama jatah belum habis', async () => {
    resetChallenge({});
    authChallengeAggregate.mockResolvedValue({ _sum: { attempts: 9 } });

    const result = await authorizeOtp({ challengeId: stored.id, code: currentTotpCode(plainSecret) });

    expect(result).not.toBeNull();
  });
});
