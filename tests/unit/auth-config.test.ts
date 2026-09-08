import { describe, expect, it } from 'vitest';
import { authConfig } from '@/lib/auth.config';

describe('authConfig', () => {
  it('memakai halaman login kustom', () => {
    expect(authConfig.pages?.signIn).toBe('/login');
  });

  it('memakai strategi JWT', () => {
    expect(authConfig.session?.strategy).toBe('jwt');
  });

  it('menyalin id dan role dari token ke sesi', async () => {
    const session = { user: { name: 'A', email: 'a@b.c' } } as never;
    const token = { sub: 'u1', role: 'BENDAHARA' } as never;
    const out = await authConfig.callbacks!.session!({ session, token } as never);
    expect(out.user.id).toBe('u1');
    expect(out.user.role).toBe('BENDAHARA');
  });
});
