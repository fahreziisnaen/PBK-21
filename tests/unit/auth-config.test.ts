import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

describe('invarian Edge-safety: src/lib/auth.config.ts', () => {
  // src/proxy.ts mengimpor authConfig, dan Next 16 mengompilasi proxy.ts
  // untuk runtime Node — bukan Edge — sehingga kompiler TIDAK LAGI menangkap
  // pelanggaran (import Node-only tidak akan gagal build). Test ini
  // menggantikan jaminan yang dulunya didapat gratis dari compiler.
  const source = readFileSync('src/lib/auth.config.ts', 'utf8');

  it('tidak mengimpor @/lib/prisma', () => {
    expect(source).not.toMatch(/@\/lib\/prisma/);
  });

  it('tidak mengimpor bcryptjs', () => {
    expect(source).not.toMatch(/bcryptjs/);
  });

  it('tidak melakukan value-import dari @prisma/client (type-only tetap diperbolehkan)', () => {
    const importLines = source.split('\n').filter((l) => l.includes("from '@prisma/client'"));
    for (const line of importLines) expect(line).toMatch(/^\s*import type /);
  });
});
