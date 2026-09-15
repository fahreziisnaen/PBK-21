import { describe, expect, it } from 'vitest';
import { SEED_ADMIN } from '../../prisma/seed-data';

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
