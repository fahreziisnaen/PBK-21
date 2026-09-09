import { describe, expect, it } from 'vitest';
import { ACTIVITY_CATEGORIES, EXPENSE_CATEGORIES, SEED_ADMIN } from '../../prisma/seed-data';

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

describe('akun seed', () => {
  it('adalah administrator tunggal', () => {
    expect(SEED_ADMIN.username).toBe('admin');
    expect(SEED_ADMIN.name).toBe('Administrator');
    expect(SEED_ADMIN.role).toBe('SUPERADMIN');
  });

  it('tidak membawa identitas pribadi apa pun', () => {
    const serialized = JSON.stringify(SEED_ADMIN);
    expect(serialized).not.toMatch(/anggi|sman21sby|19870412|0812/i);
  });

  it('tidak punya telepon maupun TOTP, sehingga masuk lewat pengecualian bootstrap', () => {
    expect(SEED_ADMIN.phone ?? null).toBeNull();
  });
});
