import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { requireUser } from '@/lib/auth-guard';
import { isAdmin } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import {
  saveActivityCategory,
  saveExpenseCategory,
  toggleActivityCategory,
  toggleExpenseCategory,
} from '@/lib/actions/master';
import { btnGhost, input, label, mono, table, tableWrap, td, th, thNum, tdNum, textarea } from '@/lib/ui';

type Row = { id: string; code: string; name: string; description: string | null; status: string; used: number };

function Fields({ row }: { row?: Row }) {
  return (
    <>
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <div>
          <label className={label} htmlFor="code">Kode</label>
          <input id="code" name="code" required maxLength={10} defaultValue={row?.code} className={`${input} uppercase`} />
        </div>
        <div>
          <label className={label} htmlFor="name">Nama Kategori</label>
          <input id="name" name="name" required defaultValue={row?.name} className={input} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="description">Deskripsi</label>
        <textarea id="description" name="description" rows={3} defaultValue={row?.description ?? ''} className={textarea} />
      </div>
    </>
  );
}

export async function CategoryPage({ kind }: { kind: 'activity' | 'expense' }) {
  const user = await requireUser();
  const admin = isAdmin(user.role);
  const pathname = kind === 'activity' ? '/master/kategori-kegiatan' : '/master/kategori-pengeluaran';
  const save = kind === 'activity' ? saveActivityCategory : saveExpenseCategory;
  const toggle = kind === 'activity' ? toggleActivityCategory : toggleExpenseCategory;
  const usedLabel = kind === 'activity' ? 'Kegiatan' : 'Transaksi';

  const rows: Row[] =
    kind === 'activity'
      ? (
          await prisma.activityCategory.findMany({
            orderBy: { code: 'asc' },
            include: { _count: { select: { activities: true } } },
          })
        ).map((c) => ({ ...c, used: c._count.activities }))
      : (
          await prisma.expenseCategory.findMany({
            orderBy: { code: 'asc' },
            include: { _count: { select: { expenses: true } } },
          })
        ).map((c) => ({ ...c, used: c._count.expenses }));

  return (
    <>
      <PageHead
        pathname={pathname}
        actions={
          admin && (
            <FormModal trigger="+ Tambah Kategori" title="Tambah Kategori" action={save}>
              <Fields />
            </FormModal>
          )
        }
      />
      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Kode</th>
              <th className={th}>Nama Kategori</th>
              <th className={th}>Deskripsi</th>
              <th className={thNum}>{usedLabel}</th>
              <th className={th}>Status</th>
              {admin && <th className={th}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className={`${td} py-10 text-center text-gray-500`} colSpan={6}>
                  Belum ada kategori.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td className={`${td} ${mono} font-semibold text-gray-900`}>{row.code}</td>
                <td className={`${td} font-semibold text-gray-900`}>{row.name}</td>
                <td className={`${td} text-gray-500`}>{row.description ?? '—'}</td>
                <td className={tdNum}>{row.used}</td>
                <td className={td}><Badge status={row.status} /></td>
                {admin && (
                  <td className={`${td} whitespace-nowrap`}>
                    <FormModal trigger="Edit" triggerClassName={btnGhost} title="Edit Kategori" action={save}>
                      <Fields row={row} />
                    </FormModal>
                    {row.status === 'AKTIF' ? (
                      <ConfirmAction
                        label="Nonaktifkan"
                        title="Nonaktifkan Kategori"
                        body={`Kategori "${row.name}" tidak akan bisa dipilih untuk data baru.`}
                        bullets={[
                          'Data lama yang memakai kategori ini tetap tersimpan dan tetap tampil di laporan.',
                          'Kategori dapat diaktifkan kembali kapan saja.',
                        ]}
                        confirmLabel="Nonaktifkan"
                        tone="warn"
                        run={toggle.bind(null, row.id)}
                      />
                    ) : (
                      <ConfirmAction
                        label="Aktifkan"
                        className={btnGhost}
                        title="Aktifkan Kategori"
                        body={`Kategori "${row.name}" bisa dipilih lagi untuk data baru.`}
                        bullets={[]}
                        confirmLabel="Aktifkan"
                        tone="warn"
                        run={toggle.bind(null, row.id)}
                      />
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
