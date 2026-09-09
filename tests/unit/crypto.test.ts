import { beforeAll, afterEach, describe, expect, it } from 'vitest';
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
    const tampered = [parts[0], parts[1], parts[2], parts[3].slice(0, -2) + 'AA'].join('.');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('menolak payload berbentuk salah', () => {
    expect(() => decryptSecret('bukan-payload')).toThrow();
  });

  describe('guard clauses', () => {
    const validKey = process.env.ENCRYPTION_KEY;

    afterEach(() => {
      process.env.ENCRYPTION_KEY = validKey;
    });

    it('menolak ENCRYPTION_KEY yang hilang', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => encryptSecret('test')).toThrow(/belum diisi/);
    });

    it('menolak ENCRYPTION_KEY dengan panjang salah', () => {
      process.env.ENCRYPTION_KEY = Buffer.alloc(16).toString('base64');
      expect(() => encryptSecret('test')).toThrow(/harus 32 byte/);
    });

    it('menolak ENCRYPTION_KEY non-canonical base64 (43-char passphrase)', () => {
      // 43-character string from base64 alphabet decodes to 32 bytes but is not canonical
      process.env.ENCRYPTION_KEY = 'a'.repeat(43);
      expect(() => encryptSecret('test')).toThrow(/bukan base64 yang sah/);
    });
  });

  describe('payload format', () => {
    it('menghasilkan payload dengan format v1', () => {
      const payload = encryptSecret('test');
      const parts = payload.split('.');
      expect(parts[0]).toBe('v1');
      expect(parts.length).toBe(4);
    });

    it('menolak payload tanpa version tag', () => {
      // Simulate old 3-part format
      const oldPayload = 'AAECAwQFBgcICQoL.AQIDBAUGBwgJ.invalidciphertext';
      expect(() => decryptSecret(oldPayload)).toThrow(/tidak berbentuk benar/);
    });

    it('menolak payload dengan version tag salah', () => {
      const payload = encryptSecret('test');
      const parts = payload.split('.');
      const wrongVersion = ['v2', parts[1], parts[2], parts[3]].join('.');
      expect(() => decryptSecret(wrongVersion)).toThrow(/tidak berbentuk benar/);
    });
  });
});
