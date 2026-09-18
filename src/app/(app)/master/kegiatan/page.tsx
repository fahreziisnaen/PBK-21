import type { Activity, ActivityCategory } from '@prisma/client';
import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { requireUser } from '@/lib/auth-guard';
import { canWrite, isAdmin } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { archiveActivity, deleteActivity, saveActivity } from '@/lib/actions/master';
import { activityFinance, isoDate } from '@/lib/finance';
import { fdate, rp } from '@/lib/format';
import { btnGhost, input, label, mono, table, tableWrap, td, tdNum, textarea, th, thNum } from '@/lib/ui';

function ActivityFields({ categories, row }: { categories: ActivityCategory[]; row?: Activity }) {
  const selectable = categories.filter((c) => c.status === 'AKTIF' || c.id === row?.categoryId);
  return (
    <>
      {row && <input type="hidden" name="id" value={row.id} />}
      <div>
        <label className={label} htmlFor="name">Nama Kegiatan</label>
        <input id="name" name="name" required defaultValue={row?.name} className={input} placeholder="mis. Outing Class Kelas X" />
      </div>
      <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
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
          <label className={label} htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={row?.status ?? 'AKTIF'} className={input}>
            <option value="DRAFT">Draft</option>
            <option value="AKTIF">Aktif</option>
            <option value="SELESAI">Selesai</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="startDate">Tanggal Mulai</label>
          <input id="startDate" name="startDate" type="date" required defaultValue={row ? isoDate(row.startDate) : ''} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="endDate">Tanggal Selesai</label>
          <input id="endDate" name="endDate" type="date" required defaultValue={row ? isoDate(row.endDate) : ''} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="location">Lokasi</label>
          <input id="location" name="location" required defaultValue={row?.location} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="chairperson">Ketua Panitia</label>
          <input id="chairperson" name="chairperson" defaultValue={row?.chairperson ?? ''} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="contribution">Kontribusi per Siswa (Rp)</label>
          <input id="contribution" name="contribution" inputMode="numeric" required defaultValue={row?.contribution} className={`${input} font-mono`} placeholder="250000" />
        </div>
        <div>
          <label className={label} htmlFor="participantTarget">Target Peserta</label>
          <input id="participantTarget" name="participantTarget" type="number" min={0} defaultValue={row?.participantTarget ?? 0} className={`${input} font-mono`} />
        </div>
        <div>
          <label className={label} htmlFor="receiptPrefix">Prefix Kuitansi</label>
          <input id="receiptPrefix" name="receiptPrefix" required maxLength={12} defaultValue={row?.receiptPrefix} className={`${input} font-mono uppercase`} placeholder="OC-X" />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="description">Deskripsi</label>
        <textarea id="description" name="description" rows={2} defaultValue={row?.description ?? ''} className={textarea} />
      </div>
    </>
  );
}

export default async function KegiatanPage() {
  const user = await requireUser();
  const writer = canWrite(user.role);
  const admin = isAdmin(user.role);

  const [activities, categories] = await Promise.all([
    prisma.activity.findMany({ include: { category: true, _count: { select: { participants: true, payments: true, expenses: true } } }, orderBy: [{ year: 'desc' }, { startDate: 'desc' }] }),
    prisma.activityCategory.findMany({ orderBy: { code: 'asc' } }),
  ]);
  const finances = await Promise.all(activities.map((a) => activityFinance(a.id)));
  const totalBalance = finances.reduce((s, f) => s + f.balance, 0);

  return (
    <>
      <PageHead
        pathname="/master/kegiatan"
        actions={
          writer && (
            <FormModal trigger="+ Tambah Kegiatan" title="Tambah Kegiatan" action={saveActivity} wide>
              <ActivityFields categories={categories} />
            </FormModal>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-[12px] font-semibold text-gray-500">Total Kegiatan</div>
          <div className="mt-1 font-mono text-[22px] font-bold text-gray-900">{activities.length}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-[12px] font-semibold text-gray-500">Total Saldo Seluruh Kegiatan</div>
          <div className="mt-1 font-mono text-[22px] font-bold text-gray-900">{rp(totalBalance)}</div>
        </div>
      </div>

      <div className={tableWrap}>
        <table data-stack className={`${table} min-w-[960px]`}>
          <thead>
            <tr>
              <th className={th}>Kegiatan</th>
              <th className={th}>Kategori</th>
              <th className={th}>Periode</th>
              <th className={thNum}>Kontribusi</th>
              <th className={thNum}>Peserta</th>
              <th className={thNum}>Saldo</th>
              <th className={th}>Status</th>
              {writer && <th className={th}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {activities.length === 0 && (
              <tr>
                <td className={`${td} py-10 text-center text-gray-500`} colSpan={8}>
                  Belum ada kegiatan. Tambahkan kegiatan pertama untuk mulai mencatat.
                </td>
              </tr>
            )}
            {activities.map((a, i) => {
              const f = finances[i]!;
              return (
                <tr key={a.id}>
                  <td data-label="Kegiatan" className={td}>
                    <div className="font-semibold text-gray-900">{a.name}</div>
                    <div className="text-[12px] text-gray-500">{a.location} · <span className={mono}>{a.receiptPrefix}</span></div>
                  </td>
                  <td data-label="Kategori" className={td}>{a.category.name}</td>
                  <td data-label="Periode" className={`${td} whitespace-nowrap`}>
                    {fdate(isoDate(a.startDate))} – {fdate(isoDate(a.endDate))}
                  </td>
                  <td data-label="Kontribusi" className={tdNum}>{rp(a.contribution)}</td>
                  <td data-label="Peserta" className={tdNum}>{f.participants}{a.participantTarget ? ` / ${a.participantTarget}` : ''}</td>
                  <td data-label="Saldo" className={tdNum}>{rp(f.balance)}</td>
                  <td data-label="Status" className={td}><Badge status={a.status} /></td>
                  {writer && (
                    <td data-label="Aksi" className={`${td} whitespace-nowrap`}>
                      <div className="flex flex-wrap items-center gap-1">
                        {a.status !== 'ARSIP' && (
                          <FormModal trigger="Edit" triggerClassName={btnGhost} title="Edit Kegiatan" action={saveActivity} wide>
                            <ActivityFields categories={categories} row={a} />
                          </FormModal>
                        )}
                        {admin && a.status !== 'ARSIP' && (
                          <ConfirmAction
                            label="Arsipkan"
                            title="Arsipkan Kegiatan"
                            body={`"${a.name}" akan menjadi hanya-baca.`}
                            bullets={[
                              'Transaksi baru untuk kegiatan ini akan ditolak.',
                              'Seluruh riwayat, buku kas, dan laporan tetap bisa dilihat dan dicetak.',
                            ]}
                            confirmLabel="Arsipkan"
                            tone="warn"
                            run={archiveActivity.bind(null, a.id)}
                          />
                        )}
                        {admin && a._count.participants + a._count.payments + a._count.expenses === 0 && (
                          <ConfirmAction
                            label="Hapus"
                            title="Hapus Kegiatan"
                            body={`"${a.name}" akan dihapus permanen.`}
                            bullets={['Hanya kegiatan tanpa peserta dan tanpa transaksi yang bisa dihapus.', 'Tindakan ini tidak bisa dibatalkan.']}
                            confirmLabel="Hapus Permanen"
                            run={deleteActivity.bind(null, a.id)}
                          />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
