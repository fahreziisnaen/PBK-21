import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { PaymentFormModal } from '@/components/finance/PaymentFormModal';
import { PAGE_SIZE, Pagination, pageFrom } from '@/components/ui/Pagination';
import { CancelPaymentButton } from '@/components/finance/CancelPaymentButton';
import { AutoSubmitForm } from '@/components/finance/AutoSubmitForm';
import { DateRange } from '@/components/ui/DateRange';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { getActiveActivity } from '@/lib/activity-context';
import { isoDate, parseDateInput, participantRows, todayIso } from '@/lib/finance';
import { prisma } from '@/lib/prisma';
import { fdate, rp } from '@/lib/format';
import { btnGhost, filterFull, filterHalf, filterRow, input, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

type Search = { q?: string; method?: string; status?: string; from?: string; to?: string; page?: string };

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

  const page = pageFrom(sp.page);

  const [payments, matched, valid, participants] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { participant: { include: { student: true } }, proof: { select: { id: true } } },
      orderBy: [{ date: 'desc' }, { seq: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.payment.count({ where }),
    // Ringkasan dihitung di database atas SELURUH pembayaran yang cocok, bukan
    // atas baris satu halaman — totalnya tidak boleh berubah saat berpindah halaman.
    prisma.payment.findMany({
      where: { ...where, status: 'SAH' },
      select: { amount: true, method: true },
    }),
    writer && !archived ? participantRows(activity.id) : Promise.resolve([]),
  ]);
  const sum = (list: { amount: number }[]) => list.reduce((s, p) => s + p.amount, 0);
  const cancelled = matched - valid.length;

  return (
    <>
      <PageHead
        pathname="/pembayaran"
        activity={activity}
        actions={writer && !archived && <PaymentFormModal participants={participants} today={todayIso()} />}
      />

      <KpiRow>
        <Kpi label="Total Pemasukan" value={rp(sum(valid))} tone="success" hint={`${valid.length} transaksi sah`} />
        <Kpi label="Tunai" value={rp(sum(valid.filter((p) => p.method === 'TUNAI')))} />
        <Kpi label="Transfer" value={rp(sum(valid.filter((p) => p.method === 'TRANSFER')))} />
        <Kpi label="Dibatalkan" value={String(cancelled)} hint="tidak dihitung" />
      </KpiRow>

      <AutoSubmitForm className={`${filterRow} mb-3`}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari siswa, NIS, atau no. kuitansi…"
          aria-label="Cari pembayaran"
          className={`${input} max-w-[280px] ${filterFull}`}
        />
        <select name="method" defaultValue={sp.method ?? ''} aria-label="Metode" className={`${input} max-w-[195px] ${filterHalf}`}>
          <option value="">Semua metode</option>
          <option value="TUNAI">Tunai</option>
          <option value="TRANSFER">Transfer</option>
        </select>
        <select name="status" defaultValue={sp.status ?? ''} aria-label="Status" className={`${input} max-w-[195px] ${filterHalf}`}>
          <option value="">Semua status</option>
          <option value="SAH">Sah</option>
          <option value="DIBATALKAN">Dibatalkan</option>
        </select>
        <DateRange from={sp.from} to={sp.to} />
        {(q || sp.method || sp.status || sp.from || sp.to) && (
          <Link href="/pembayaran" className="text-[12.5px] font-semibold text-brand-700 hover:text-brand-800 max-[640px]:justify-self-start">
            Reset
          </Link>
        )}
      </AutoSubmitForm>

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
                  <Link href={`/pembayaran/${p.id}`} className="text-brand-700 hover:underline">{p.receiptNo}</Link>
                </td>
                <td className={`${td} whitespace-nowrap`}>{fdate(isoDate(p.date))}</td>
                <td className={td}>
                  <div className="font-semibold text-gray-900">{p.participant.student.name}</div>
                  <div className="text-[12px] text-gray-500">
                    <span className={mono}>{p.participant.student.nis}</span>
                    {p.participant.student.className ? ` · ${p.participant.student.className}` : ''}
                  </div>
                </td>
                <td className={td}>
                  {p.method === 'TUNAI' ? 'Tunai' : 'Transfer'}
                  {p.proof && <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">bukti</span>}
                </td>
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
      <Pagination
        page={page}
        total={matched}
        label="pembayaran"
        params={{ q, method: sp.method, status: sp.status, from: sp.from, to: sp.to }}
      />
    </>
  );
}
