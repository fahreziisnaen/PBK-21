import { PageHead } from '@/components/shell/PageHead';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { PrintButton } from '@/components/ui/PrintButton';
import { GradeClassSelects, ReportFilters } from '@/components/finance/ReportFilters';
import { requireUser } from '@/lib/auth-guard';
import { resolveReport } from '@/lib/report-context';
import { isoDate, ledgerRows } from '@/lib/finance';
import { prisma } from '@/lib/prisma';
import { fdate, fdateLong, rp } from '@/lib/format';
import { input, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

type Search = {
  activityId?: string;
  from?: string;
  to?: string;
  categoryId?: string;
  type?: string;
  method?: string;
  grade?: string;
  kelas?: string;
};

export default async function LaporanKeuanganPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { activities, activity, from, to, school } = await resolveReport(sp);
  const signer = await prisma.user.findUnique({ where: { id: user.id }, select: { signatureImage: true } });
  if (!activity) {
    return (
      <>
        <PageHead pathname="/laporan/keuangan" />
        <NoActivity />
      </>
    );
  }
  const method = sp.method === 'TUNAI' || sp.method === 'TRANSFER' ? sp.method : '';
  const grade = sp.grade === 'X' || sp.grade === 'XI' || sp.grade === 'XII' ? sp.grade : '';
  const kelas = sp.kelas ?? '';
  const [categories, classes] = await Promise.all([
    prisma.expenseCategory.findMany({ orderBy: { code: 'asc' } }),
    prisma.schoolClass.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] }),
  ]);

  // Menyaring per tingkat atau kelas mengubah laporan ini jadi laporan
  // PEMASUKAN kelas itu. Pengeluaran milik kegiatan dan tidak terikat kelas
  // mana pun, jadi ia dikeluarkan, dan saldo tidak ditampilkan: pemasukan satu
  // kelas dikurangi seluruh pengeluaran kegiatan bukan angka yang berarti.
  // Penyaring jenis dan kategori pengeluaran ikut diabaikan karena alasan yang sama.
  const byClass = Boolean(grade || kelas);
  const type = byClass ? '' : sp.type === 'masuk' || sp.type === 'keluar' ? sp.type : '';
  const categoryName = byClass ? undefined : categories.find((c) => c.id === sp.categoryId)?.name;

  const ledger = await ledgerRows(activity.id);
  const inPeriod = (d: Date) => (!from || d >= from) && (!to || d <= to);
  const opening = ledger.filter((r) => from && r.date < from).reduce((s, r) => s + r.income - r.expense, 0);
  const rows = ledger.filter(
    (r) =>
      inPeriod(r.date) &&
      (type !== 'masuk' || r.income > 0) &&
      (type !== 'keluar' || r.expense > 0) &&
      (!categoryName || r.category === categoryName) &&
      (!method || r.method === method) &&
      (!byClass ||
        // Hanya pemasukan: pengeluaran berkelas null, dan tanpa syarat ini
        // opsi "Tanpa kelas" (yang mencari null) ikut menyeretnya masuk.
        (r.income > 0 &&
          (!grade || r.grade === grade) &&
          (!kelas || (kelas === '-' ? !r.className : r.className === kelas)))),
  );
  // Saldo berjalan hanya bermakna bila seluruh mutasi kegiatan ikut terhitung.
  const showBalance = !type && !categoryName && !byClass;
  const income = rows.reduce((s, r) => s + r.income, 0);
  const expense = rows.reduce((s, r) => s + r.expense, 0);

  // Pemasukan dan pengeluaran dipisah menurut cara pembayarannya, supaya uang
  // tunai di tangan bendahara bisa dicocokkan terpisah dari mutasi rekening.
  const byMethod = {
    income: { TUNAI: 0, TRANSFER: 0 },
    expense: { TUNAI: 0, TRANSFER: 0 },
  };
  for (const r of rows) {
    if (r.income) byMethod.income[r.method] += r.income;
    if (r.expense) byMethod.expense[r.method] += r.expense;
  }

  // Ringkasan pengeluaran per kategori dalam periode.
  const perCategory = new Map<string, number>();
  for (const r of rows) if (r.expense) perCategory.set(r.category, (perCategory.get(r.category) ?? 0) + r.expense);

  const periodLabel = `${from ? fdateLong(isoDate(from)) : fdateLong(isoDate(activity.startDate))} s.d. ${to ? fdateLong(isoDate(to)) : 'saat ini'}`;
  const balances: number[] = [];
  rows.reduce((prev, r) => {
    const next = prev + r.income - r.expense;
    balances.push(next);
    return next;
  }, opening);

  return (
    <>
      <PageHead pathname="/laporan/keuangan" activity={activity} actions={<PrintButton label="Cetak Laporan" />} />

      <ReportFilters activities={activities} activityId={activity.id} from={sp.from} to={sp.to}>
        <GradeClassSelects classes={classes} grade={grade} kelas={kelas} />
        <select name="method" defaultValue={method} className={`${input} max-w-[195px]`} aria-label="Metode">
          <option value="">Tunai & transfer</option>
          <option value="TUNAI">Tunai saja</option>
          <option value="TRANSFER">Transfer saja</option>
        </select>
        {/* Tidak dirender saat menyaring per kelas: keduanya menyangkut
            pengeluaran, yang tidak ikut dalam laporan per kelas. Karena tidak
            ada di form, nilainya juga ikut lepas dari URL saat dikirim ulang. */}
        {!byClass && (
          <>
            <select name="type" defaultValue={type} className={`${input} max-w-[205px]`} aria-label="Jenis">
              <option value="">Masuk & keluar</option>
              <option value="masuk">Pemasukan saja</option>
              <option value="keluar">Pengeluaran saja</option>
            </select>
            <select name="categoryId" defaultValue={sp.categoryId ?? ''} className={`${input} max-w-[245px]`} aria-label="Kategori pengeluaran">
              <option value="">Semua kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
      </ReportFilters>

      <div className="rounded-xl border border-gray-200 bg-white p-6 print:border-0 print:p-0">
        <div className="mb-5 border-b-2 border-gray-900 pb-3 text-center">
          <div className="text-[16px] font-extrabold uppercase tracking-wide text-gray-900">{school?.name}</div>
          <div className="text-[15px] font-bold text-gray-900">
            {byClass ? 'LAPORAN PEMASUKAN KEGIATAN' : 'LAPORAN KEUANGAN KEGIATAN'}
          </div>
          <div className="text-[13px] text-gray-700">
            {activity.name} · {activity.category.name}
            {grade ? ` · Tingkat ${grade}` : ''}
            {kelas ? ` · Kelas ${kelas === '-' ? 'belum diisi' : kelas}` : ''}
          </div>
          <div className="text-[12px] text-gray-500">Periode {periodLabel}</div>
        </div>

        {byClass ? (
          <>
            <KpiRow>
              <Kpi label="Total Pemasukan" value={rp(income)} tone="success" />
              <Kpi label="Pemasukan Tunai" value={rp(byMethod.income.TUNAI)} tone="success" />
              <Kpi label="Pemasukan Transfer" value={rp(byMethod.income.TRANSFER)} tone="success" />
              <Kpi label="Transaksi" value={String(rows.length)} hint="pembayaran sah" />
            </KpiRow>
            <p data-noprint className="mb-4 rounded-lg bg-gray-100 px-3 py-2 text-[12.5px] text-ink-soft">
              Disaring per {kelas ? 'kelas' : 'tingkat'}: hanya pemasukan dari siswa yang cocok. Pengeluaran dan saldo
              tidak ditampilkan karena pengeluaran milik kegiatan, bukan milik kelas. Kelas yang dipakai adalah kelas
              siswa saat ini.
            </p>
          </>
        ) : (
          <>
            <KpiRow>
              <Kpi label="Saldo Awal" value={rp(opening)} />
              <Kpi label="Total Pemasukan" value={rp(income)} tone="success" />
              <Kpi label="Total Pengeluaran" value={rp(expense)} tone="error" />
              <Kpi label="Saldo Akhir" value={rp(opening + income - expense)} tone="brand" />
            </KpiRow>

            <KpiRow>
              <Kpi label="Pemasukan Tunai" value={rp(byMethod.income.TUNAI)} tone="success" />
              <Kpi label="Pemasukan Transfer" value={rp(byMethod.income.TRANSFER)} tone="success" />
              <Kpi label="Pengeluaran Tunai" value={rp(byMethod.expense.TUNAI)} tone="error" />
              <Kpi label="Pengeluaran Transfer" value={rp(byMethod.expense.TRANSFER)} tone="error" />
            </KpiRow>
          </>
        )}

        {perCategory.size > 0 && (
          <>
            <h2 className="mb-2 text-[14px] font-bold text-gray-900">Ringkasan Pengeluaran per Kategori</h2>
            <div className={`${tableWrap} mb-5`}>
              <table className={table}>
                <thead>
                  <tr><th className={th}>Kategori</th><th className={thNum}>Jumlah</th><th className={thNum}>Porsi</th></tr>
                </thead>
                <tbody>
                  {[...perCategory.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount]) => (
                    <tr key={name}>
                      <td className={td}>{name}</td>
                      <td className={tdNum}>{rp(amount)}</td>
                      <td className={tdNum}>{expense ? Math.round((amount / expense) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 className="mb-2 text-[14px] font-bold text-gray-900">Rincian Transaksi</h2>
        <div className={tableWrap}>
          <table className={`${table} min-w-[860px]`}>
            <thead>
              <tr>
                <th className={th}>Tanggal</th>
                <th className={th}>No. Ref</th>
                <th className={th}>Keterangan</th>
                <th className={th}>Kategori</th>
                <th className={th}>Metode</th>
                <th className={thNum}>Masuk</th>
                <th className={thNum}>Keluar</th>
                {showBalance && <th className={thNum}>Saldo</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td className={`${td} py-8 text-center text-gray-500`} colSpan={8}>Tidak ada transaksi pada filter ini.</td></tr>
              )}
              {rows.map((r, i) => {
                return (
                  <tr key={r.key}>
                    <td className={`${td} whitespace-nowrap`}>{fdate(isoDate(r.date))}</td>
                    <td className={`${td} ${mono}`}>{r.ref}</td>
                    <td className={td}>{r.description}</td>
                    <td className={td}>{r.category}</td>
                    <td className={td}>{r.method === 'TUNAI' ? 'Tunai' : 'Transfer'}</td>
                    <td className={tdNum}>{r.income ? rp(r.income) : ''}</td>
                    <td className={tdNum}>{r.expense ? rp(r.expense) : ''}</td>
                    {showBalance && <td className={`${tdNum} font-semibold`}>{rp(balances[i]!)}</td>}
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className={td} colSpan={5}>Total</td>
                  <td className={tdNum}>{rp(income)}</td>
                  <td className={tdNum}>{rp(expense)}</td>
                  {showBalance && <td className={tdNum}>{rp(opening + income - expense)}</td>}
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
