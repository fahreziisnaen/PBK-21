import Link from 'next/link';
import { PageHead } from '@/components/shell/PageHead';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { PrintButton } from '@/components/ui/PrintButton';
import { DateRange } from '@/components/ui/DateRange';
import { AutoSubmitForm } from '@/components/finance/AutoSubmitForm';
import { ReportKop, ReportSignature, SignatureFooterRow } from '@/components/finance/ReportDocument';
import { requireUser } from '@/lib/auth-guard';
import { getActiveActivity } from '@/lib/activity-context';
import { isoDate, ledgerRows, parseDateInput, todayIso } from '@/lib/finance';
import { reportPeriod } from '@/lib/report-period';
import { prisma } from '@/lib/prisma';
import { fdate, rp } from '@/lib/format';
import { filterRow, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

export default async function BukuKasPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requireUser();
  const activity = await getActiveActivity();
  if (!activity) {
    return (
      <>
        <PageHead pathname="/buku-kas" />
        <NoActivity />
      </>
    );
  }
  const sp = await searchParams;
  const from = parseDateInput(sp.from ?? null);
  const to = parseDateInput(sp.to ?? null);

  // Saldo berjalan selalu dihitung dari awal kegiatan, lalu baris di luar
  // rentang disembunyikan — supaya saldo pada baris pertama hasil filter tetap benar.
  const [all, school, signer] = await Promise.all([
    ledgerRows(activity.id),
    prisma.school.findFirst(),
    prisma.user.findUnique({ where: { id: user.id }, select: { signatureImage: true } }),
  ]);
  const inRange = all.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  const firstIndex = inRange.length ? all.indexOf(inRange[0]!) : -1;
  const opening = firstIndex > 0 ? all[firstIndex - 1]!.balance : 0;
  const income = inRange.reduce((s, r) => s + r.income, 0);
  const expense = inRange.reduce((s, r) => s + r.expense, 0);

  return (
    <>
      <PageHead pathname="/buku-kas" activity={activity} actions={<PrintButton label="Cetak Buku Kas" />} />

      <div data-report data-landscape>
      <ReportKop
        printOnly
        school={school}
        title="Buku Kas"
        lines={[activity.name]}
        period={reportPeriod({
          from,
          to,
          firstDate: inRange[0]?.date ?? null,
          lastDate: inRange.at(-1)?.date ?? null,
          today: todayIso(),
        })}
      />

      <KpiRow>
        <Kpi label="Saldo Awal" value={rp(opening)} />
        <Kpi label="Total Pemasukan" value={rp(income)} tone="success" />
        <Kpi label="Total Pengeluaran" value={rp(expense)} tone="error" />
        <Kpi label="Saldo Akhir" value={rp(opening + income - expense)} tone="brand" />
      </KpiRow>

      <AutoSubmitForm className={`${filterRow} mb-3`}>
        <span className="text-[12.5px] font-semibold text-gray-600 max-[640px]:col-span-2">Periode</span>
        <DateRange from={sp.from} to={sp.to} />
        {(sp.from || sp.to) && (
          <Link href="/buku-kas" className="text-[12.5px] font-semibold text-brand-700 max-[640px]:justify-self-start">
            Reset
          </Link>
        )}
      </AutoSubmitForm>

      <div className={tableWrap}>
        <table data-stack className={`${table} min-w-[900px]`}>
          <thead>
            <tr>
              <th className={th}>Tanggal</th>
              <th className={th}>No. Ref</th>
              <th className={th}>Keterangan</th>
              <th className={th}>Kategori</th>
              <th className={thNum}>Masuk</th>
              <th className={thNum}>Keluar</th>
              <th className={thNum}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {opening !== 0 && (
              <tr>
                <td className={td} colSpan={6}><i className="text-gray-500">Saldo sebelum periode</i></td>
                <td data-label="Saldo" className={tdNum}>{rp(opening)}</td>
              </tr>
            )}
            {inRange.length === 0 && (
              <tr><td className={`${td} py-10 text-center text-gray-500`} colSpan={7}>Belum ada mutasi kas pada periode ini.</td></tr>
            )}
            {inRange.map((r) => (
              <tr key={r.key}>
                <td data-label="Tanggal" className={`${td} whitespace-nowrap`}>{fdate(isoDate(r.date))}</td>
                <td data-label="No. Ref" className={`${td} ${mono}`}>
                  {r.href ? <Link href={r.href} className="text-brand-700 hover:underline">{r.ref}</Link> : r.ref}
                </td>
                <td data-label="Keterangan" className={td}>{r.description}</td>
                <td data-label="Kategori" className={`${td} print:whitespace-nowrap`}>{r.category}</td>
                <td data-label="Masuk" className={`${tdNum} text-success-700`}>{r.income ? rp(r.income) : ''}</td>
                <td data-label="Keluar" className={`${tdNum} text-error-600`}>{r.expense ? rp(r.expense) : ''}</td>
                <td data-label="Saldo" className={`${tdNum} font-semibold text-gray-900`}>{rp(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          {inRange.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className={td} colSpan={4}>Total mutasi</td>
                <td data-label="Masuk" className={`${tdNum} text-success-700`}>{rp(income)}</td>
                <td data-label="Keluar" className={`${tdNum} text-error-600`}>{rp(expense)}</td>
                <td data-label="Saldo" className={`${tdNum} text-gray-900`}>{rp(opening + income - expense)}</td>
              </tr>
              <SignatureFooterRow colSpan={7} name={user.name ?? ''} signatureImage={signer?.signatureImage} date={todayIso()} />
            </tfoot>
          )}
        </table>
      </div>

      {inRange.length === 0 && (
        <ReportSignature printOnly name={user.name ?? ''} signatureImage={signer?.signatureImage} date={todayIso()} />
      )}
      </div>
    </>
  );
}
