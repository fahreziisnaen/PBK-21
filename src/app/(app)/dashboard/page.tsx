import Link from 'next/link';
import { PageHead } from '@/components/shell/PageHead';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { requireUser } from '@/lib/auth-guard';
import { getActiveActivity } from '@/lib/activity-context';
import { activityFinance, isoDate, ledgerRows, participantRows } from '@/lib/finance';
import { prisma } from '@/lib/prisma';
import { fdate, MON, rp, rpShort } from '@/lib/format';
import { card } from '@/lib/ui';

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex justify-between text-[12.5px]">
        <span className="text-gray-700">{label}</span>
        <span className="font-mono text-gray-900">{rp(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full ${tone}`} style={{ width: `${max ? Math.max((value / max) * 100, 2) : 0}%` }} />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  await requireUser();
  const activity = await getActiveActivity();
  if (!activity) {
    return (
      <>
        <PageHead pathname="/dashboard" />
        <NoActivity />
      </>
    );
  }

  const [f, participants, ledger, expenseByCat] = await Promise.all([
    activityFinance(activity.id),
    participantRows(activity.id),
    ledgerRows(activity.id),
    prisma.expense.groupBy({ by: ['categoryId'], where: { activityId: activity.id, status: 'AKTIF' }, _sum: { amount: true } }),
  ]);
  const categories = await prisma.expenseCategory.findMany({ where: { id: { in: expenseByCat.map((e) => e.categoryId) } } });
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const expenseCats = expenseByCat
    .map((e) => ({ name: catName.get(e.categoryId) ?? '—', amount: e._sum.amount ?? 0 }))
    .sort((a, b) => b.amount - a.amount);

  const monthly = new Map<string, { income: number; expense: number }>();
  for (const r of ledger) {
    const k = isoDate(r.date).slice(0, 7);
    const m = monthly.get(k) ?? { income: 0, expense: 0 };
    m.income += r.income;
    m.expense += r.expense;
    monthly.set(k, m);
  }
  const months = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  const monthMax = Math.max(1, ...months.flatMap(([, m]) => [m.income, m.expense]));

  const counts = {
    lunas: participants.filter((p) => p.status === 'Lunas').length,
    belumLunas: participants.filter((p) => p.status === 'Belum Lunas').length,
    belumBayar: participants.filter((p) => p.status === 'Belum Bayar').length,
  };
  const target = f.target || f.billing;
  const pct = target ? Math.round((f.income / target) * 100) : 0;
  const recent = [...ledger].reverse().slice(0, 8);

  return (
    <>
      <PageHead pathname="/dashboard" />

      <KpiRow>
        <Kpi label="Total Pemasukan" value={rp(f.income)} tone="success" hint={`${pct}% dari target`} />
        <Kpi label="Total Pengeluaran" value={rp(f.expense)} tone="error" />
        <Kpi label="Saldo Kas" value={rp(f.balance)} tone="brand" />
        <Kpi label="Sisa Tagihan" value={rp(Math.max(f.outstanding, 0))} hint={`${counts.belumLunas + counts.belumBayar} siswa belum lunas`} />
      </KpiRow>

      <div className="mb-4 grid grid-cols-[1.5fr_1fr] gap-4 max-[900px]:grid-cols-1">
        <div className={`${card} p-5`}>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-gray-900">Target Pemasukan</h2>
            <span className="font-mono text-[13px] text-gray-600">{rp(f.income)} / {rp(target)}</span>
          </div>
          <div className="mb-5 h-3 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-brand-600" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>

          <h2 className="mb-3 text-[14px] font-bold text-gray-900">Arus Kas per Bulan</h2>
          {months.length === 0 ? (
            <p className="text-[13px] text-gray-500">Belum ada transaksi.</p>
          ) : (
            <div className="flex h-44 items-end gap-4">
              {months.map(([k, m]) => (
                <div key={k} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-36 w-full items-end justify-center gap-1">
                    <div className="w-1/3 rounded-t bg-success-500" style={{ height: `${(m.income / monthMax) * 100}%` }} title={`Masuk ${rp(m.income)}`} />
                    <div className="w-1/3 rounded-t bg-error-500" style={{ height: `${(m.expense / monthMax) * 100}%` }} title={`Keluar ${rp(m.expense)}`} />
                  </div>
                  <div className="text-[11px] text-gray-500">{MON[Number(k.slice(5, 7)) - 1]} {k.slice(2, 4)}</div>
                  <div className="font-mono text-[10.5px] text-gray-600">{rpShort(m.income - m.expense)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-4 text-[11.5px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success-500" /> Pemasukan</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-error-500" /> Pengeluaran</span>
          </div>
        </div>

        <div className={`${card} p-5`}>
          <h2 className="mb-3 text-[14px] font-bold text-gray-900">Status Pelunasan</h2>
          <div className="mb-5 grid grid-cols-3 gap-2 text-center">
            <Link href="/siswa?status=Lunas" className="rounded-lg bg-success-50 p-3">
              <div className="font-mono text-[20px] font-bold text-success-700">{counts.lunas}</div>
              <div className="text-[11.5px] text-success-700">Lunas</div>
            </Link>
            <Link href="/siswa?status=Belum+Lunas" className="rounded-lg bg-warn-50 p-3">
              <div className="font-mono text-[20px] font-bold text-warn-700">{counts.belumLunas}</div>
              <div className="text-[11.5px] text-warn-700">Belum Lunas</div>
            </Link>
            <Link href="/siswa?status=Belum+Bayar" className="rounded-lg bg-error-50 p-3">
              <div className="font-mono text-[20px] font-bold text-error-600">{counts.belumBayar}</div>
              <div className="text-[11.5px] text-error-600">Belum Bayar</div>
            </Link>
          </div>
          <h2 className="mb-3 text-[14px] font-bold text-gray-900">Pengeluaran per Kategori</h2>
          {expenseCats.length === 0 ? (
            <p className="text-[13px] text-gray-500">Belum ada pengeluaran.</p>
          ) : (
            expenseCats.slice(0, 6).map((c) => <Bar key={c.name} label={c.name} value={c.amount} max={expenseCats[0]!.amount} tone="bg-error-500" />)
          )}
        </div>
      </div>

      <div className={`${card} p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-gray-900">Transaksi Terakhir</h2>
          <Link href="/buku-kas" className="text-[12.5px] font-semibold text-brand-600">Lihat buku kas →</Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-[13px] text-gray-500">
            Belum ada transaksi. Mulai dari <Link href="/siswa" className="font-semibold text-brand-600">Data Siswa</Link> lalu catat pembayaran.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recent.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{r.description}</div>
                  <div className="text-[12px] text-gray-500">{fdate(isoDate(r.date))} · <span className="font-mono">{r.ref}</span> · {r.category}</div>
                </div>
                <div className={`whitespace-nowrap font-mono font-semibold ${r.income ? 'text-success-700' : 'text-error-600'}`}>
                  {r.income ? `+${rp(r.income)}` : `−${rp(r.expense)}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
