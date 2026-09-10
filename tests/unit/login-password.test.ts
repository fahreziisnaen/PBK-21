import { describe, expect, it } from 'vitest';
import { chooseSecondFactor } from '@/lib/actions/choose-second-factor';

describe('chooseSecondFactor', () => {
  it('memilih TOTP bila terdaftar', () => {
    expect(chooseSecondFactor({ totpEnabledAt: new Date(), phone: '6281233445566' })).toBe('TOTP');
  });

  it('memilih TOTP walau tidak ada telepon', () => {
    expect(chooseSecondFactor({ totpEnabledAt: new Date(), phone: null })).toBe('TOTP');
  });

  it('memilih WA bila ada telepon tapi belum ada TOTP', () => {
    expect(chooseSecondFactor({ totpEnabledAt: null, phone: '6281233445566' })).toBe('WA_OTP');
  });

  it('memilih BOOTSTRAP bila keduanya tidak ada', () => {
    expect(chooseSecondFactor({ totpEnabledAt: null, phone: null })).toBe('BOOTSTRAP');
  });
});
