import { describe, expect, it } from 'vitest';
import { ACTIVITY_CATEGORIES, EXPENSE_CATEGORIES } from '../../prisma/seed-data';

describe('master data seed', () => {
  it('memuat 4 kategori kegiatan dari prototipe', () => {
    expect(ACTIVITY_CATEGORIES).toHaveLength(4);
    expect(ACTIVITY_CATEGORIES.map((c) => c.code)).toEqual(['OUT', 'KGT', 'ST', 'LMB']);
  });

  it('menandai Lomba & Kompetisi sebagai nonaktif', () => {
    const lmb = ACTIVITY_CATEGORIES.find((c) => c.code === 'LMB');
    expect(lmb?.status).toBe('NONAKTIF');
  });

  it('memuat 9 kategori pengeluaran dari prototipe', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(9);
    expect(EXPENSE_CATEGORIES.map((c) => c.code)).toEqual(
      ['TRP', 'KNS', 'TKT', 'PNG', 'DOK', 'ATK', 'HNR', 'LNL', 'SVN'],
    );
  });

  it('menandai Souvenir sebagai nonaktif', () => {
    expect(EXPENSE_CATEGORIES.find((c) => c.code === 'SVN')?.status).toBe('NONAKTIF');
  });
});
