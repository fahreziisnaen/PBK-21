import { PageHead } from '@/components/shell/PageHead';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { PrintButton } from '@/components/ui/PrintButton';
import { requireUser } from '@/lib/auth-guard';
import { getActiveActivity } from '@/lib/activity-context';
import { participantRows, todayIso, type ParticipantRow } from '@/lib/finance';
import { fdateLong, rp } from '@/lib/format';
import { table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';
import { ReportKop, ReportSignature, SignatureFooterRow } from '@/components/finance/ReportDocument';
import { prisma } from '@/lib/prisma';

type Group = { key: string; rows: ParticipantRow[] };

function summarize(rows: ParticipantRow[]) {
  const billing = rows.reduce((s, r) => s + r.billing, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  return {
    count: rows.length,
    lunas: rows.filter((r) => r.status === 'Lunas').length,
    belumLunas: rows.filter((r) => r.status === 'Belum Lunas').length,
    belumBayar: rows.filter((r) => r.status === 'Belum Bayar').length,
    billing,
    paid,
    remaining: Math.max(billing - paid, 0),
    pct: billing ? Math.round((paid / billing) * 100) : 0,
  };
}

function RecapTable({
  title,
  firstCol,
  groups,
  footer,
}: {
  title: string;
  firstCol: string;
  groups: Group[];
  /** Baris tambahan di akhir footer tabel, mis. tanda tangan cetak. */
  footer?: React.ReactNode;
}) {
  const total = summarize(groups.flatMap((g) => g.rows));
  return (
    <>
      <h2 className="mb-2 mt-2 text-[14px] font-bold text-gray-900">{title}</h2>
      <div className={`${tableWrap} mb-6`}>
        <table className={`${table} min-w-[900px]`}>
          <thead>
            <tr>
              <th className={th}>{firstCol}</th>
              <th className={thNum}>Peserta</th>
              <th className={thNum}>Lunas</th>
              <th className={thNum}>Belum Lunas</th>
              <th className={thNum}>Belum Bayar</th>
              <th className={thNum}>Tagihan</th>
              <th className={thNum}>Dibayar</th>
              <th className={thNum}>Sisa</th>
              <th className={thNum}>Terkumpul</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr><td className={`${td} py-8 text-center text-gray-500`} colSpan={9}>Belum ada peserta.</td></tr>
            )}
            {groups.map((g) => {
              const s = summarize(g.rows);
              return (
                <tr key={g.key}>
                  <td className={`${td} font-semibold text-gray-900`}>{g.key}</td>
                  <td className={tdNum}>{s.count}</td>
                  <td className={`${tdNum} text-success-700`}>{s.lunas}</td>
                  <td className={`${tdNum} text-warn-700`}>{s.belumLunas}</td>
                  <td className={`${tdNum} text-error-600`}>{s.belumBayar}</td>
                  <td className={tdNum}>{rp(s.billing)}</td>
                  <td className={tdNum}>{rp(s.paid)}</td>
                  <td className={tdNum}>{rp(s.remaining)}</td>
                  <td className={tdNum}>
                    <div className="flex items-center justify-end gap-2">
                      {/* Bilah tidak tercetak: latar belakang tidak ikut dicetak, jadi
                          yang tersisa hanya ruang kosong di depan persentase. */}
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100 print:hidden">
                        <div className="h-full bg-success-500" style={{ width: `${Math.min(s.pct, 100)}%` }} />
                      </div>
                      <span className="font-mono text-[12px]">{s.pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className={td}>Total</td>
                <td className={tdNum}>{total.count}</td>
                <td className={tdNum}>{total.lunas}</td>
                <td className={tdNum}>{total.belumLunas}</td>
                <td className={tdNum}>{total.belumBayar}</td>
                <td className={tdNum}>{rp(total.billing)}</td>
                <td className={tdNum}>{rp(total.paid)}</td>
                <td className={tdNum}>{rp(total.remaining)}</td>
                <td className={tdNum}>{total.pct}%</td>
              </tr>
              {footer}
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

function groupBy(rows: ParticipantRow[], key: (r: ParticipantRow) => string): Group[] {
  const map = new Map<string, ParticipantRow[]>();
  for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'id', { numeric: true })).map(([k, rs]) => ({ key: k, rows: rs }));
}

export default async function RekapPage() {
  const user = await requireUser();
  const activity = await getActiveActivity();
  if (!activity) {
    return (
      <>
        <PageHead pathname="/rekap" />
        <NoActivity />
      </>
    );
  }
  const [rows, school, signer] = await Promise.all([
    participantRows(activity.id),
    prisma.school.findFirst(),
    prisma.user.findUnique({ where: { id: user.id }, select: { signatureImage: true } }),
  ]);
  const today = todayIso();
  const t = summarize(rows);
  const gradeOrder = { X: '1', XI: '2', XII: '3' } as Record<string, string>;

  return (
    <>
      <PageHead pathname="/rekap" activity={activity} actions={<PrintButton label="Cetak Rekap" />} />
      {/* Sebelumnya rekap tidak punya kop maupun tanda tangan: yang tercetak
          hanya judul layar, tanpa nama sekolah atau tanggal. */}
      <div data-report>
      <ReportKop
        printOnly
        school={school}
        title="Rekap Pembayaran"
        lines={[activity.name, `Keadaan per ${fdateLong(today)}`]}
      />
      <KpiRow>
        <Kpi label="Total Siswa" value={String(t.count)} />
        <Kpi label="Lunas" value={String(t.lunas)} tone="success" hint={`${t.count ? Math.round((t.lunas / t.count) * 100) : 0}% peserta`} />
        <Kpi label="Belum Lunas / Belum Bayar" value={`${t.belumLunas} / ${t.belumBayar}`} tone="error" />
        <Kpi label="Terkumpul" value={`${t.pct}%`} tone="brand" hint={`${rp(t.paid)} dari ${rp(t.billing)}`} />
      </KpiRow>
      <RecapTable
        title="Rekap per Tingkat"
        firstCol="Tingkat"
        groups={groupBy(rows, (r) => `${gradeOrder[r.grade] ?? ''}|Tingkat ${r.grade}`).map((g) => ({ ...g, key: g.key.split('|')[1]! }))}
      />
      <RecapTable
        title="Rekap per Kelas"
        firstCol="Kelas"
        groups={groupBy(rows, (r) => r.className ?? `${r.grade} (tanpa kelas)`)}
        footer={<SignatureFooterRow colSpan={9} name={user.name ?? ''} signatureImage={signer?.signatureImage} date={today} />}
      />
      {rows.length === 0 && (
        <ReportSignature printOnly name={user.name ?? ''} signatureImage={signer?.signatureImage} date={today} />
      )}
      </div>
    </>
  );
}
