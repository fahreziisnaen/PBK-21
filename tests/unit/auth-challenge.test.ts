import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateChallenge, formatOtp, generateOtpCode, hashOtp, verifyOtpHash } from '@/lib/auth-challenge';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-auth-secret-32-chars-min-12345';
});

const now = new Date('2026-09-10T10:00:00Z');
const future = new Date('2026-09-10T10:04:00Z');
const past = new Date('2026-09-10T09:59:00Z');

describe('evaluateChallenge', () => {
  it('dapat dipakai saat belum kedaluwarsa, belum terpakai, percobaan masih sisa', () => {
    expect(evaluateChallenge({ expiresAt: future, consumedAt: null, attempts: 0 }, now)).toBe('usable');
  });

  it('kedaluwarsa saat lewat waktu', () => {
    expect(evaluateChallenge({ expiresAt: past, consumedAt: null, attempts: 0 }, now)).toBe('expired');
  });

  it('terpakai saat sudah dikonsumsi', () => {
    expect(evaluateChallenge({ expiresAt: future, consumedAt: past, attempts: 0 }, now)).toBe('consumed');
  });

  it('habis saat percobaan mencapai batas', () => {
    expect(evaluateChallenge({ expiresAt: future, consumedAt: null, attempts: 5 }, now)).toBe('exhausted');
  });

  it('memeriksa terpakai sebelum kedaluwarsa', () => {
    expect(evaluateChallenge({ expiresAt: past, consumedAt: past, attempts: 0 }, now)).toBe('consumed');
  });

  it('memeriksa habis sebelum kedaluwarsa', () => {
    expect(evaluateChallenge({ expiresAt: past, consumedAt: null, attempts: 5 }, now)).toBe('exhausted');
  });

  it('memeriksa terpakai sebelum habis', () => {
    expect(evaluateChallenge({ expiresAt: future, consumedAt: past, attempts: 5 }, now)).toBe('consumed');
  });
});

describe('kode OTP', () => {
  it('enam digit', () => {
    for (let i = 0; i < 50; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it('tidak selalu sama', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateOtpCode()));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('cocok hanya untuk kode yang benar', () => {
    const h = hashOtp('123456');
    expect(verifyOtpHash('123456', h)).toBe(true);
    expect(verifyOtpHash('123457', h)).toBe(false);
  });

  it('tidak menyimpan kode dalam bentuk polos', () => {
    expect(hashOtp('123456')).not.toContain('123456');
  });
});

describe('formatOtp', () => {
  it('angka nol menjadi enam nol', () => {
    expect(formatOtp(0)).toBe('000000');
  });

  it('angka dua digit diisi depan', () => {
    expect(formatOtp(42)).toBe('000042');
  });

  it('angka maksimal enam digit', () => {
    expect(formatOtp(999999)).toBe('999999');
  });
});

describe('verifyOtpHash', () => {
  it('hash kosong menghasilkan false', () => {
    expect(verifyOtpHash('123456', '')).toBe(false);
  });

  it('hash hex tidak valid menghasilkan false', () => {
    expect(verifyOtpHash('123456', 'zz')).toBe(false);
  });

  it('hash hex pendek menghasilkan false', () => {
    expect(verifyOtpHash('123456', 'abc')).toBe(false);
  });
});
