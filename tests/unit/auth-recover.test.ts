import { describe, expect, it, vi } from 'vitest';
import { generateTemporaryPassword } from '../../scripts/auth-recover';

// Pure part of the SSH recovery script (Task 14): the temporary password
// generator. Everything else in scripts/auth-recover.ts touches Prisma and
// is proven by an actual run against a disposable e2e- user instead (see
// task-14-report.md) — mirroring how prisma/seed.ts (Task 4) is unit-tested
// only for its pure upsert-shape guarantee.
describe('generateTemporaryPassword', () => {
  it('menghasilkan sandi minimal 16 karakter', () => {
    const pw = generateTemporaryPassword();
    expect(pw.length).toBeGreaterThanOrEqual(16);
  });

  it('mencampur kelas karakter: huruf besar, huruf kecil, angka, simbol', () => {
    const pw = generateTemporaryPassword();
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[0-9]/);
    expect(pw).toMatch(/[^A-Za-z0-9]/);
  });

  it('berbeda di setiap panggilan', () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    expect(a).not.toBe(b);
  });

  it('tidak pernah memakai Math.random untuk sandi', () => {
    const spy = vi.spyOn(Math, 'random');
    generateTemporaryPassword();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('menolak panjang di bawah 16', () => {
    expect(() => generateTemporaryPassword(15)).toThrow(/minimal 16/);
  });
});
