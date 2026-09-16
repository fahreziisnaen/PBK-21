import type { Expense, ExpenseCategory, Prisma } from '@prisma/client';
import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { getActiveActivity } from '@/lib/activity-context';
import { activityFinance, isoDate, parseDateInput, todayIso } from '@/lib/finance';
import { cancelExpense, saveExpense } from '@/lib/actions/expenses';
import { prisma } from '@/lib/prisma';
import { fdate, rp } from '@/lib/format';
import { btnGhost, btnSecondary, input, label, mono, table, tableWrap, td, tdNum, textarea, th, thNum } from '@/lib/ui';

type Search = { q?: string; categoryId?: string; status?: string; from?: string; to?: string };

function ExpenseFields({ categories, row, today }: { categories: ExpenseCategory[]; row?: Expense; today: string }) {
  const selectable = categories.filter((c) => c.status === 'AKTIF' || c.id === row?.categoryId);
  return (
    <>
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
        <div>
          <label className={label} htmlFor="categoryId">Kategori</label>
          <select id="categoryId" name="categoryId" required defaultValue={row?.categoryId ?? ''} className={input}>
            <option value="" disabled>Pilih kategori…</option>
            {selectable.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="date">Tanggal</label>
          <input id="date" name="date" type="date" required defaultValue={row ? isoDate(row.date) : today} className={input} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="description">Uraian</label>
        <input id="description" name="description" required defaultValue={row?.description} className={input} placeholder="mis. Sewa bus pariwisata 2 unit" />
      </div>
      <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
        <div>
          <label className={label} htmlFor="amount">Nominal (Rp)</label>
          <input id="amount" name="amount" inputMode="numeric" required defaultValue={row?.amount} className={`${input} font-mono`} />
        </div>
        <div>
          <span className={label}>Metode</span>
          <div className="flex h-10 items-center gap-4 text-[13.5px] text-gray-700">
            <label className="flex items-center gap-2">
              <input type="radio" name="method" value="TUNAI" defaultChecked={!row || row.method === 'TUNAI'} /> Tunai
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="method" value="TRANSFER" defaultChecked={row?.method === 'TRANSFER'} /> Transfer
            </label>
          </div>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="note">Catatan</label>
        <textarea id="note" name="note" rows={2} defaultValue={row?.note ?? ''} className={textarea} placeholder="Opsional, mis. nomor nota" />
      </div>
    </>
  );
}

export default async function PengeluaranPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const activity = await getActiveActivity();
  if (!activity) {
    return (
      <>
        <PageHead pathname="/pengeluaran" />
        <NoActivity />
      </>
    );
  }
  const writable = canWrite(user.role) && activity.status !== 'ARSIP';
  const sp = await searchParams;
  const from = parseDateInput(sp.from ?? null);
  const to = parseDateInput(sp.to ?? null);
  const q = (sp.q ?? '').trim();
  const today = todayIso();

  const where: Prisma.ExpenseWhereInput = {
    activityId: activity.id,
    ...(sp.categoryId ? { categoryId: sp.categoryId } : {}),
    ...(sp.status === 'AKTIF' || sp.status === 'DIBATALKAN' ? { status: sp.status } : {}),
    ...(from || to ? { date: { gte: from ?? undefined, lte: to ?? undefined } } : {}),
    ...(q ? { OR: [{ description: { contains: q, mode: 'insensitive' } }, { refNo: { contains: q, mode: 'insensitive' } }] } : {}),
  };

  const [expenses, categories, finance] = await Promise.all([
    prisma.expense.findMany({ where, include: { category: true }, orderBy: [{ date: 'desc' }, { seq: 'desc' }] }),
    prisma.expenseCategory.findMany({ orderBy: { code: 'asc' } }),
    activityFinance(activity.id),
  ]);
  const byCategory = new Map<string, number>();
  for (const e of expenses) if (e.status === 'AKTIF') byCategory.set(e.category.name, (byCategory.get(e.category.name) ?? 0) + e.amount);
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <PageHead
        pathname="/pengeluaran"
        activity={activity}
        actions={
          writable && (
            <FormModal trigger="+ Tambah Pengeluaran" title="Tambah Pengeluaran" action={saveExpense} wide>
              <ExpenseFields categories={categories} today={today} />
            </FormModal>
          )
        }
      />

      <KpiRow>
        <Kpi label="Total Pengeluaran" value={rp(finance.expense)} tone="error" />
        <Kpi label="Total Pemasukan" value={rp(finance.income)} tone="success" />
        <Kpi label="Saldo Kas" value={rp(finance.balance)} tone="brand" />
        <Kpi label="Kategori Terbesar" value={topCategory ? rp(topCategory[1]) : '—'} hint={topCategory?.[0]} />
      </KpiRow>

      <form className="mb-3 flex flex-wrap gap-2" data-noprint>
        <input name="q" defaultValue={q} placeholder="Cari uraian atau no. ref…" className={`${input} max-w-[260px]`} />
        <select name="categoryId" defaultValue={sp.categoryId ?? ''} className={`${input} max-w-[245px]`}>
          <option value="">Semua kategori</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ''} className={`${input} max-w-[195px]`}>
          <option value="">Semua status</option>
          <option value="AKTIF">Aktif</option>
          <option value="DIBATALKAN">Dibatalkan</option>
        </select>
        <input type="date" name="from" defaultValue={sp.from ?? ''} className={`${input} max-w-[160px]`} aria-label="Dari tanggal" />
        <input type="date" name="to" defaultValue={sp.to ?? ''} className={`${input} max-w-[160px]`} aria-label="Sampai tanggal" />
        <button className={btnSecondary}>Terapkan</button>
      </form>

      <div className={tableWrap}>
        <table className={`${table} min-w-[960px]`}>
          <thead>
            <tr>
              <th className={th}>No. Ref</th>
              <th className={th}>Tanggal</th>
              <th className={th}>Kategori</th>
              <th className={th}>Uraian</th>
              <th className={th}>Metode</th>
              <th className={thNum}>Jumlah</th>
              <th className={th}>Status</th>
              {writable && <th className={th}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr><td className={`${td} py-10 text-center text-gray-500`} colSpan={8}>Belum ada pengeluaran yang cocok.</td></tr>
            )}
            {expenses.map((e) => (
              <tr key={e.id} className={e.status === 'DIBATALKAN' ? 'opacity-60' : ''}>
                <td className={`${td} ${mono} font-semibold`}>{e.refNo}</td>
                <td className={`${td} whitespace-nowrap`}>{fdate(isoDate(e.date))}</td>
                <td className={td}>{e.category.name}</td>
                <td className={td}>
                  <div className="text-gray-900">{e.description}</div>
                  {e.note && <div className="text-[12px] text-gray-500">{e.note}</div>}
                </td>
                <td className={td}>{e.method === 'TUNAI' ? 'Tunai' : 'Transfer'}</td>
                <td className={`${tdNum} ${e.status === 'DIBATALKAN' ? 'line-through' : ''}`}>{rp(e.amount)}</td>
                <td className={td}><Badge status={e.status} /></td>
                {writable && (
                  <td className={`${td} whitespace-nowrap`}>
                    {e.status === 'AKTIF' && (
                      <>
                        <FormModal trigger="Edit" triggerClassName={btnGhost} title="Edit Pengeluaran" action={saveExpense} wide>
                          <ExpenseFields categories={categories} row={e} today={today} />
                        </FormModal>
                        <ConfirmAction
                          label="Batalkan"
                          title="Batalkan Pengeluaran"
                          body={`Pengeluaran ${e.refNo} akan dibatalkan.`}
                          bullets={[
                            'Transaksi tetap tersimpan dalam riwayat dan jejak audit — tidak ada catatan keuangan yang dihapus.',
                            'Nominal tidak lagi dihitung dalam total pengeluaran maupun saldo kas.',
                          ]}
                          confirmLabel="Batalkan Pengeluaran"
                          run={cancelExpense.bind(null, e.id)}
                        />
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
