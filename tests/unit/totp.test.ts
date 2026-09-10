import { describe, expect, it } from 'vitest';
import { buildOtpauthUri, generateTotpSecret, isValidTotpSecret, verifyTotp } from '@/lib/totp';

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

describe('toleransi format input', () => {
  // Authenticator apps display codes as "123 456", and people paste them
  // verbatim (with a space or a stray dash). A correct code must not be
  // rejected just because of formatting — that reads as a wrong code to
  // the person typing it, and burns the attempt cap from Task 8.
  it('menerima kode dengan spasi di tengah', () => {
    expect(verifyTotp(RFC_SECRET, '287 082', new Date(59_000))).toBe(true);
  });

  it('menerima kode dengan spasi di awal dan akhir', () => {
    expect(verifyTotp(RFC_SECRET, ' 287082 ', new Date(59_000))).toBe(true);
  });

  it('menerima kode dengan tanda hubung', () => {
    expect(verifyTotp(RFC_SECRET, '287-082', new Date(59_000))).toBe(true);
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
    // The label identifies which account the QR code enrols; if it were
    // dropped, the library falls back to a default label and the three
    // assertions above would still pass while the QR code names nobody.
    expect(uri).toContain('PBK:admin');
  });
});

describe('isValidTotpSecret', () => {
  it('menerima secret yang dihasilkan generateTotpSecret', () => {
    for (let i = 0; i < 20; i++) expect(isValidTotpSecret(generateTotpSecret())).toBe(true);
  });

  it('menolak secret kosong atau nyaris kosong', () => {
    // A one-character secret passed the old `z.string().min(1)` check and
    // would enrol as the user's real second factor.
    expect(isValidTotpSecret('')).toBe(false);
    expect(isValidTotpSecret('A')).toBe(false);
  });

  it('menolak karakter di luar alfabet base32 RFC 4648', () => {
    expect(isValidTotpSecret('A'.repeat(31) + '0')).toBe(false); // 0 and 1 are
    expect(isValidTotpSecret('A'.repeat(31) + '1')).toBe(false); // not in base32
    expect(isValidTotpSecret('a'.repeat(32))).toBe(false); // lowercase
    expect(isValidTotpSecret('A'.repeat(31) + '=')).toBe(false); // padding
  });

  it('menolak panjang yang salah', () => {
    expect(isValidTotpSecret('A'.repeat(31))).toBe(false);
    expect(isValidTotpSecret('A'.repeat(33))).toBe(false);
  });
});
