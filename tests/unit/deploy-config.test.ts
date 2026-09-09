import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('konfigurasi build', () => {
  it('mengaktifkan output standalone untuk image ramping', () => {
    expect(read('next.config.ts')).toMatch(/output:\s*['"]standalone['"]/);
  });
});

describe('Dockerfile', () => {
  const df = read('Dockerfile');

  it('memakai build bertahap', () => {
    expect(df).toMatch(/AS deps/);
    expect(df).toMatch(/AS builder/);
    expect(df).toMatch(/AS runner/);
  });

  it('menjalankan prisma generate sebelum build', () => {
    const gen = df.indexOf('prisma generate');
    const build = df.indexOf('npm run build');
    expect(gen).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(gen);
  });

  it('memasang openssl yang dibutuhkan Prisma di Alpine', () => {
    expect(df).toMatch(/apk add[^\n]*openssl/);
  });

  it('berjalan sebagai user non-root', () => {
    expect(df).toMatch(/USER nextjs/);
  });
});

describe('docker-compose.prod.yml', () => {
  const dc = read('docker-compose.prod.yml');

  it('mendefinisikan empat service', () => {
    for (const s of ['db:', 'migrate:', 'app:', 'caddy:']) expect(dc).toContain(s);
  });

  it('memakai volume bernama supaya data database bertahan', () => {
    expect(dc).toMatch(/pbk-pgdata/);
  });

  it('menjalankan migrasi sebelum app menyala', () => {
    expect(dc).toMatch(/prisma migrate deploy/);
    expect(dc).toMatch(/migrate:\s*\n\s+condition:\s*service_completed_successfully/);
  });

  it('menunggu database sehat', () => {
    expect(dc).toMatch(/pg_isready/);
    expect(dc).toMatch(/condition:\s*service_healthy/);
  });

  it('tidak pernah mengekspos port database ke internet', () => {
    const dbBlock = dc.slice(dc.indexOf('db:'), dc.indexOf('migrate:'));
    expect(dbBlock).not.toMatch(/^\s+ports:/m);
  });
});

describe('.dockerignore', () => {
  it('mengecualikan berkas berat dan rahasia', () => {
    const di = read('.dockerignore');
    for (const p of ['node_modules', '.next', '.env', '.postgres', '.pgdata', '.superpowers']) {
      expect(di).toContain(p);
    }
  });
});
