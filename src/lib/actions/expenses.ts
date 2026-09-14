'use server';

import { revalidatePath } from 'next/cache';
import type { PaymentMethod } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireWriter } from '@/lib/roles';
import { getWritableActivity } from '@/lib/writable-activity';
import { nextSeq, parseAmount, parseDateInput } from '@/lib/finance';
import { writeAudit } from '@/lib/audit';
import { padSeq, rp } from '@/lib/format';
import { fail, ok, type ActionResult } from '@/lib/action-result';

const METHODS: PaymentMethod[] = ['TUNAI', 'TRANSFER'];

function refresh() {
  for (const p of ['/pengeluaran', '/buku-kas', '/dashboard', '/laporan/keuangan', '/master/kegiatan'])
    revalidatePath(p);
}

export async function saveExpense(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireWriter();
  const target = await getWritableActivity();
  if ('error' in target) return fail(target.error);
  const { activity } = target;

  const id = String(fd.get('id') ?? '');
  const categoryId = String(fd.get('categoryId') ?? '');
  const description = String(fd.get('description') ?? '').trim();
  const amount = parseAmount(fd.get('amount'));
  const method = String(fd.get('method') ?? '') as PaymentMethod;
  const date = parseDateInput(fd.get('date'));
  const note = String(fd.get('note') ?? '').trim() || null;

  if (!categoryId) return fail('Pilih kategori pengeluaran.');
  if (!description) return fail('Uraian wajib diisi.');
  if (!amount) return fail('Nominal harus lebih dari nol.');
  if (!METHODS.includes(method)) return fail('Pilih metode.');
  if (!date) return fail('Tanggal wajib diisi.');

  if (id) {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing || existing.activityId !== activity.id) return fail('Pengeluaran tidak ditemukan di kegiatan aktif.');
    if (existing.status === 'DIBATALKAN') return fail('Pengeluaran yang dibatalkan tidak bisa diubah.');
    await prisma.expense.update({ where: { id }, data: { categoryId, description, amount, method, date, note } });
    await writeAudit({ userId: user.id, action: 'expense.update', entity: 'Expense', entityId: id, meta: { before: existing.amount, after: amount } });
    refresh();
    return ok(`Pengeluaran ${existing.refNo} diperbarui.`);
  }

  const expense = await prisma.$transaction(async (tx) => {
    const seq = await nextSeq(tx, activity.id, 'expense');
    return tx.expense.create({
      data: {
        activityId: activity.id,
        categoryId,
        seq,
        refNo: `BKK/${activity.receiptPrefix}/${padSeq(seq, 3)}`,
        date,
        description,
        amount,
        method,
        note,
        createdById: user.id,
      },
    });
  });
  refresh();
  return ok(`Pengeluaran ${expense.refNo} tercatat — ${rp(amount)}.`);
}

export async function cancelExpense(id: string): Promise<ActionResult> {
  const user = await requireWriter();
  const expense = await prisma.expense.findUnique({ where: { id }, include: { activity: true } });
  if (!expense) return fail('Pengeluaran tidak ditemukan.');
  if (expense.status === 'DIBATALKAN') return fail('Pengeluaran ini sudah dibatalkan.');
  if (expense.activity.status === 'ARSIP') return fail('Kegiatan ini sudah diarsipkan dan hanya bisa dibaca.');
  await prisma.expense.update({ where: { id }, data: { status: 'DIBATALKAN' } });
  await writeAudit({ userId: user.id, action: 'expense.cancel', entity: 'Expense', entityId: id, meta: { refNo: expense.refNo, amount: expense.amount } });
  refresh();
  return ok(`Pengeluaran ${expense.refNo} dibatalkan.`);
}
