import { describe, expect, it } from 'vitest';
import { UNREMEMBERED_SESSION_MS, isSessionExpired } from '@/lib/auth-gates';

const NOW = Date.UTC(2026, 8, 16, 12, 0, 0);

describe('isSessionExpired — "Ingat saya"', () => {
  it('sesi yang diingat tidak pernah kedaluwarsa lewat aturan ini', () => {
    // Setahun pun tetap lolos: batasnya diserahkan pada masa berlaku cookie.
    expect(isSessionExpired(true, NOW - 365 * 24 * 3600_000, NOW)).toBe(false);
  });

  it('sesi yang tidak diingat masih berlaku di dalam jendelanya', () => {
    expect(isSessionExpired(false, NOW - 1000, NOW)).toBe(false);
    expect(isSessionExpired(false, NOW - (UNREMEMBERED_SESSION_MS - 1000), NOW)).toBe(false);
  });

  it('sesi yang tidak diingat kedaluwarsa setelah jendelanya lewat', () => {
    expect(isSessionExpired(false, NOW - (UNREMEMBERED_SESSION_MS + 1000), NOW)).toBe(true);
  });

  it('tepat di batas belum kedaluwarsa — pembandingnya ketat', () => {
    expect(isSessionExpired(false, NOW - UNREMEMBERED_SESSION_MS, NOW)).toBe(false);
  });

  it('token dari sebelum fitur ini ada dibiarkan lewat, bukan dipaksa keluar', () => {
    // Keduanya tidak ada: token lama. Memaksa semua orang masuk ulang saat
    // aplikasi diperbarui bukan perilaku yang diinginkan.
    expect(isSessionExpired(undefined, undefined, NOW)).toBe(false);
  });

  it('jendelanya delapan jam', () => {
    expect(UNREMEMBERED_SESSION_MS).toBe(8 * 60 * 60 * 1000);
  });
});
