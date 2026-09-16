import Link from 'next/link';
import { PageHead } from '@/components/shell/PageHead';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { PrintButton } from '@/components/ui/PrintButton';
import { requireUser } from '@/lib/auth-guard';
import { getActiveActivity } from '@/lib/activity-context';
import { isoDate, ledgerRows, parseDateInput } from '@/lib/finance';
import { prisma } from '@/lib/prisma';
import { fdate, fdateLong, rp } from '@/lib/format';
import { btnSecondary, input, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

export default async function BukuKasPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser();
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
  const [all, school] = await Promise.all([ledgerRows(activity.id), prisma.school.findFirst()]);
  const inRange = all.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  const firstIndex = inRange.length ? all.indexOf(inRange[0]!) : -1;
  const opening = firstIndex > 0 ? all[firstIndex - 1]!.balance : 0;
  const income = inRange.reduce((s, r) => s + r.income, 0);
  const expense = inRange.reduce((s, r) => s + r.expense, 0);

  return (
    <>
      <PageHead pathname="/buku-kas" activity={activity} actions={<PrintButton label="Cetak Buku Kas" />} />

      <div className="mb-4 hidden print:block">
        <div className="text-[16px] font-extrabold uppercase">{school?.name}</div>
        <div className="text-[14px] font-bold">Buku Kas — {activity.name}</div>
        <div className="text-[12px] text-gray-600">
          Periode {from ? fdateLong(isoDate(from)) : 'awal'} s.d. {to ? fdateLong(isoDate(to)) : 'saat ini'}
        </div>
      </div>

      <KpiRow>
        <Kpi label="Saldo Awal" value={rp(opening)} />
        <Kpi label="Total Pemasukan" value={rp(income)} tone="success" />
        <Kpi label="Total Pengeluaran" value={rp(expense)} tone="error" />
        <Kpi label="Saldo Akhir" value={rp(opening + income - expense)} tone="brand" />
      </KpiRow>

      <form className="mb-3 flex flex-wrap items-center gap-2" data-noprint>
        <span className="text-[12.5px] font-semibold text-gray-600">Periode</span>
        <input type="date" name="from" defaultValue={sp.from ?? ''} className={`${input} max-w-[160px]`} aria-label="Dari tanggal" />
        <span className="text-gray-400">–</span>
        <input type="date" name="to" defaultValue={sp.to ?? ''} className={`${input} max-w-[160px]`} aria-label="Sampai tanggal" />
        <button className={btnSecondary}>Terapkan</button>
        {(sp.from || sp.to) && <Link href="/buku-kas" className="text-[12.5px] font-semibold text-brand-600">Reset</Link>}
      </form>

      <div className={tableWrap}>
        <table className={`${table} min-w-[900px]`}>
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
                <td className={tdNum}>{rp(opening)}</td>
              </tr>
            )}
            {inRange.length === 0 && (
              <tr><td className={`${td} py-10 text-center text-gray-500`} colSpan={7}>Belum ada mutasi kas pada periode ini.</td></tr>
            )}
            {inRange.map((r) => (
              <tr key={r.key}>
                <td className={`${td} whitespace-nowrap`}>{fdate(isoDate(r.date))}</td>
                <td className={`${td} ${mono}`}>
                  {r.href ? <Link href={r.href} className="text-brand-600 hover:underline">{r.ref}</Link> : r.ref}
                </td>
                <td className={td}>{r.description}</td>
                <td className={td}>{r.category}</td>
                <td className={`${tdNum} text-success-700`}>{r.income ? rp(r.income) : ''}</td>
                <td className={`${tdNum} text-error-600`}>{r.expense ? rp(r.expense) : ''}</td>
                <td className={`${tdNum} font-semibold text-gray-900`}>{rp(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          {inRange.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className={td} colSpan={4}>Total mutasi</td>
                <td className={`${tdNum} text-success-700`}>{rp(income)}</td>
                <td className={`${tdNum} text-error-600`}>{rp(expense)}</td>
                <td className={`${tdNum} text-gray-900`}>{rp(opening + income - expense)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
