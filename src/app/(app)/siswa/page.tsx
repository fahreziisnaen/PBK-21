import Link from 'next/link';
import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { FilterBar } from '@/components/ui/FilterBar';
import { Pagination, pageFrom, sliceFor } from '@/components/ui/Pagination';
import { BulkSelect } from '@/components/ui/BulkSelect';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { PaymentFormModal } from '@/components/finance/PaymentFormModal';
import { StudentPicker } from '@/components/finance/StudentPicker';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { getActiveActivity } from '@/lib/activity-context';
import { prisma } from '@/lib/prisma';
import { participantRows, todayIso } from '@/lib/finance';
import {
  enrollStudents,
  removeParticipant,
  removeParticipants,
  updateBillingBulk,
  updateParticipantBilling,
} from '@/lib/actions/students';
import { rp } from '@/lib/format';
import { btnGhost, btnSecondary, input, label, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

type Search = { q?: string; grade?: string; status?: string; kelas?: string; page?: string };

/**
 * Data Peserta: siapa yang ikut kegiatan yang sedang dipilih, berapa
 * tagihannya, dan sudah membayar berapa.
 *
 * Halaman ini tidak membuat atau mengubah data siswa sama sekali. Siswa
 * ditambah, diimpor, dan disunting di Master Data › Data Siswa; di sini
 * mereka hanya diambil dari sana lewat Daftarkan Siswa. Satu-satunya data yang
 * diubah di sini adalah milik peserta itu sendiri: tagihan dan keikutsertaan.
 */
export default async function DataPesertaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const writer = canWrite(user.role);
  const activity = await getActiveActivity();
  if (!activity) {
    return (
      <>
        <PageHead pathname="/siswa" />
        <NoActivity />
      </>
    );
  }
  const archived = activity.status === 'ARSIP';
  const editable = writer && !archived;
  const { q = '', grade = '', status = '', kelas = '', page: pageParam } = await searchParams;
  const page = pageFrom(pageParam);

  const [all, classes, unenrolled, activeStudents] = await Promise.all([
    participantRows(activity.id),
    prisma.schoolClass.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] }),
    prisma.student.findMany({
      where: { status: 'AKTIF', participations: { none: { activityId: activity.id } } },
      orderBy: [{ grade: 'asc' }, { className: 'asc' }, { name: 'asc' }],
    }),
    prisma.student.count({ where: { status: 'AKTIF' } }),
  ]);
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      (!needle || r.name.toLowerCase().includes(needle) || r.nis.toLowerCase().includes(needle)) &&
      (!grade || r.grade === grade) &&
      // '-' menyaring peserta yang belum punya kelas.
      (!kelas || (kelas === '-' ? !r.className : r.className === kelas)) &&
      (!status || r.status === status),
  );

  // Ringkasan sengaja dihitung dari `all`, bukan dari baris satu halaman:
  // "Total Tagihan" yang berubah saat berpindah halaman akan menyesatkan.
  const paged = sliceFor(rows, page);
  const totalBilling = all.reduce((s, r) => s + r.billing, 0);
  const totalPaid = all.reduce((s, r) => s + r.paid, 0);
  const lunas = all.filter((r) => r.status === 'Lunas').length;

  const head = (
    <>
      <PageHead
        pathname="/siswa"
        activity={activity}
        actions={
          editable && (
            <>
              <FormModal trigger="Ubah Tagihan Massal" triggerClassName={btnSecondary} title="Ubah Tagihan Banyak Siswa" submitLabel="Ubah Tagihan" action={updateBillingBulk}>
                <p className="text-[12.5px] text-gray-600">
                  Mengubah nominal tagihan sekaligus untuk banyak peserta di <b>{activity.name}</b>. Pembayaran yang
                  sudah tercatat tidak berubah — hanya tagihannya, sehingga status pelunasan ikut dihitung ulang.
                </p>
                <div>
                  <label className={label} htmlFor="scope">Berlaku untuk</label>
                  <select id="scope" name="scope" className={input} defaultValue="all">
                    <option value="all">Seluruh peserta kegiatan ini</option>
                    <option value="grade:X">Tingkat X</option>
                    <option value="grade:XI">Tingkat XI</option>
                    <option value="grade:XII">Tingkat XII</option>
                    {classes.map((c) => (
                      <option key={c.id} value={`class:${c.name}`}>Kelas {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="amount">Tagihan Baru (Rp)</label>
                  <input id="amount" name="amount" inputMode="numeric" required defaultValue={activity.contribution} className={`${input} font-mono`} />
                </div>
              </FormModal>
              <FormModal trigger="+ Daftarkan Siswa" title="Daftarkan Siswa ke Kegiatan" submitLabel="Daftarkan Terpilih" action={enrollStudents} wide>
                {activeStudents === 0 ? (
                  // Dibedakan dari "semua sudah terdaftar": di sini tidak ada
                  // yang bisa dipilih karena data siswanya memang belum ada, dan
                  // pengguna perlu tahu ke mana harus mengisinya.
                  <p className="text-[12.5px] text-gray-600">
                    Data Siswa masih kosong. Tambahkan atau impor siswa lebih dulu di{' '}
                    <Link href="/master/siswa" className="font-semibold text-brand-700">Master Data › Data Siswa</Link>.
                  </p>
                ) : unenrolled.length === 0 ? (
                  <p className="text-[12.5px] text-gray-600">
                    Semua {activeStudents} siswa aktif sudah terdaftar di <b>{activity.name}</b>.
                  </p>
                ) : (
                  <>
                    <p className="text-[12.5px] text-gray-600">
                      Pilih siswa dari Data Siswa yang ikut <b>{activity.name}</b>. Tagihan awalnya{' '}
                      {rp(activity.contribution)}, bisa diubah per peserta atau lewat Ubah Tagihan Massal. Untuk
                      mendaftarkan satu tingkat sekaligus, saring tingkatnya lalu pilih semua yang tampil.
                    </p>
                    <StudentPicker students={unenrolled} />
                    <p className="text-[11.5px] text-gray-500">
                      Siswa yang dicari belum ada? Tambahkan di{' '}
                      <Link href="/master/siswa" className="font-semibold text-brand-700">Master Data › Data Siswa</Link>.
                    </p>
                  </>
                )}
              </FormModal>
            </>
          )
        }
      />

      <KpiRow>
        <Kpi label="Total Peserta" value={String(all.length)} hint={`${lunas} lunas`} />
        <Kpi label="Total Tagihan" value={rp(totalBilling)} />
        <Kpi label="Total Dibayar" value={rp(totalPaid)} tone="success" />
        <Kpi label="Sisa Tagihan" value={rp(totalBilling - totalPaid)} tone="error" />
      </KpiRow>

      <FilterBar
        classes={classes}
        searchPlaceholder="Cari nama atau NIS…"
        statusOptions={[
          { value: '', label: 'Semua status' },
          { value: 'Lunas', label: 'Lunas' },
          { value: 'Belum Lunas', label: 'Belum Lunas' },
          { value: 'Belum Bayar', label: 'Belum Bayar' },
        ]}
      />
    </>
  );

  const tabel = (
    <>
      <div className={tableWrap}>
        <table data-stack className={`${table} min-w-[900px]`}>
          <thead>
            <tr>
              {editable && <th className={`${th} w-10`}><span className="sr-only">Pilih</span></th>}
              <th className={th}>NIS</th>
              <th className={th}>Nama Siswa</th>
              <th className={th}>Kelas</th>
              <th className={thNum}>Tagihan</th>
              <th className={thNum}>Dibayar</th>
              <th className={thNum}>Sisa</th>
              <th className={th}>Status</th>
              {editable && <th className={th}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td className={`${td} py-10 text-center text-gray-500`} colSpan={editable ? 9 : 8}>
                  {all.length === 0
                    ? 'Belum ada peserta. Klik Daftarkan Siswa untuk memilih siswa dari Data Siswa.'
                    : 'Tidak ada peserta yang cocok dengan filter.'}
                </td>
              </tr>
            )}
            {paged.map((r) => (
              <tr key={r.id}>
                {editable && (
                  <td data-label="" className={td}>
                    <input
                      type="checkbox"
                      name="ids"
                      value={r.id}
                      aria-label={`Pilih ${r.name}`}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>
                )}
                <td data-label="NIS" className={`${td} ${mono}`}>{r.nis}</td>
                <td data-label="Nama Siswa" className={td}>
                  <Link href={`/siswa/${r.studentId}`} className="font-semibold text-gray-900 hover:text-brand-800">{r.name}</Link>
                </td>
                <td data-label="Kelas" className={td}>{r.className ?? r.grade}</td>
                <td data-label="Tagihan" className={tdNum}>{rp(r.billing)}</td>
                <td data-label="Dibayar" className={tdNum}>{rp(r.paid)}</td>
                <td data-label="Sisa" className={tdNum}>{rp(Math.max(r.remaining, 0))}</td>
                <td data-label="Status" className={td}><Badge status={r.status} /></td>
                {editable && (
                  <td data-label="Aksi" className={`${td} whitespace-nowrap`}>
                    <div className="flex flex-wrap items-center gap-1">
                      {r.remaining > 0 && (
                        <PaymentFormModal
                          trigger="Bayar"
                          triggerClassName={btnGhost}
                          participants={[r]}
                          defaultParticipantId={r.id}
                          today={todayIso()}
                        />
                      )}
                      <FormModal trigger="Ubah Tagihan" triggerClassName={btnGhost} title="Ubah Tagihan Peserta" action={updateParticipantBilling}>
                        <input type="hidden" name="participantId" value={r.id} />
                        <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-[13px]">
                          <div className="font-semibold text-gray-900">{r.name}</div>
                          <div className="text-gray-500">
                            <span className={mono}>{r.nis}</span> · {r.className ?? `Tingkat ${r.grade}`}
                          </div>
                        </div>
                        <div>
                          <label className={label} htmlFor={`billing-${r.id}`}>Tagihan (Rp)</label>
                          <input
                            id={`billing-${r.id}`}
                            name="billing"
                            inputMode="numeric"
                            required
                            defaultValue={r.billing}
                            className={`${input} font-mono`}
                          />
                        </div>
                        <p className="text-[11.5px] text-gray-500">
                          Nama, kelas, atau telepon salah? Ubah di{' '}
                          <Link href={`/master/siswa?q=${encodeURIComponent(r.nis)}`} className="font-semibold text-brand-700">
                            Master Data › Data Siswa
                          </Link>
                          .
                        </p>
                      </FormModal>
                      {r.paymentCount === 0 && (
                        <ConfirmAction
                          label="Keluarkan"
                          title="Keluarkan dari Kegiatan"
                          body={`${r.name} akan dikeluarkan dari ${activity.name}.`}
                          bullets={['Data siswa tetap tersimpan dan bisa didaftarkan lagi.', 'Hanya bisa dilakukan selama belum ada pembayaran, termasuk yang sudah dibatalkan.']}
                          confirmLabel="Keluarkan"
                          run={removeParticipant.bind(null, r.id)}
                        />
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={rows.length} label="peserta" params={{ q, grade, kelas, status }} />
    </>
  );

  return (
    <>
      {head}
      {editable ? (
        <BulkSelect
          action={removeParticipants}
          actionLabel="Keluarkan Terpilih"
          confirmTitle="Keluarkan dari Kegiatan"
          confirmBody={`{n} siswa terpilih akan dikeluarkan dari ${activity.name}.`}
          confirmBullets={[
            'Data siswa tetap tersimpan dan bisa didaftarkan lagi.',
            'Siswa yang sudah punya kuitansi akan dilewati, termasuk kuitansi yang dibatalkan.',
          ]}
          noun="siswa"
          total={paged.length}
        >
          {tabel}
        </BulkSelect>
      ) : (
        tabel
      )}
    </>
  );
}
