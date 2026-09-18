import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { PrintButton } from '@/components/ui/PrintButton';
import { GradeClassSelects, ReportFilters } from '@/components/finance/ReportFilters';
import { ReportKop, ReportSignature, SignatureFooterRow } from '@/components/finance/ReportDocument';
import { requireUser } from '@/lib/auth-guard';
import { resolveReport } from '@/lib/report-context';
import { isoDate, payStatus, todayIso } from '@/lib/finance';
import { prisma } from '@/lib/prisma';
import { fdateLong, rp } from '@/lib/format';
import { filterHalf, input, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

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
  const today = todayIso();
  // Tanpa penyaring tanggal, laporan ini adalah potret status pelunasan pada
  // hari dicetak — ditulis begitu, bukan "seluruh periode" yang tidak menyebut
  // kapan keadaan itu berlaku. Dengan penyaring, akhir periode ditulis sebagai
  // tanggal, bukan "saat ini" yang berubah arti setelah kertasnya disimpan.
  const periodLabel =
    from || to
      ? `Pembayaran ${from ? fdateLong(isoDate(from)) : 'awal'} s.d. ${fdateLong(to ? isoDate(to) : today)}`
      : `Keadaan per ${fdateLong(today)}`;

  return (
    <>
      <PageHead pathname="/laporan/pembayaran" activity={activity} actions={<PrintButton label="Cetak Laporan" />} />

      <ReportFilters activities={activities} activityId={activity.id} from={sp.from} to={sp.to}>
        <GradeClassSelects classes={classes} grade={sp.grade} kelas={sp.kelas} />
        <select name="status" defaultValue={sp.status ?? ''} className={`${input} max-w-[205px] ${filterHalf}`} aria-label="Status">
          <option value="">Semua status</option>
          <option>Lunas</option>
          <option>Belum Lunas</option>
          <option>Belum Bayar</option>
        </select>
      </ReportFilters>

      <div data-report className="rounded-xl border border-gray-200 bg-white p-6 print:border-0 print:p-0">
        <ReportKop
          school={school}
          title="Laporan Pembayaran Siswa"
          lines={[
            [
              activity.name,
              sp.grade ? `Tingkat ${sp.grade}` : '',
              sp.kelas ? `Kelas ${sp.kelas === '-' ? 'belum diisi' : sp.kelas}` : '',
              sp.status ?? '',
            ]
              .filter(Boolean)
              .join(' · '),
            periodLabel,
          ]}
        />

        <KpiRow>
          <Kpi label="Siswa" value={String(rows.length)} hint={`${rows.filter((r) => r.status === 'Lunas').length} lunas`} />
          <Kpi label="Total Tagihan" value={rp(billing)} />
          <Kpi label="Total Dibayar" value={rp(paid)} tone="success" />
          <Kpi label="Sisa Tagihan" value={rp(Math.max(billing - paid, 0))} tone="error" />
        </KpiRow>

        <div className={tableWrap}>
          <table data-stack className={`${table} min-w-[860px]`}>
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
                  <td data-label="No" className={tdNum}>{i + 1}</td>
                  <td data-label="NIS" className={`${td} ${mono}`}>{r.student.nis}</td>
                  <td data-label="Nama Siswa" className={`${td} font-semibold text-gray-900`}>{r.student.name}</td>
                  <td data-label="Kelas" className={td}>{r.student.className ?? r.student.grade}</td>
                  <td data-label="Tagihan" className={tdNum}>{rp(r.billing)}</td>
                  <td data-label="Dibayar" className={tdNum}>{rp(r.paid)}</td>
                  <td data-label="Sisa" className={tdNum}>{rp(r.remaining)}</td>
                  <td data-label="Status" className={td}><Badge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className={td} colSpan={4}>Total</td>
                  <td data-label="Tagihan" className={tdNum}>{rp(billing)}</td>
                  <td data-label="Dibayar" className={tdNum}>{rp(paid)}</td>
                  <td data-label="Sisa" className={tdNum}>{rp(Math.max(billing - paid, 0))}</td>
                  <td data-label="" className={td}></td>
                </tr>
                <SignatureFooterRow colSpan={8} name={user.name ?? ''} signatureImage={signer?.signatureImage} date={today} />
              </tfoot>
            )}
          </table>
        </div>

        <ReportSignature screenOnly={rows.length > 0} name={user.name ?? ''} signatureImage={signer?.signatureImage} date={today} />
      </div>
    </>
  );
}
