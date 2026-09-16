import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type PayStatus = 'Lunas' | 'Belum Lunas' | 'Belum Bayar';

/** Spec §4.2. */
export function payStatus(billing: number, paid: number): PayStatus {
  if (paid <= 0) return 'Belum Bayar';
  if (billing - paid <= 0) return 'Lunas';
  return 'Belum Lunas';
}

/** Spec §4.1 — agregat keuangan satu kegiatan. */
export async function activityFinance(activityId: string) {
  const [activity, income, expense, billing, participants] = await Promise.all([
    prisma.activity.findUnique({ where: { id: activityId } }),
    prisma.payment.aggregate({ where: { activityId, status: 'SAH' }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { activityId, status: 'AKTIF' }, _sum: { amount: true } }),
    prisma.participant.aggregate({ where: { activityId }, _sum: { billing: true } }),
    prisma.participant.count({ where: { activityId } }),
  ]);
  const inc = income._sum.amount ?? 0;
  const exp = expense._sum.amount ?? 0;
  const bill = billing._sum.billing ?? 0;
  return {
    income: inc,
    expense: exp,
    balance: inc - exp,
    billing: bill,
    outstanding: bill - inc,
    target: (activity?.contribution ?? 0) * (activity?.participantTarget ?? 0),
    participants,
  };
}

export type ParticipantRow = {
  id: string;
  studentId: string;
  nis: string;
  name: string;
  grade: string;
  className: string | null;
  phone: string | null;
  billing: number;
  paid: number;
  remaining: number;
  status: PayStatus;
};

/** Peserta satu kegiatan beserta total bayar sah dan status pelunasannya. */
export async function participantRows(activityId: string): Promise<ParticipantRow[]> {
  const [participants, sums] = await Promise.all([
    prisma.participant.findMany({
      where: { activityId },
      include: { student: true },
      orderBy: [{ student: { grade: 'asc' } }, { student: { name: 'asc' } }],
    }),
    prisma.payment.groupBy({
      by: ['participantId'],
      where: { activityId, status: 'SAH' },
      _sum: { amount: true },
    }),
  ]);
  const paidBy = new Map(sums.map((s) => [s.participantId, s._sum.amount ?? 0]));
  return participants.map((p) => {
    const paid = paidBy.get(p.id) ?? 0;
    return {
      id: p.id,
      studentId: p.studentId,
      nis: p.student.nis,
      name: p.student.name,
      grade: p.student.grade,
      className: p.student.className,
      phone: p.student.phone,
      billing: p.billing,
      paid,
      remaining: p.billing - paid,
      status: payStatus(p.billing, paid),
    };
  });
}

export type LedgerRow = {
  key: string;
  date: Date;
  ref: string;
  description: string;
  category: string;
  method: 'TUNAI' | 'TRANSFER';
  income: number;
  expense: number;
  balance: number;
  href: string | null;
};

/** Spec §4.3 — pembayaran sah dan pengeluaran aktif, kronologis, saldo berjalan. */
export async function ledgerRows(
  activityId: string,
  range?: { from?: Date; to?: Date },
): Promise<LedgerRow[]> {
  const date = range && (range.from || range.to) ? { gte: range.from, lte: range.to } : undefined;
  const [payments, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: { activityId, status: 'SAH', date },
      include: { participant: { include: { student: true } } },
    }),
    prisma.expense.findMany({
      where: { activityId, status: 'AKTIF', date },
      include: { category: true },
    }),
  ]);
  const rows = [
    ...payments.map((p) => ({
      sort: p.seq,
      key: `p-${p.id}`,
      date: p.date,
      ref: p.receiptNo,
      description: `Pembayaran ${p.participant.student.name}${p.participant.student.className ? ' (' + p.participant.student.className + ')' : ''}`,
      category: 'Kontribusi siswa',
      method: p.method,
      income: p.amount,
      expense: 0,
      href: `/pembayaran/${p.id}`,
    })),
    ...expenses.map((e) => ({
      sort: 1000 + e.seq,
      key: `e-${e.id}`,
      date: e.date,
      ref: e.refNo,
      description: e.description,
      category: e.category.name,
      method: e.method,
      income: 0,
      expense: e.amount,
      href: null,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.sort - b.sort);

  let balance = 0;
  return rows.map((r) => {
    balance += r.income - r.expense;
    return { key: r.key, date: r.date, ref: r.ref, description: r.description, category: r.category, method: r.method, income: r.income, expense: r.expense, href: r.href, balance };
  });
}

/**
 * Nomor urut berikutnya per kegiatan (spec §4.5): monoton, tidak pernah
 * dipakai ulang — termasuk oleh transaksi yang dibatalkan, karena baris yang
 * dibatalkan tetap ada. Dikunci per kegiatan agar dua kasir yang menyimpan
 * bersamaan tidak mendapat nomor yang sama.
 */
export async function nextSeq(
  tx: Prisma.TransactionClient,
  activityId: string,
  kind: 'payment' | 'expense',
): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seq:${kind}:${activityId}`}))`;
  const last =
    kind === 'payment'
      ? await tx.payment.aggregate({ where: { activityId }, _max: { seq: true } })
      : await tx.expense.aggregate({ where: { activityId }, _max: { seq: true } });
  return (last._max.seq ?? 0) + 1;
}

/** Tanggal `YYYY-MM-DD` dari input form, sebagai Date UTC tengah malam (kolom @db.Date). */
export function parseDateInput(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Nominal rupiah dari input form: menerima "250.000", "250000", "Rp 250.000". */
export function parseAmount(value: FormDataEntryValue | null): number | null {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}
