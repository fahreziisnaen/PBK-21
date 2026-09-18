import type { Grade, Prisma, SchoolClass, Student, StudentStatus } from '@prisma/client';
import { PageHead } from '@/components/shell/PageHead';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { FilterBar } from '@/components/ui/FilterBar';
import { PAGE_SIZE, Pagination, pageFrom } from '@/components/ui/Pagination';
import { Kpi, KpiRow } from '@/components/ui/Kpi';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { deleteStudentMaster, importStudents, saveStudentMaster } from '@/lib/actions/students';
import { formatPhoneLocal } from '@/lib/phone';
import { btnGhost, btnSecondary, input, label, mono, table, tableWrap, td, tdNum, textarea, th, thNum } from '@/lib/ui';

type Search = { q?: string; grade?: string; kelas?: string; status?: string; page?: string };

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
 * "Data Peserta" di grup DATA hanya menampilkan peserta kegiatan yang sedang
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
  // Bawaannya hanya siswa aktif: alumni menumpuk tiap tahun dan akan menutupi
  // siswa yang sedang bersekolah kalau ikut ditampilkan tanpa diminta.
  const status = sp.status === 'ALUMNI' || sp.status === 'SEMUA' ? sp.status : 'AKTIF';

  const page = pageFrom(sp.page);

  // Penyaringnya seluruhnya bisa dinyatakan di SQL, jadi halamannya diambil
  // dengan skip/take — bukan mengambil seribu baris lalu membuang sebagian
  // besarnya di server, yang justru jadi lambatnya.
  const where: Prisma.StudentWhereInput = {
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { nis: { contains: q } }] } : {}),
    ...(grade === 'X' || grade === 'XI' || grade === 'XII' ? { grade: grade as Grade } : {}),
    // "-" berarti siswa yang belum punya kelas sama sekali — justru yang
    // paling perlu ditemukan, dan tidak mungkin dicari lewat nama kelas.
    ...(kelas === '-' ? { className: null } : kelas ? { className: kelas } : {}),
    ...(status === 'SEMUA' ? {} : { status: status as StudentStatus }),
  };

  const [classes, students, matched, total] = await Promise.all([
    prisma.schoolClass.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] }),
    prisma.student.findMany({
      where,
      include: { _count: { select: { participations: true } } },
      orderBy: [{ grade: 'asc' }, { className: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.student.count({ where }),
    prisma.student.count(),
  ]);

  const [tanpaKelas, alumni] = await Promise.all([
    prisma.student.count({ where: { className: null, status: 'AKTIF' } }),
    prisma.student.count({ where: { status: 'ALUMNI' } }),
  ]);

  return (
    <>
      <PageHead
        pathname="/master/siswa"
        actions={
          writer && (
            <>
              <FormModal trigger="Import Excel" triggerClassName={btnSecondary} title="Import Siswa dari Excel" submitLabel="Import" action={importStudents} wide>
                <p className="text-[12.5px] text-gray-600">
                  Salin kolom dari Excel lalu tempel di bawah, satu siswa per baris, urutan kolom:{' '}
                  <b>NIS, Nama, Tingkat (X/XI/XII), Kelas, Telepon</b>. Kelas dan telepon boleh kosong.
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-gray-500">
                  <li>NIS yang sudah ada diperbarui datanya, tidak digandakan.</li>
                  <li>Kelas yang belum ada di Master Data › Data Kelas dibuat otomatis.</li>
                  <li>Siswa hanya masuk Data Siswa. Untuk mengikutkan ke kegiatan, pakai Daftarkan Siswa di Data Peserta.</li>
                </ul>
                <textarea
                  name="rows"
                  rows={10}
                  aria-label="Data siswa dari Excel"
                  className={`${textarea} font-mono text-[12.5px]`}
                  placeholder={'2026001\tAhmad Fauzi\tX\tX-1\t081234567890\n2026002\tBunga Lestari\tX\tX-1'}
                />
              </FormModal>
              <FormModal trigger="+ Tambah Siswa" title="Tambah Siswa" action={saveStudentMaster} wide>
                <StudentMasterFields classes={classes} />
              </FormModal>
            </>
          )
        }
      />

      <KpiRow>
        <Kpi label="Siswa Aktif" value={String(total - alumni)} hint={`${alumni} alumni`} />
        <Kpi label="Hasil Filter" value={String(matched)} hint="siswa cocok" />
        <Kpi label="Halaman" value={`${page} / ${Math.max(1, Math.ceil(matched / PAGE_SIZE))}`} hint={`${PAGE_SIZE} per halaman`} />
        <Kpi label="Tanpa Kelas" value={String(tanpaKelas)} hint="siswa aktif" tone={tanpaKelas > 0 ? 'error' : undefined} />
      </KpiRow>

      <FilterBar
        classes={classes}
        statusLabel="Status siswa"
        defaultStatus="AKTIF"
        statusOptions={[
          { value: 'AKTIF', label: 'Siswa aktif' },
          { value: 'ALUMNI', label: 'Alumni' },
          { value: 'SEMUA', label: 'Aktif & alumni' },
        ]}
      />

      <div className={tableWrap}>
        <table data-stack className={`${table} min-w-[820px]`}>
          <thead>
            <tr>
              <th className={th}>NIS</th>
              <th className={th}>Nama Siswa</th>
              <th className={th}>Tingkat</th>
              <th className={th}>Kelas</th>
              <th className={th}>Status</th>
              <th className={th}>Telepon Ortu</th>
              <th className={thNum}>Kegiatan</th>
              {writer && <th className={th}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr>
                <td className={`${td} py-10 text-center text-gray-500`} colSpan={writer ? 8 : 7}>
                  {total === 0 ? 'Belum ada siswa. Tambahkan di sini, atau impor dari Excel di Data Peserta.' : 'Tidak ada siswa yang cocok dengan filter.'}
                </td>
              </tr>
            )}
            {students.map((s) => (
              <tr key={s.id}>
                <td data-label="NIS" className={`${td} ${mono}`}>{s.nis}</td>
                <td data-label="Nama Siswa" className={`${td} font-semibold text-gray-900`}>{s.name}</td>
                <td data-label="Tingkat" className={td}>{s.grade}</td>
                <td data-label="Kelas" className={td}>
                  {s.className ?? <span className="text-error-600">— belum ada —</span>}
                </td>
                <td data-label="Status" className={td}>
                  {s.status === 'ALUMNI' ? (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600">
                      Alumni {s.graduatedYear ?? ''}
                    </span>
                  ) : (
                    <span className="text-gray-500">Aktif</span>
                  )}
                </td>
                <td data-label="Telepon Ortu" className={td}>{s.phone ? formatPhoneLocal(s.phone) : '—'}</td>
                <td data-label="Kegiatan" className={tdNum}>{s._count.participations}</td>
                {writer && (
                  <td data-label="Aksi" className={`${td} whitespace-nowrap`}>
                    <div className="flex flex-wrap items-center gap-1">
                      <FormModal trigger="Edit" triggerClassName={btnGhost} title="Edit Data Siswa" action={saveStudentMaster} wide>
                        <StudentMasterFields classes={classes} row={s} />
                      </FormModal>
                      {s._count.participations === 0 && (
                        <ConfirmAction
                          label="Hapus"
                          title="Hapus Siswa"
                          body={`${s.name} (NIS ${s.nis}) akan dihapus permanen dari data siswa.`}
                          bullets={[
                            'Hanya siswa yang belum pernah ikut kegiatan yang bisa dihapus.',
                            'Tindakan ini tidak bisa dibatalkan.',
                          ]}
                          confirmLabel="Hapus Permanen"
                          run={deleteStudentMaster.bind(null, s.id)}
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

      <Pagination
        page={page}
        total={matched}
        label="siswa"
        params={{ q, grade, kelas, status: status === 'AKTIF' ? '' : status }}
      />
    </>
  );
}
