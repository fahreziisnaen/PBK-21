import { describe, expect, it } from 'vitest';
import { canSelfReset, isSessionStale, nextGate } from '@/lib/auth-gates';

const base = { mustChangePassword: false, totpEnabledAt: null, phone: '6281233445566', role: 'BENDAHARA' as const };

describe('nextGate', () => {
  it('meminta ganti sandi lebih dulu', () => {
    expect(nextGate({ ...base, mustChangePassword: true })).toBe('/ganti-sandi');
  });

  it('memaksa TOTP untuk SUPERADMIN', () => {
    expect(nextGate({ ...base, role: 'SUPERADMIN' })).toBe('/keamanan/2fa');
  });

  it('memaksa TOTP untuk akun tanpa telepon dan tanpa TOTP', () => {
    expect(nextGate({ ...base, phone: null })).toBe('/keamanan/2fa');
  });

  it('membiarkan lewat pengguna biasa yang punya telepon', () => {
    expect(nextGate(base)).toBeNull();
  });

  it('membiarkan lewat SUPERADMIN yang sudah mendaftar TOTP', () => {
    expect(nextGate({ ...base, role: 'SUPERADMIN', totpEnabledAt: new Date() })).toBeNull();
  });

  it('mendahulukan ganti sandi di atas pendaftaran TOTP', () => {
    expect(nextGate({ ...base, mustChangePassword: true, role: 'SUPERADMIN' })).toBe('/ganti-sandi');
  });
});

describe('canSelfReset', () => {
  it('mengizinkan akun yang sudah mendaftarkan TOTP', () => {
    expect(canSelfReset({ totpEnabledAt: new Date(), phone: null })).toBe(true);
  });

  it('mengizinkan akun bernomor telepon', () => {
    expect(canSelfReset({ totpEnabledAt: null, phone: '6281233445566' })).toBe(true);
  });

  it('menolak akun tanpa TOTP dan tanpa telepon', () => {
    // The whole point. In the LOGIN flow such an account is admitted with no
    // code, because it has no second factor and must still get in once. Reusing
    // that rule here would let anyone reset any bootstrap account — including
    // the seeded SUPERADMIN — by typing its username. Recovery for these
    // accounts is the SSH script, not this page.
    expect(canSelfReset({ totpEnabledAt: null, phone: null })).toBe(false);
  });
});

describe('isSessionStale', () => {
  const changedAt = new Date('2026-09-10T10:00:00.500Z');

  it('menerima sesi yang stempelnya cocok dengan basis data', () => {
    expect(isSessionStale(changedAt, changedAt.getTime())).toBe(false);
  });

  it('menolak sesi yang stempelnya berbeda', () => {
    // The token was signed before the change, so it carries the old value.
    expect(isSessionStale(changedAt, new Date('2026-09-09T00:00:00Z').getTime())).toBe(true);
  });

  it('menerima akun yang sandinya belum pernah diubah', () => {
    expect(isSessionStale(null, 0)).toBe(false);
  });

  it('menolak sesi lama saat sandi baru saja diubah pertama kali', () => {
    // Token signed when the column was still null, so it carries 0.
    expect(isSessionStale(changedAt, 0)).toBe(true);
  });

  it('menolak sesi tanpa stempel', () => {
    // Fails closed: a token we cannot date cannot be shown to be current.
    expect(isSessionStale(changedAt, undefined)).toBe(true);
  });
});
