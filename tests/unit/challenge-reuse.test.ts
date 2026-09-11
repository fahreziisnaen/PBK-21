import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
vi.mock('@/lib/prisma', () => ({ prisma: { authChallenge: { findFirst } } }));

const { findUsableChallenge } = await import('@/lib/rate-limit');
const { MAX_CHALLENGE_ATTEMPTS } = await import('@/lib/auth-challenge');

beforeEach(() => {
  findFirst.mockReset();
  findFirst.mockResolvedValue(null);
});

describe('findUsableChallenge', () => {
  it('hanya mencari challenge yang belum terpakai, belum kedaluwarsa, dan percobaannya masih sisa', async () => {
    // Each of these three conditions is load-bearing. Drop the attempts
    // filter and an exhausted row gets reused forever, locking the user out.
    // Drop consumedAt and a spent row is handed back. Drop expiresAt and the
    // five-minute life means nothing.
    await findUsableChallenge('u1', 'PASSWORD_RESET');

    const where = findFirst.mock.calls[0]?.[0]?.where;
    expect(where.userId).toBe('u1');
    expect(where.purpose).toBe('PASSWORD_RESET');
    expect(where.consumedAt).toBeNull();
    expect(where.expiresAt).toHaveProperty('gt');
    expect(where.attempts).toEqual({ lt: MAX_CHALLENGE_ATTEMPTS });
  });

  it('memisahkan tujuan, agar challenge login tidak dipakai untuk reset', async () => {
    await findUsableChallenge('u1', 'LOGIN');
    expect(findFirst.mock.calls[0]?.[0]?.where?.purpose).toBe('LOGIN');
  });

  it('mengembalikan null bila tidak ada yang masih hidup', async () => {
    expect(await findUsableChallenge('u1', 'LOGIN')).toBeNull();
  });

  it('mengembalikan challenge yang hidup agar percobaannya menumpuk di satu baris', async () => {
    // The point of the whole helper: without reuse every request minted a new
    // row and reset the attempt counter, so the cap bounded nothing.
    findFirst.mockResolvedValue({ id: 'c1' });
    expect(await findUsableChallenge('u1', 'PASSWORD_RESET')).toEqual({ id: 'c1' });
  });
});
