import Link from 'next/link';
import type { SchoolClass, Student } from '@prisma/client';
import { PageHead } from '@/components/shell/PageHead';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { Kpi, KpiRow } from '@/components/ui/Kpi';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { deleteStudentMaster, saveStudentMaster } from '@/lib/actions/students';
import { formatPhoneLocal } from '@/lib/phone';
import { btnGhost, btnSecondary, input, label, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

type Search = { q?: string; grade?: string; kelas?: string };

function StudentMasterFields({ classes, row }: { classes: SchoolClass[]; row?: Student }) {
  return (
    <>
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
        <div>
          <label className={label} htmlFor="nis">NIS</label>
          <input id="nis" name="nis" required defaultValue={row?.nis} className={`${input} font-mono`} />
        </div>
        <div>
          <label className={label} htmlFor="name">Nama Siswa</label>
          <input id="name" name="name" required defaultValue={row?.name} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="grade">
            Tingkat <span className="font-normal text-gray-400">(mengikuti kelas bila dipilih)</span>
          </label>
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
        </div>
        <div>
          <label className={label} htmlFor="phone">Telepon Orang Tua</label>
          <input
            id="phone"
            name="phone"
            inputMode="tel"
            defaultValue={row?.phone ? formatPhoneLocal(row.phone) : ''}
            placeholder="081234567890"
            className={input}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Data induk seluruh siswa sekolah, lepas dari kegiatan.
 *
 * "Data Siswa" di grup DATA hanya menampilkan peserta kegiatan yang sedang
 * dipilih, sehingga siswa yang belum diikutkan kegiatan apa pun tidak terlihat
 * di mana pun dan tidak bisa dibetulkan datanya. Halaman inilah tempatnya.
 */
export default async function IndukSiswaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const writer = canWrite(user.role);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const grade = sp.grade ?? '';
  const kelas = sp.kelas ?? '';

  const [classes, students, total] = await Promise.all([
    prisma.schoolClass.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] }),
    prisma.student.findMany({
      where: {
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { nis: { contains: q } }] } : {}),
        ...(grade === 'X' || grade === 'XI' || grade === 'XII' ? { grade } : {}),
        // "-" berarti siswa yang belum punya kelas sama sekali — justru yang
        // paling perlu ditemukan, dan tidak mungkin dicari lewat nama kelas.
        ...(kelas === '-' ? { className: null } : kelas ? { className: kelas } : {}),
      },
      include: { _count: { select: { participations: true } } },
      orderBy: [{ grade: 'asc' }, { className: 'asc' }, { name: 'asc' }],
      take: 1000,
    }),
    prisma.student.count(),
  ]);

  const tanpaKelas = await prisma.student.count({ where: { className: null } });

  return (
    <>
      <PageHead
        pathname="/master/siswa"
        actions={
          writer && (
            <FormModal trigger="+ Tambah Siswa" title="Tambah Siswa ke Data Induk" action={saveStudentMaster} wide>
              <StudentMasterFields classes={classes} />
            </FormModal>
          )
        }
      />

      <KpiRow>
        <Kpi label="Total Siswa" value={String(total)} />
        <Kpi label="Tingkat X" value={String(students.filter((s) => s.grade === 'X').length)} hint="pada filter ini" />
        <Kpi label="Tingkat XI" value={String(students.filter((s) => s.grade === 'XI').length)} hint="pada filter ini" />
        <Kpi label="Tanpa Kelas" value={String(tanpaKelas)} tone={tanpaKelas > 0 ? 'error' : undefined} />
      </KpiRow>

      <form className="mb-3 flex flex-wrap gap-2" data-noprint>
        <input name="q" defaultValue={q} placeholder="Cari nama atau NIS…" className={`${input} max-w-[260px]`} />
        <select name="grade" defaultValue={grade} className={`${input} max-w-[185px]`} aria-label="Tingkat">
          <option value="">Semua tingkat</option>
          <option value="X">Tingkat X</option>
          <option value="XI">Tingkat XI</option>
          <option value="XII">Tingkat XII</option>
        </select>
        <select name="kelas" defaultValue={kelas} className={`${input} max-w-[205px]`} aria-label="Kelas">
          <option value="">Semua kelas</option>
          <option value="-">— Tanpa kelas —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <button className={btnSecondary}>Terapkan</button>
        {(q || grade || kelas) && (
          <Link href="/master/siswa" className="self-center text-[12.5px] font-semibold text-brand-700">Reset</Link>
        )}
      </form>

      <div className={tableWrap}>
        <table className={`${table} min-w-[820px]`}>
          <thead>
            <tr>
              <th className={th}>NIS</th>
              <th className={th}>Nama Siswa</th>
              <th className={th}>Tingkat</th>
              <th className={th}>Kelas</th>
              <th className={th}>Telepon Ortu</th>
              <th className={thNum}>Kegiatan</th>
              {writer && <th className={th}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr>
                <td className={`${td} py-10 text-center text-gray-500`} colSpan={writer ? 7 : 6}>
                  {total === 0 ? 'Belum ada siswa. Tambahkan di sini, atau impor dari Excel di Data Siswa.' : 'Tidak ada siswa yang cocok dengan filter.'}
                </td>
              </tr>
            )}
            {students.map((s) => (
              <tr key={s.id}>
                <td className={`${td} ${mono}`}>{s.nis}</td>
                <td className={`${td} font-semibold text-gray-900`}>{s.name}</td>
                <td className={td}>{s.grade}</td>
                <td className={td}>
                  {s.className ?? <span className="text-error-600">— belum ada —</span>}
                </td>
                <td className={td}>{s.phone ? formatPhoneLocal(s.phone) : '—'}</td>
                <td className={tdNum}>{s._count.participations}</td>
                {writer && (
                  <td className={`${td} whitespace-nowrap`}>
                    <FormModal trigger="Edit" triggerClassName={btnGhost} title="Edit Data Siswa" action={saveStudentMaster} wide>
                      <StudentMasterFields classes={classes} row={s} />
                    </FormModal>
                    {s._count.participations === 0 && (
                      <ConfirmAction
                        label="Hapus"
                        title="Hapus dari Data Induk"
                        body={`${s.name} (NIS ${s.nis}) akan dihapus permanen dari data siswa.`}
                        bullets={[
                          'Hanya siswa yang belum pernah ikut kegiatan yang bisa dihapus.',
                          'Tindakan ini tidak bisa dibatalkan.',
                        ]}
                        confirmLabel="Hapus Permanen"
                        run={deleteStudentMaster.bind(null, s.id)}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {students.length >= 1000 && (
        <p className="mt-3 text-[12.5px] text-gray-500">
          Menampilkan 1.000 siswa pertama. Persempit dengan pencarian atau filter kelas.
        </p>
      )}
    </>
  );
}
