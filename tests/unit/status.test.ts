import { describe, expect, it } from 'vitest';
import { statusLabel, statusTone } from '@/lib/status';

describe('statusTone', () => {
  it('memetakan status positif ke hijau', () => {
    for (const s of ['Lunas', 'Aktif', 'Sah']) expect(statusTone(s)).toBe('success');
  });
  it('memetakan status perhatian ke kuning', () => {
    for (const s of ['Belum Lunas', 'Draft']) expect(statusTone(s)).toBe('warn');
  });
  it('memetakan status negatif ke merah', () => {
    for (const s of ['Belum Bayar', 'Dibatalkan', 'Nonaktif']) expect(statusTone(s)).toBe('error');
  });
  it('memetakan status netral ke abu', () => {
    for (const s of ['Arsip', 'Selesai']) expect(statusTone(s)).toBe('neutral');
  });
  it('memakai netral untuk status tak dikenal', () => {
    expect(statusTone('Entah')).toBe('neutral');
  });
});

// Union dari nilai ActivityStatus, CategoryStatus, PaymentStatus, dan
// ExpenseStatus di prisma/schema.prisma — persis tujuh nilai berbeda.
const ENUM_TO_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  AKTIF: 'Aktif',
  SELESAI: 'Selesai',
  ARSIP: 'Arsip',
  NONAKTIF: 'Nonaktif',
  SAH: 'Sah',
  DIBATALKAN: 'Dibatalkan',
};

describe('statusLabel', () => {
  it('menerjemahkan setiap nilai enum Prisma ke label tampilan Indonesia', () => {
    for (const [enumValue, label] of Object.entries(ENUM_TO_LABEL)) {
      expect(statusLabel(enumValue)).toBe(label);
    }
  });

  it('mengembalikan label tampilan apa adanya (identity) bila sudah berupa label', () => {
    for (const label of Object.values(ENUM_TO_LABEL)) {
      expect(statusLabel(label)).toBe(label);
    }
  });

  it('mengembalikan status tak dikenal apa adanya', () => {
    expect(statusLabel('Entah')).toBe('Entah');
  });
});

describe('statusTone dan Badge menerima kedua bentuk status', () => {
  it('menghasilkan tone yang identik untuk nilai enum Prisma dan label tampilannya', () => {
    for (const [enumValue, label] of Object.entries(ENUM_TO_LABEL)) {
      expect(statusTone(enumValue)).toBe(statusTone(label));
    }
  });

  it('tidak pernah jatuh ke netral untuk nilai enum Prisma yang dikenal (regresi bug asli)', () => {
    // Sebelum perbaikan, statusTone('AKTIF') jatuh ke 'neutral' karena TONES
    // hanya dikunci pada label tampilan ('Aktif'), bukan nilai enum mentah
    // ('AKTIF') yang sebenarnya disimpan di database dan dikirim ke <Badge>.
    expect(statusTone('AKTIF')).toBe('success');
    expect(statusTone('SAH')).toBe('success');
    expect(statusTone('DRAFT')).toBe('warn');
    expect(statusTone('DIBATALKAN')).toBe('error');
    expect(statusTone('NONAKTIF')).toBe('error');
    expect(statusTone('ARSIP')).toBe('neutral');
    expect(statusTone('SELESAI')).toBe('neutral');
  });
});
