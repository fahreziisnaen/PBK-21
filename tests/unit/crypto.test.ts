import { beforeAll, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '@/lib/crypto';

beforeAll(() => {
  // 32 bytes, base64 — the same shape DEPLOYMENT.md tells the operator to generate.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('encryptSecret / decryptSecret', () => {
  it('mengembalikan nilai semula', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('menghasilkan ciphertext berbeda tiap kali untuk masukan sama', () => {
    const a = encryptSecret('sama');
    const b = encryptSecret('sama');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('sama');
    expect(decryptSecret(b)).toBe('sama');
  });

  it('menolak payload yang dirusak', () => {
    const payload = encryptSecret('rahasia');
    const parts = payload.split('.');
    const tampered = [parts[0], parts[1], parts[2].slice(0, -2) + 'AA'].join('.');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('menolak payload berbentuk salah', () => {
    expect(() => decryptSecret('bukan-payload')).toThrow();
  });
});
