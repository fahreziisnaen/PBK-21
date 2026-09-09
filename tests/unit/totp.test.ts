import { describe, expect, it } from 'vitest';
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from '@/lib/totp';

// ASCII "12345678901234567890" in base32
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('verifyTotp terhadap vektor RFC 6238', () => {
  const vectors: [number, string][] = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ];

  for (const [epochSeconds, code] of vectors) {
    it(`menerima ${code} pada T=${epochSeconds}`, () => {
      expect(verifyTotp(RFC_SECRET, code, new Date(epochSeconds * 1000))).toBe(true);
    });
  }

  it('menolak kode yang salah', () => {
    expect(verifyTotp(RFC_SECRET, '000000', new Date(59_000))).toBe(false);
  });
});

describe('toleransi jam', () => {
  it('menerima kode dari satu langkah sebelumnya', () => {
    // 287082 valid at T=59; still accepted 30s later
    expect(verifyTotp(RFC_SECRET, '287082', new Date(89_000))).toBe(true);
  });

  it('menolak kode dari dua langkah sebelumnya', () => {
    expect(verifyTotp(RFC_SECRET, '287082', new Date(119_000))).toBe(false);
  });
});

describe('generateTotpSecret', () => {
  it('menghasilkan base32 yang berbeda tiap panggilan', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]+$/);
  });
});

describe('buildOtpauthUri', () => {
  it('menyusun URI yang dikenali Google Authenticator', () => {
    const uri = buildOtpauthUri('admin', RFC_SECRET);
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('issuer=PBK');
    expect(uri).toContain(`secret=${RFC_SECRET}`);
  });
});
