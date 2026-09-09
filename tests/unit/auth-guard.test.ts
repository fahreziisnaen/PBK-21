import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: authMock }));

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
});

describe('requireUser', () => {
  it('mengembalikan user dari sesi aktif', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'BENDAHARA', name: 'A', email: 'a@b.c' } });

    const user = await requireUser();

    expect(user).toEqual({ id: 'u1', role: 'BENDAHARA', name: 'A', email: 'a@b.c' });
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
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });

    const user = await requireRole('ADMIN', 'BENDAHARA');

    expect(user.role).toBe('ADMIN');
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirect ke /dashboard bila peran tidak termasuk yang diizinkan (mis. KEPALA_SEKOLAH mencoba aksi tulis)', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'KEPALA_SEKOLAH' } });

    await expect(requireRole('ADMIN', 'BENDAHARA')).rejects.toThrow('REDIRECT:/dashboard');
    expect(redirectMock).toHaveBeenCalledWith('/dashboard');
  });

  it('redirect ke /login (bukan /dashboard) bila belum masuk sama sekali', async () => {
    authMock.mockResolvedValue(null);

    await expect(requireRole('ADMIN')).rejects.toThrow('REDIRECT:/login');
  });
});
