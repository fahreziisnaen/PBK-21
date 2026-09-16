import Link from 'next/link';
import type { SchoolClass } from '@prisma/client';
import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { Kpi, KpiRow, NoActivity } from '@/components/ui/Kpi';
import { PaymentFormModal } from '@/components/finance/PaymentFormModal';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { getActiveActivity } from '@/lib/activity-context';
import { prisma } from '@/lib/prisma';
import { participantRows, todayIso } from '@/lib/finance';
import { addStudent, enrollGrade, importStudents, removeParticipant, updateBillingBulk, updateParticipant } from '@/lib/actions/students';
import { formatPhoneLocal } from '@/lib/phone';
import { rp } from '@/lib/format';
import { btnGhost, btnSecondary, input, label, mono, table, tableWrap, td, tdNum, textarea, th, thNum } from '@/lib/ui';

type Search = { q?: string; grade?: string; status?: string };

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
              Belum ada kelas. <a href="/master/kelas" className="font-semibold text-brand-600">Tambah di Master Data › Kelas</a>
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
  const { q = '', grade = '', status = '' } = await searchParams;

  const [all, classes] = await Promise.all([
    participantRows(activity.id),
    prisma.schoolClass.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] }),
  ]);
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      (!needle || r.name.toLowerCase().includes(needle) || r.nis.includes(needle)) &&
      (!grade || r.grade === grade) &&
      (!status || r.status === status),
  );

  const totalBilling = all.reduce((s, r) => s + r.billing, 0);
  const totalPaid = all.reduce((s, r) => s + r.paid, 0);
  const lunas = all.filter((r) => r.status === 'Lunas').length;

  return (
    <>
      <PageHead
        pathname="/siswa"
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

      <form className="mb-3 flex flex-wrap gap-2" data-noprint>
        <input name="q" defaultValue={q} placeholder="Cari nama atau NIS…" className={`${input} max-w-[260px]`} />
        <select name="grade" defaultValue={grade} className={`${input} max-w-[140px]`}>
          <option value="">Semua tingkat</option>
          <option value="X">Tingkat X</option>
          <option value="XI">Tingkat XI</option>
          <option value="XII">Tingkat XII</option>
        </select>
        <select name="status" defaultValue={status} className={`${input} max-w-[160px]`}>
          <option value="">Semua status</option>
          <option>Lunas</option>
          <option>Belum Lunas</option>
          <option>Belum Bayar</option>
        </select>
        <button className={btnSecondary}>Terapkan</button>
      </form>

      <div className={tableWrap}>
        <table className={`${table} min-w-[900px]`}>
          <thead>
            <tr>
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
                <td className={`${td} py-10 text-center text-gray-500`} colSpan={8}>
                  {all.length === 0 ? 'Belum ada peserta. Tambah siswa, import dari Excel, atau daftarkan per tingkat.' : 'Tidak ada siswa yang cocok dengan filter.'}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={`${td} ${mono}`}>{r.nis}</td>
                <td className={td}>
                  <Link href={`/siswa/${r.studentId}`} className="font-semibold text-gray-900 hover:text-brand-600">{r.name}</Link>
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
                    {r.paid === 0 && (
                      <ConfirmAction
                        label="Keluarkan"
                        title="Keluarkan dari Kegiatan"
                        body={`${r.name} akan dikeluarkan dari ${activity.name}.`}
                        bullets={['Data siswa tetap tersimpan dan bisa didaftarkan lagi.', 'Hanya bisa dilakukan selama belum ada pembayaran.']}
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
    </>
  );
}
