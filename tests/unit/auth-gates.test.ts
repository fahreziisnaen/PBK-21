import { describe, expect, it } from 'vitest';
import { nextGate } from '@/lib/auth-gates';

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
