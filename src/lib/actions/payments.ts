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
  for (const p of ['/pembayaran', '/siswa', '/buku-kas', '/rekap', '/dashboard', '/laporan/keuangan', '/laporan/pembayaran', '/kuitansi'])
    revalidatePath(p);
}

export async function recordPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireWriter();
  const target = await getWritableActivity();
  if ('error' in target) return fail(target.error);
  const { activity } = target;

  const participantId = String(fd.get('participantId') ?? '');
  const amount = parseAmount(fd.get('amount'));
  const method = String(fd.get('method') ?? '') as PaymentMethod;
  const date = parseDateInput(fd.get('date'));
  const note = String(fd.get('note') ?? '').trim() || null;

  if (!participantId) return fail('Pilih siswa.');
  if (!amount) return fail('Nominal pembayaran harus lebih dari nol.');
  if (!METHODS.includes(method)) return fail('Pilih metode pembayaran.');
  if (!date) return fail('Tanggal pembayaran wajib diisi.');

  const participant = await prisma.participant.findUnique({ where: { id: participantId }, include: { student: true } });
  if (!participant || participant.activityId !== activity.id) return fail('Siswa tidak terdaftar di kegiatan aktif.');

  const paid = await prisma.payment.aggregate({ where: { participantId, status: 'SAH' }, _sum: { amount: true } });
  const remaining = participant.billing - (paid._sum.amount ?? 0);
  if (remaining <= 0) return fail(`${participant.student.name} sudah lunas.`);
  if (amount > remaining) return fail(`Nominal melebihi sisa tagihan ${participant.student.name} (${rp(remaining)}).`);

  const payment = await prisma.$transaction(async (tx) => {
    const seq = await nextSeq(tx, activity.id, 'payment');
    return tx.payment.create({
      data: {
        activityId: activity.id,
        participantId,
        seq,
        receiptNo: `${activity.receiptPrefix}/${padSeq(seq, 4)}`,
        amount,
        method,
        date,
        note,
        createdById: user.id,
      },
    });
  });

  refresh();
  return ok(`Pembayaran ${payment.receiptNo} tercatat — ${rp(amount)} dari ${participant.student.name}.`);
}

export async function cancelPayment(paymentId: string): Promise<ActionResult> {
  const user = await requireWriter();
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { activity: true } });
  if (!payment) return fail('Pembayaran tidak ditemukan.');
  if (payment.status === 'DIBATALKAN') return fail('Pembayaran ini sudah dibatalkan.');
  if (payment.activity.status === 'ARSIP') return fail('Kegiatan ini sudah diarsipkan dan hanya bisa dibaca.');

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'DIBATALKAN', cancelledById: user.id, cancelledAt: new Date(), cancelReason: 'Dibatalkan oleh pengguna' },
  });
  await writeAudit({ userId: user.id, action: 'payment.cancel', entity: 'Payment', entityId: paymentId, meta: { receiptNo: payment.receiptNo, amount: payment.amount } });
  refresh();
  revalidatePath(`/pembayaran/${paymentId}`);
  return ok(`Pembayaran ${payment.receiptNo} dibatalkan.`);
}
