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
