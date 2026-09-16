import { afterEach, describe, expect, it, vi } from 'vitest';

describe('src/lib/prisma — penjaga DATABASE_URL', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    vi.resetModules();
  });

  it('melempar error yang jelas saat DATABASE_URL tidak diisi, bukan diam-diam jatuh ke PG* ambien', async () => {
    // Dikosongkan, BUKAN dihapus. `process.env` dipakai bersama seluruh proses
    // uji, dan berkas uji lain bisa memuat .env lewat dotenv — yang mengisi
    // ulang kunci yang tidak ada, tetapi melewati kunci yang sudah ada meski
    // isinya kosong. Dengan `delete`, impor di bawah ini kadang menemukan
    // DATABASE_URL sudah terisi lagi dan tidak jadi melempar error.
    process.env.DATABASE_URL = '';
    vi.resetModules();

    await expect(import('@/lib/prisma')).rejects.toThrow(/DATABASE_URL belum diisi/);
  });

  it('tidak melempar apa pun saat DATABASE_URL terisi', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
    vi.resetModules();

    await expect(import('@/lib/prisma')).resolves.toBeDefined();
  });

  it('tetap melempar meski ada modul lain yang memuat .env di tengah jalan', async () => {
    process.env.DATABASE_URL = '';
    vi.resetModules();

    // Persis yang dilakukan prisma/seed.ts saat diimpor oleh seed.test.ts.
    await import('dotenv/config');
    expect(process.env.DATABASE_URL).toBe('');

    await expect(import('@/lib/prisma')).rejects.toThrow(/DATABASE_URL belum diisi/);
  });
});
