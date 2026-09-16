import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { PrintButton } from '@/components/ui/PrintButton';
import { ReportFilters } from '@/components/finance/ReportFilters';
import { requireUser } from '@/lib/auth-guard';
import { resolveReport } from '@/lib/report-context';
import { isoDate, payStatus } from '@/lib/finance';
import { prisma } from '@/lib/prisma';
import { fdateLong, rp } from '@/lib/format';
import { input, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

type Search = { activityId?: string; from?: string; to?: string; grade?: string; status?: string; kelas?: string };

export default async function LaporanPembayaranPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { activities, activity, from, to, school } = await resolveReport(sp);
  const [signer, classes] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { signatureImage: true } }),
    prisma.schoolClass.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] }),
  ]);
  if (!activity) {
    return (
      <>
        <PageHead pathname="/laporan/pembayaran" />
        <NoActivity />
      </>
    );
  }

  // "Dibayar" dihitung dari pembayaran sah dalam periode yang dipilih; tanpa
  // periode, seluruh pembayaran sah kegiatan.
  const [participants, sums] = await Promise.all([
    prisma.participant.findMany({
      where: {
        activityId: activity.id,
        ...(sp.grade || sp.kelas
          ? {
              student: {
                ...(sp.grade ? { grade: sp.grade as 'X' | 'XI' | 'XII' } : {}),
                ...(sp.kelas === '-' ? { className: null } : sp.kelas ? { className: sp.kelas } : {}),
              },
            }
          : {}),
      },
      include: { student: true },
      orderBy: [{ student: { grade: 'asc' } }, { student: { className: 'asc' } }, { student: { name: 'asc' } }],
    }),
    prisma.payment.groupBy({
      by: ['participantId'],
      where: { activityId: activity.id, status: 'SAH', ...(from || to ? { date: { gte: from ?? undefined, lte: to ?? undefined } } : {}) },
      _sum: { amount: true },
      _count: true,
    }),
  ]);
  const paidBy = new Map(sums.map((s) => [s.participantId, { amount: s._sum.amount ?? 0, count: s._count }]));
  const rows = participants
    .map((p) => {
      const paid = paidBy.get(p.id);
      const amount = paid?.amount ?? 0;
      return { ...p, paid: amount, count: paid?.count ?? 0, remaining: Math.max(p.billing - amount, 0), status: payStatus(p.billing, amount) };
    })
    .filter((r) => !sp.status || r.status === sp.status);

  const billing = rows.reduce((s, r) => s + r.billing, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const periodLabel = from || to ? `${from ? fdateLong(isoDate(from)) : 'awal'} s.d. ${to ? fdateLong(isoDate(to)) : 'saat ini'}` : 'seluruh periode';

  return (
    <>
      <PageHead pathname="/laporan/pembayaran" activity={activity} actions={<PrintButton label="Cetak Laporan" />} />

      <ReportFilters activities={activities} activityId={activity.id} from={sp.from} to={sp.to}>
        <select name="grade" defaultValue={sp.grade ?? ''} className={`${input} max-w-[185px]`} aria-label="Tingkat">
          <option value="">Semua tingkat</option>
          <option value="X">Tingkat X</option>
          <option value="XI">Tingkat XI</option>
          <option value="XII">Tingkat XII</option>
        </select>
        <select name="kelas" defaultValue={sp.kelas ?? ''} className={`${input} max-w-[205px]`} aria-label="Kelas">
          <option value="">Semua kelas</option>
          <option value="-">— Tanpa kelas —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ''} className={`${input} max-w-[205px]`} aria-label="Status">
          <option value="">Semua status</option>
          <option>Lunas</option>
          <option>Belum Lunas</option>
          <option>Belum Bayar</option>
        </select>
      </ReportFilters>

      <div className="rounded-xl border border-gray-200 bg-white p-6 print:border-0 print:p-0">
        <div className="mb-5 border-b-2 border-gray-900 pb-3 text-center">
          <div className="text-[16px] font-extrabold uppercase tracking-wide text-gray-900">{school?.name}</div>
          <div className="text-[15px] font-bold text-gray-900">LAPORAN PEMBAYARAN SISWA</div>
          <div className="text-[13px] text-gray-700">
            {activity.name}
            {sp.grade ? ` · Tingkat ${sp.grade}` : ''}
            {sp.kelas ? ` · Kelas ${sp.kelas === '-' ? 'belum diisi' : sp.kelas}` : ''}
            {sp.status ? ` · ${sp.status}` : ''}
          </div>
          <div className="text-[12px] text-gray-500">Periode pembayaran: {periodLabel}</div>
        </div>

        <KpiRow>
          <Kpi label="Siswa" value={String(rows.length)} hint={`${rows.filter((r) => r.status === 'Lunas').length} lunas`} />
          <Kpi label="Total Tagihan" value={rp(billing)} />
          <Kpi label="Total Dibayar" value={rp(paid)} tone="success" />
          <Kpi label="Total Outstanding" value={rp(Math.max(billing - paid, 0))} tone="error" />
        </KpiRow>

        <div className={tableWrap}>
          <table className={`${table} min-w-[860px]`}>
            <thead>
              <tr>
                <th className={th}>No</th>
                <th className={th}>NIS</th>
                <th className={th}>Nama Siswa</th>
                <th className={th}>Kelas</th>
                <th className={thNum}>Tagihan</th>
                <th className={thNum}>Dibayar</th>
                <th className={thNum}>Sisa</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td className={`${td} py-8 text-center text-gray-500`} colSpan={8}>Tidak ada siswa pada filter ini.</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className={tdNum}>{i + 1}</td>
                  <td className={`${td} ${mono}`}>{r.student.nis}</td>
                  <td className={`${td} font-semibold text-gray-900`}>{r.student.name}</td>
                  <td className={td}>{r.student.className ?? r.student.grade}</td>
                  <td className={tdNum}>{rp(r.billing)}</td>
                  <td className={tdNum}>{rp(r.paid)}</td>
                  <td className={tdNum}>{rp(r.remaining)}</td>
                  <td className={td}><Badge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className={td} colSpan={4}>Total</td>
                  <td className={tdNum}>{rp(billing)}</td>
                  <td className={tdNum}>{rp(paid)}</td>
                  <td className={tdNum}>{rp(Math.max(billing - paid, 0))}</td>
                  <td className={td}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="mt-10 flex justify-end">
          <div className="min-w-[220px] text-center text-[13px] text-gray-700">
            <div>Surabaya, {fdateLong(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()))}</div>
            <div>Bendahara</div>
            {signer?.signatureImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signer.signatureImage} alt="Tanda tangan bendahara" className="mx-auto h-16 object-contain" />
            ) : (
              <div className="h-16" />
            )}
            <div className="border-t border-gray-500 pt-1 font-semibold text-gray-900">{user.name}</div>
          </div>
        </div>
      </div>
    </>
  );
}
