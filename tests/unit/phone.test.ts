import { describe, expect, it } from 'vitest';
import { formatPhoneLocal, normalizePhone } from '@/lib/phone';

describe('normalizePhone', () => {
  it('menerima bentuk lokal baku', () => {
    expect(normalizePhone('081233445566')).toBe('6281233445566');
  });

  it('membuang pemisah', () => {
    expect(normalizePhone('0812-3344-5566')).toBe('6281233445566');
    expect(normalizePhone('0812 3344 5566')).toBe('6281233445566');
    expect(normalizePhone('(0812) 3344-5566')).toBe('6281233445566');
  });

  it('membuang tanda plus', () => {
    expect(normalizePhone('+6281233445566')).toBe('6281233445566');
  });

  it('membiarkan bentuk internasional', () => {
    expect(normalizePhone('6281233445566')).toBe('6281233445566');
  });

  it('menambahkan 62 saat nol di depan hilang', () => {
    expect(normalizePhone('81233445566')).toBe('6281233445566');
  });

  it('menolak nomor tetap', () => {
    expect(normalizePhone('02112345678')).toBeNull();
  });

  it('menolak yang terlalu pendek atau terlalu panjang', () => {
    expect(normalizePhone('08123')).toBeNull();
    expect(normalizePhone('0812334455661234')).toBeNull();
  });

  it('menolak yang mengandung huruf', () => {
    expect(normalizePhone('0812abc45566')).toBeNull();
  });

  it('memperlakukan kosong sebagai tidak ada', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe('formatPhoneLocal', () => {
  it('menampilkan kembali dalam bentuk lokal', () => {
    expect(formatPhoneLocal('6281233445566')).toBe('0812-3344-5566');
  });

  it('mengembalikan string kosong untuk null', () => {
    expect(formatPhoneLocal(null)).toBe('');
  });
});
