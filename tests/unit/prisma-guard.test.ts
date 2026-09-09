import { afterEach, describe, expect, it, vi } from 'vitest';

describe('src/lib/prisma — penjaga DATABASE_URL', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    vi.resetModules();
  });

  it('melempar error yang jelas saat DATABASE_URL tidak diisi, bukan diam-diam jatuh ke PG* ambien', async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();

    await expect(import('@/lib/prisma')).rejects.toThrow(/DATABASE_URL belum diisi/);
  });

  it('tidak melempar apa pun saat DATABASE_URL terisi', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
    vi.resetModules();

    await expect(import('@/lib/prisma')).resolves.toBeDefined();
  });
});
