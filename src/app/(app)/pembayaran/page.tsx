import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { PaymentFormModal } from '@/components/finance/PaymentFormModal';
import { CancelPaymentButton } from '@/components/finance/CancelPaymentButton';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { getActiveActivity } from '@/lib/activity-context';
import { isoDate, parseDateInput, participantRows, todayIso } from '@/lib/finance';
import { prisma } from '@/lib/prisma';
import { fdate, rp } from '@/lib/format';
import { btnGhost, btnSecondary, input, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

type Search = { q?: string; method?: string; status?: string; from?: string; to?: string };

export default async function PembayaranPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const writer = canWrite(user.role);
  const activity = await getActiveActivity();
  if (!activity) {
    return (
      <>
        <PageHead pathname="/pembayaran" />
        <NoActivity />
      </>
    );
  }
  const archived = activity.status === 'ARSIP';
  const sp = await searchParams;
  const from = parseDateInput(sp.from ?? null);
  const to = parseDateInput(sp.to ?? null);
  const q = (sp.q ?? '').trim();

  const where: Prisma.PaymentWhereInput = {
    activityId: activity.id,
    ...(sp.method === 'TUNAI' || sp.method === 'TRANSFER' ? { method: sp.method } : {}),
    ...(sp.status === 'SAH' || sp.status === 'DIBATALKAN' ? { status: sp.status } : {}),
    ...(from || to ? { date: { gte: from ?? undefined, lte: to ?? undefined } } : {}),
    ...(q
      ? {
          OR: [
            { receiptNo: { contains: q, mode: 'insensitive' } },
            { participant: { student: { name: { contains: q, mode: 'insensitive' } } } },
            { participant: { student: { nis: { contains: q } } } },
          ],
        }
      : {}),
  };

  const [payments, participants] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { participant: { include: { student: true } } },
      orderBy: [{ date: 'desc' }, { seq: 'desc' }],
    }),
    writer && !archived ? participantRows(activity.id) : Promise.resolve([]),
  ]);
  const valid = payments.filter((p) => p.status === 'SAH');
  const sum = (list: typeof payments) => list.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHead
        pathname="/pembayaran"
        actions={writer && !archived && <PaymentFormModal participants={participants} today={todayIso()} />}
      />

      <KpiRow>
        <Kpi label="Total Pemasukan" value={rp(sum(valid))} tone="success" hint={`${valid.length} transaksi sah`} />
        <Kpi label="Tunai" value={rp(sum(valid.filter((p) => p.method === 'TUNAI')))} />
        <Kpi label="Transfer" value={rp(sum(valid.filter((p) => p.method === 'TRANSFER')))} />
        <Kpi label="Dibatalkan" value={String(payments.length - valid.length)} hint="tidak dihitung" />
      </KpiRow>

      <form className="mb-3 flex flex-wrap gap-2" data-noprint>
        <input name="q" defaultValue={q} placeholder="Cari siswa, NIS, atau no. kuitansi…" className={`${input} max-w-[280px]`} />
        <select name="method" defaultValue={sp.method ?? ''} className={`${input} max-w-[150px]`}>
          <option value="">Semua metode</option>
          <option value="TUNAI">Tunai</option>
          <option value="TRANSFER">Transfer</option>
        </select>
        <select name="status" defaultValue={sp.status ?? ''} className={`${input} max-w-[150px]`}>
          <option value="">Semua status</option>
          <option value="SAH">Sah</option>
          <option value="DIBATALKAN">Dibatalkan</option>
        </select>
        <input type="date" name="from" defaultValue={sp.from ?? ''} className={`${input} max-w-[160px]`} aria-label="Dari tanggal" />
        <input type="date" name="to" defaultValue={sp.to ?? ''} className={`${input} max-w-[160px]`} aria-label="Sampai tanggal" />
        <button className={btnSecondary}>Terapkan</button>
      </form>

      <div className={tableWrap}>
        <table className={`${table} min-w-[900px]`}>
          <thead>
            <tr>
              <th className={th}>No. Kuitansi</th>
              <th className={th}>Tanggal</th>
              <th className={th}>Siswa</th>
              <th className={th}>Metode</th>
              <th className={thNum}>Jumlah</th>
              <th className={th}>Status</th>
              <th className={th}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td className={`${td} py-10 text-center text-gray-500`} colSpan={7}>
                  Belum ada pembayaran yang cocok.
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id} className={p.status === 'DIBATALKAN' ? 'opacity-60' : ''}>
                <td className={`${td} ${mono} font-semibold`}>
                  <Link href={`/pembayaran/${p.id}`} className="text-brand-600 hover:underline">{p.receiptNo}</Link>
                </td>
                <td className={`${td} whitespace-nowrap`}>{fdate(isoDate(p.date))}</td>
                <td className={td}>
                  <div className="font-semibold text-gray-900">{p.participant.student.name}</div>
                  <div className={`text-[12px] text-gray-500 ${mono}`}>{p.participant.student.nis}</div>
                </td>
                <td className={td}>{p.method === 'TUNAI' ? 'Tunai' : 'Transfer'}</td>
                <td className={`${tdNum} ${p.status === 'DIBATALKAN' ? 'line-through' : ''}`}>{rp(p.amount)}</td>
                <td className={td}><Badge status={p.status} /></td>
                <td className={`${td} whitespace-nowrap`}>
                  <Link href={`/kuitansi?id=${p.id}`} className={btnGhost}>Kuitansi</Link>
                  {writer && !archived && p.status === 'SAH' && <CancelPaymentButton id={p.id} receiptNo={p.receiptNo} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
