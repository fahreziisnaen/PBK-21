import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: authMock }));

// requireUser re-reads the user on every call: a valid cookie is not enough,
// since a session must stop working once its owner's password changes or the
// account is deactivated. Default is a healthy, current account; individual
// tests override it.
const userFindUnique = vi.fn();
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: userFindUnique } } }));

const redirectMock = vi.fn((url: string) => {
  // next/navigation's real redirect() throws a special NEXT_REDIRECT value
  // to unwind the render — mimicked here so requireUser/requireRole never
  // fall through past the redirect call during a test.
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

const { requireUser, requireRole } = await import('@/lib/auth-guard');

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  userFindUnique.mockReset();
  userFindUnique.mockResolvedValue({ passwordChangedAt: null, isActive: true });
});

describe('requireUser', () => {
  it('mengembalikan user dari sesi aktif', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'BENDAHARA', name: 'A', email: 'a@b.c', passwordStamp: 0 } });

    const user = await requireUser();

    expect(user).toEqual({ id: 'u1', role: 'BENDAHARA', name: 'A', email: 'a@b.c', passwordStamp: 0 });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirect ke /login bila tidak ada sesi', async () => {
    authMock.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow('REDIRECT:/login');
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('redirect ke /login bila sesi ada tapi tanpa user', async () => {
    authMock.mockResolvedValue({});

    await expect(requireUser()).rejects.toThrow('REDIRECT:/login');
  });
});

describe('requireRole', () => {
  it('mengembalikan user bila perannya termasuk yang diizinkan', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', passwordStamp: 0 } });

    const user = await requireRole('ADMIN', 'BENDAHARA');

    expect(user.role).toBe('ADMIN');
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirect ke /dashboard bila peran tidak termasuk yang diizinkan (mis. KEPALA_SEKOLAH mencoba aksi tulis)', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'KEPALA_SEKOLAH', passwordStamp: 0 } });

    await expect(requireRole('ADMIN', 'BENDAHARA')).rejects.toThrow('REDIRECT:/dashboard');
    expect(redirectMock).toHaveBeenCalledWith('/dashboard');
  });

  it('redirect ke /login (bukan /dashboard) bila belum masuk sama sekali', async () => {
    authMock.mockResolvedValue(null);

    await expect(requireRole('ADMIN')).rejects.toThrow('REDIRECT:/login');
  });
});

describe('requireUser — sesi yang sudah tidak sah', () => {
  it('menolak sesi yang terbit sebelum sandi diubah', async () => {
    // The hole this closes: a Server Action never renders a layout, so
    // checking staleness only there left confirmEnrollment callable from a
    // session a password reset was supposed to kill.
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'BENDAHARA', name: 'A', email: 'a@b.c', passwordStamp: 0 } });
    userFindUnique.mockResolvedValue({ passwordChangedAt: new Date(), isActive: true });

    await expect(requireUser()).rejects.toThrow('REDIRECT:/login?reset=1');
  });

  it('menolak pengguna yang sudah dinonaktifkan', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'BENDAHARA', name: 'A', email: 'a@b.c', passwordStamp: 0 } });
    userFindUnique.mockResolvedValue({ passwordChangedAt: null, isActive: false });

    await expect(requireUser()).rejects.toThrow('REDIRECT:/login');
  });

  it('menolak sesi yang penggunanya sudah tidak ada', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'BENDAHARA', name: 'A', email: 'a@b.c', passwordStamp: 0 } });
    userFindUnique.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow('REDIRECT:/login');
  });
});
