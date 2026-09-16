import Link from 'next/link';
import type { SchoolClass } from '@prisma/client';
import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { FilterBar } from '@/components/ui/FilterBar';
import { BulkSelect } from '@/components/ui/BulkSelect';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { PaymentFormModal } from '@/components/finance/PaymentFormModal';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { getActiveActivity } from '@/lib/activity-context';
import { prisma } from '@/lib/prisma';
import { participantRows, todayIso } from '@/lib/finance';
import { addStudent, enrollGrade, enrollStudents, importStudents, removeParticipant, removeParticipants, updateBillingBulk, updateParticipant } from '@/lib/actions/students';
import { formatPhoneLocal } from '@/lib/phone';
import { rp } from '@/lib/format';
import { btnGhost, btnSecondary, input, label, mono, table, tableWrap, td, tdNum, textarea, th, thNum } from '@/lib/ui';

type Search = { q?: string; grade?: string; status?: string; kelas?: string };

function StudentFields({ contribution, classes, row }: { contribution: number; classes: SchoolClass[]; row?: Awaited<ReturnType<typeof participantRows>>[number] }) {
  return (
    <>
      {row && <input type="hidden" name="participantId" value={row.id} />}
      <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
        <div>
          <label className={label} htmlFor="nis">NIS</label>
          <input id="nis" name="nis" required={!row} disabled={!!row} defaultValue={row?.nis} className={`${input} font-mono`} />
        </div>
        <div>
          <label className={label} htmlFor="name">Nama Siswa</label>
          <input id="name" name="name" required defaultValue={row?.name} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="grade">Tingkat <span className="font-normal text-gray-400">(mengikuti kelas bila dipilih)</span></label>
          <select id="grade" name="grade" required defaultValue={row?.grade ?? 'X'} className={input}>
            <option value="X">X</option>
            <option value="XI">XI</option>
            <option value="XII">XII</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="className">Kelas</label>
          <select id="className" name="className" defaultValue={row?.className ?? ''} className={input}>
            <option value="">— Tanpa kelas —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.name}>{c.name} (tingkat {c.grade})</option>
            ))}
          </select>
          {classes.length === 0 && (
            <p className="mt-1 text-[11.5px] text-gray-500">
              Belum ada kelas. <a href="/master/kelas" className="font-semibold text-brand-700">Tambah di Master Data › Kelas</a>
            </p>
          )}
        </div>
        <div>
          <label className={label} htmlFor="phone">Telepon Orang Tua</label>
          <input id="phone" name="phone" inputMode="tel" defaultValue={row?.phone ? formatPhoneLocal(row.phone) : ''} placeholder="081234567890" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="billing">Tagihan (Rp)</label>
          <input id="billing" name="billing" inputMode="numeric" defaultValue={row?.billing ?? contribution} className={`${input} font-mono`} />
        </div>
      </div>
    </>
  );
}

export default async function SiswaPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  const { q = '', grade = '', status = '', kelas = '' } = await searchParams;

  const [all, classes, unenrolled] = await Promise.all([
    participantRows(activity.id),
    prisma.schoolClass.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] }),
    prisma.student.findMany({
      where: { status: 'AKTIF', participations: { none: { activityId: activity.id } } },
      orderBy: [{ grade: 'asc' }, { className: 'asc' }, { name: 'asc' }],
    }),
  ]);
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      (!needle || r.name.toLowerCase().includes(needle) || r.nis.includes(needle)) &&
      (!grade || r.grade === grade) &&
      // '-' menyaring peserta yang belum punya kelas.
      (!kelas || (kelas === '-' ? !r.className : r.className === kelas)) &&
      (!status || r.status === status),
  );

  const totalBilling = all.reduce((s, r) => s + r.billing, 0);
  const totalPaid = all.reduce((s, r) => s + r.paid, 0);
  const lunas = all.filter((r) => r.status === 'Lunas').length;

  const head = (
    <>
      <PageHead
        pathname="/siswa"
        activity={activity}
        actions={
          writer &&
          !archived && (
            <>
              <FormModal trigger="Import Excel" triggerClassName={btnSecondary} title="Import Siswa dari Excel" submitLabel="Import" action={importStudents} wide>
                <p className="text-[12.5px] text-gray-600">
                  Salin kolom dari Excel lalu tempel di bawah, satu siswa per baris, urutan kolom:{' '}
                  <b>NIS, Nama, Tingkat (X/XI/XII), Kelas, Telepon</b>. Kelas dan telepon boleh kosong. Semua langsung didaftarkan ke{' '}
                  <b>{activity.name}</b> dengan tagihan {rp(activity.contribution)}.
                </p>
                <textarea name="rows" rows={10} className={`${textarea} font-mono text-[12.5px]`} placeholder={'2026001\tAhmad Fauzi\tX\tX-1\t081234567890\n2026002\tBunga Lestari\tX\tX-1'} />
              </FormModal>
              <FormModal trigger="Daftarkan Siswa" triggerClassName={btnSecondary} title="Daftarkan Siswa ke Kegiatan" submitLabel="Daftarkan Terpilih" action={enrollStudents} wide>
                {unenrolled.length === 0 ? (
                  <p className="text-[12.5px] text-gray-600">Semua siswa di data sekolah sudah terdaftar di <b>{activity.name}</b>.</p>
                ) : (
                  <>
                    <p className="text-[12.5px] text-gray-600">
                      Centang siswa yang ikut <b>{activity.name}</b>. Tagihan awalnya {rp(activity.contribution)}, bisa diubah
                      per siswa atau lewat Ubah Tagihan Massal.
                    </p>
                    <div className="max-h-[320px] overflow-y-auto rounded-lg border border-gray-200">
                      {unenrolled.map((s) => (
                        <label key={s.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 text-[13px] last:border-0 hover:bg-gray-50">
                          <input type="checkbox" name="studentIds" value={s.id} className="h-4 w-4 flex-none rounded border-gray-300" />
                          <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">{s.name}</span>
                          <span className="flex-none font-mono text-[12px] text-gray-500">{s.nis}</span>
                          <span className="w-16 flex-none text-right text-[12px] text-gray-500">{s.className ?? s.grade}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </FormModal>
              <FormModal trigger="Daftarkan per Tingkat" triggerClassName={btnSecondary} title="Daftarkan Seluruh Siswa Satu Tingkat" submitLabel="Daftarkan" action={enrollGrade}>
                <p className="text-[12.5px] text-gray-600">
                  Semua siswa di data siswa pada tingkat yang dipilih, yang belum terdaftar, akan ditambahkan ke <b>{activity.name}</b> dengan tagihan {rp(activity.contribution)}.
                </p>
                <div>
                  <label className={label} htmlFor="grade-enroll">Tingkat</label>
                  <select id="grade-enroll" name="grade" className={input}>
                    <option value="X">X</option>
                    <option value="XI">XI</option>
                    <option value="XII">XII</option>
                  </select>
                </div>
              </FormModal>
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
              <FormModal trigger="+ Tambah Siswa" title="Tambah Siswa" action={addStudent} wide>
                <StudentFields contribution={activity.contribution} classes={classes} />
              </FormModal>
            </>
          )
        }
      />

      <KpiRow>
        <Kpi label="Total Siswa" value={String(all.length)} hint={`${lunas} lunas`} />
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
      <div className={tableWrap}>
        <table className={`${table} min-w-[900px]`}>
          <thead>
            <tr>
              {writer && !archived && <th className={`${th} w-10`}><span className="sr-only">Pilih</span></th>}
              <th className={th}>NIS</th>
              <th className={th}>Nama Siswa</th>
              <th className={th}>Kelas</th>
              <th className={thNum}>Tagihan</th>
              <th className={thNum}>Dibayar</th>
              <th className={thNum}>Sisa</th>
              <th className={th}>Status</th>
              {writer && !archived && <th className={th}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className={`${td} py-10 text-center text-gray-500`} colSpan={writer && !archived ? 9 : 8}>
                  {all.length === 0 ? 'Belum ada peserta. Tambah siswa, import dari Excel, atau daftarkan per tingkat.' : 'Tidak ada siswa yang cocok dengan filter.'}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                {writer && !archived && (
                  <td className={td}>
                    <input
                      type="checkbox"
                      name="ids"
                      value={r.id}
                      aria-label={`Pilih ${r.name}`}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>
                )}
                <td className={`${td} ${mono}`}>{r.nis}</td>
                <td className={td}>
                  <Link href={`/siswa/${r.studentId}`} className="font-semibold text-gray-900 hover:text-brand-800">{r.name}</Link>
                </td>
                <td className={td}>{r.className ?? r.grade}</td>
                <td className={tdNum}>{rp(r.billing)}</td>
                <td className={tdNum}>{rp(r.paid)}</td>
                <td className={tdNum}>{rp(Math.max(r.remaining, 0))}</td>
                <td className={td}><Badge status={r.status} /></td>
                {writer && !archived && (
                  <td className={`${td} whitespace-nowrap`}>
                    {r.remaining > 0 && (
                      <PaymentFormModal
                        trigger="Bayar"
                        triggerClassName={btnGhost}
                        participants={[r]}
                        defaultParticipantId={r.id}
                        today={todayIso()}
                      />
                    )}
                    <FormModal trigger="Edit" triggerClassName={btnGhost} title="Edit Siswa" action={updateParticipant} wide>
                      <StudentFields contribution={activity.contribution} classes={classes} row={r} />
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
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );

  return (
    <>
      {head}
      {writer && !archived ? (
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
          total={rows.length}
        >
          {tabel}
        </BulkSelect>
      ) : (
        tabel
      )}
    </>
  );
}
