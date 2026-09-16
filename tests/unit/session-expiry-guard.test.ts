import { describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: userFindUnique } } }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error('REDIRECT:' + to); },
}));

const { requireUser } = await import('@/lib/auth-guard');

/**
 * isSessionExpired sendiri diuji terpisah di session-expiry.test.ts. Yang
 * dibuktikan di sini adalah aturannya benar-benar DIPASANG di requireUser —
 * mematikan pemanggilannya membuat uji ini lolos begitu saja.
 */
describe('requireUser menolak sesi tak-diingat yang sudah lewat jendelanya', () => {
  it('mengarahkan ke /login?ended=1', async () => {
    authMock.mockResolvedValue({
      user: { id: 'u1', role: 'BENDAHARA', name: 'A', email: 'a@b.c',
              passwordStamp: 0, remember: false, loginAt: Date.now() - 9 * 3600_000 },
    });
    userFindUnique.mockResolvedValue({
      passwordChangedAt: null, isActive: true, mustChangePassword: false,
      totpEnabledAt: new Date(), phone: null, role: 'BENDAHARA',
    });
    await expect(requireUser()).rejects.toThrow('REDIRECT:/login?ended=1');
  });
});
