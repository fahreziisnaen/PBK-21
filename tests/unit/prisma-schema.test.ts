import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const schema = readFileSync('prisma/schema.prisma', 'utf8');

describe('skema Prisma', () => {
  it('mendeklarasikan seluruh enum domain', () => {
    for (const e of [
      'enum Role', 'enum ActivityStatus', 'enum CategoryStatus',
      'enum PaymentMethod', 'enum PaymentStatus', 'enum ExpenseStatus',
      'enum Grade', 'enum NotifKind',
    ]) {
      expect(schema).toContain(e);
    }
  });

  it('mendeklarasikan seluruh model', () => {
    for (const m of [
      'model User', 'model School', 'model ActivityCategory', 'model ExpenseCategory',
      'model Activity', 'model Student', 'model Participant', 'model Payment',
      'model Expense', 'model Notification', 'model AuditLog',
    ]) {
      expect(schema).toContain(m);
    }
  });

  it('menyimpan seluruh nominal sebagai Int', () => {
    for (const f of ['contribution  Int', 'billing    Int', 'amount        Int']) {
      expect(schema.replace(/[ \t]+/g, ' ')).toContain(f.replace(/[ \t]+/g, ' '));
    }
    expect(schema).not.toMatch(/(amount|billing|contribution)\s+(Float|Decimal)/);
  });

  it('menjamin nomor kuitansi unik per kegiatan', () => {
    expect(schema).toContain('@@unique([activityId, receiptNo])');
    expect(schema).toContain('@@unique([activityId, refNo])');
    expect(schema).toContain('@@unique([activityId, studentId])');
  });
});

describe('skema autentikasi', () => {
  it('menambahkan SUPERADMIN ke enum Role', () => {
    // No `/s` (dotAll) flag: the pattern uses `[^}]*`, a negated character
    // class, which already matches newlines regardless of dotAll — dotAll
    // only changes what `.` matches, and this pattern has no `.`. Adding
    // the flag would trip TS1501 under this project's ES2017 target for no
    // behavioral gain.
    expect(schema).toMatch(/enum Role \{[^}]*SUPERADMIN/);
  });

  it('mendeklarasikan enum challenge', () => {
    expect(schema).toContain('enum ChallengePurpose');
    expect(schema).toContain('enum SecondFactor');
  });

  it('mendeklarasikan model autentikasi baru', () => {
    for (const m of ['model AuthChallenge', 'model AuthEvent', 'model AppSetting']) {
      expect(schema).toContain(m);
    }
  });

  it('menjadikan username unik dan email opsional', () => {
    expect(schema).toMatch(/username\s+String\s+@unique/);
    expect(schema).toMatch(/email\s+String\?/);
    expect(schema).not.toMatch(/email\s+String\s+@unique/);
  });

  it('menyimpan kolom 2FA pada User', () => {
    for (const f of ['totpSecret', 'totpEnabledAt', 'mustChangePassword', 'isActive', 'lastLoginAt']) {
      expect(schema).toContain(f);
    }
  });
});
