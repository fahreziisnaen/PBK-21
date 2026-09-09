import { describe, expect, it } from 'vitest';
import { statusTone } from '@/lib/status';

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
