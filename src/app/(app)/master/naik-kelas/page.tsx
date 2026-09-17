import Link from 'next/link';
import { PageHead } from '@/components/shell/PageHead';
import { SaveForm } from '@/components/ui/SaveForm';
import { StayBackPicker } from '@/components/finance/StayBackPicker';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { promoteStudents } from '@/lib/actions/promotion';
import { academicYearName, nextGrade, type Grade } from '@/lib/academic-year';
import { card, input, label, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

export default async function NaikKelasPage() {
  const user = await requireUser();
  const writer = canWrite(user.role);

  const [current, classes, students] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isActive: true } }),
    prisma.schoolClass.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] }),
    prisma.student.findMany({
      where: { status: 'AKTIF' },
      orderBy: [{ grade: 'asc' }, { className: 'asc' }, { name: 'asc' }],
      select: { id: true, nis: true, name: true, grade: true, className: true },
    }),
  ]);

  if (!writer) {
    return (
      <>
        <PageHead pathname="/master/naik-kelas" />
        <div className={`${card} p-10 text-center text-[13px] text-gray-600`}>
          Hanya bendahara dan administrator yang dapat menjalankan naik kelas.
        </div>
      </>
    );
  }

  if (!current) {
    return (
      <>
        <PageHead pathname="/master/naik-kelas" />
        <div className={`${card} p-10 text-center`}>
          <div className="text-[15px] font-bold text-gray-900">Belum ada tahun pelajaran berjalan</div>
          <p className="mt-1 text-[13px] text-gray-500">
            Naik kelas menutup satu tahun pelajaran dan membuka berikutnya, jadi tahun berjalannya harus ada lebih
            dulu.{' '}
            <Link href="/master/tahun-pelajaran" className="font-semibold text-brand-700">
              Tetapkan di Master Data › Tahun Pelajaran
            </Link>
            .
          </p>
        </div>
      </>
    );
  }

  // Kelas yang benar-benar dipakai siswa aktif — itulah yang perlu dipetakan.
  const perClass = new Map<string, { grade: Grade; count: number }>();
  let tanpaKelas = 0;
  for (const s of students) {
    if (!s.className) {
      tanpaKelas += 1;
      continue;
    }
    const entry = perClass.get(s.className) ?? { grade: s.grade as Grade, count: 0 };
    entry.count += 1;
    perClass.set(s.className, entry);
  }
  const sources = [...perClass.entries()].sort(
    (a, b) =>
      ['X', 'XI', 'XII'].indexOf(a[1].grade) - ['X', 'XI', 'XII'].indexOf(b[1].grade) ||
      a[0].localeCompare(b[0], 'id', { numeric: true }),
  );

  const lulus = students.filter((s) => s.grade === 'XII').length;
  const nextYear = academicYearName(current.startYear + 1);

  return (
    <>
      <PageHead pathname="/master/naik-kelas" />

      <div className={`${card} mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 p-5`}>
        <div>
          <div className="text-[12px] font-semibold text-gray-500">TAHUN BERJALAN</div>
          <div className={`mt-0.5 ${mono} text-[20px] font-bold text-gray-900`}>{current.name}</div>
        </div>
        <div className="text-[22px] text-gray-300">→</div>
        <div>
          <div className="text-[12px] font-semibold text-gray-500">SETELAH NAIK KELAS</div>
          <div className={`mt-0.5 ${mono} text-[20px] font-bold text-brand-700`}>{nextYear}</div>
        </div>
        <div className="ml-auto text-[12.5px] text-ink-soft">
          {students.length} siswa aktif · {lulus} akan lulus
          {tanpaKelas > 0 && ` · ${tanpaKelas} belum punya kelas`}
        </div>
      </div>

      <SaveForm action={promoteStudents} submitLabel="Jalankan Naik Kelas">
        <div>
          <h2 className="mb-1 text-[15px] font-bold text-gray-900">1. Kelas tujuan</h2>
          <p className="mb-3 text-[12.5px] text-ink-soft">
            Tentukan siswa tiap kelas akan pindah ke kelas mana. Dibiarkan kosong berarti siswanya tetap naik tingkat
            tetapi belum punya kelas — mereka bisa ditemukan lewat filter “Tanpa kelas” di Master Data › Data Siswa.
          </p>
          <div className={tableWrap}>
            <table className={`${table} min-w-[640px]`}>
              <thead>
                <tr>
                  <th className={th}>Kelas Sekarang</th>
                  <th className={th}>Tingkat</th>
                  <th className={thNum}>Siswa</th>
                  <th className={th}>Kelas Tujuan</th>
                </tr>
              </thead>
              <tbody>
                {sources.length === 0 && (
                  <tr>
                    <td className={`${td} py-8 text-center text-gray-500`} colSpan={4}>
                      Belum ada siswa aktif yang punya kelas.
                    </td>
                  </tr>
                )}
                {sources.map(([name, { grade, count }]) => {
                  const next = nextGrade(grade);
                  return (
                    <tr key={name}>
                      <td className={`${td} ${mono} font-semibold text-gray-900`}>{name}</td>
                      <td className={td}>{grade}</td>
                      <td className={tdNum}>{count}</td>
                      <td className={td}>
                        {next === null ? (
                          <span className="rounded-full bg-success-50 px-2.5 py-1 text-[11.5px] font-semibold text-success-700">
                            Lulus — jadi alumni
                          </span>
                        ) : (
                          <select name={`tujuan:${name}`} defaultValue="" className={`${input} max-w-[240px]`} aria-label={`Kelas tujuan untuk ${name}`}>
                            <option value="">— Belum ditentukan —</option>
                            {classes
                              .filter((c) => c.grade === next)
                              .map((c) => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-1 text-[15px] font-bold text-gray-900">2. Siswa yang tinggal kelas</h2>
          <p className="mb-3 text-[12.5px] text-ink-soft">
            Cari lalu centang siswa yang <b>tidak</b> naik. Tingkat dan kelasnya dibiarkan apa adanya. Kosongkan bila
            semua naik.
          </p>
          <StayBackPicker students={students} />
        </div>

        <div className="rounded-card border border-warn-200 bg-warn-50 p-4">
          <h2 className="text-[14px] font-bold text-warn-700">3. Konfirmasi</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] text-warn-700">
            <li>Tingkat seluruh siswa aktif naik satu tingkat, kecuali yang dicentang tinggal kelas.</li>
            <li>Siswa kelas XII ditandai lulus. Data dan riwayat pembayarannya tetap tersimpan.</li>
            <li>Tahun pelajaran berjalan berpindah ke {nextYear}.</li>
            <li>Tindakan ini menulis ke seluruh data siswa sekaligus dan tidak bisa dibatalkan otomatis.</li>
          </ul>
          <div className="mt-3 max-w-[280px]">
            <label className={label} htmlFor="confirm">Ketik NAIK KELAS untuk mengonfirmasi</label>
            <input id="confirm" name="confirm" required autoComplete="off" placeholder="NAIK KELAS" className={`${input} font-mono`} />
          </div>
        </div>
      </SaveForm>

      <p className="mt-4 text-[12.5px] text-gray-500">
        Disarankan mengunduh backup lebih dulu di{' '}
        <Link href="/pemeliharaan" className="font-semibold text-brand-700">Administrasi › Backup &amp; Reset</Link>.
      </p>
    </>
  );
}
