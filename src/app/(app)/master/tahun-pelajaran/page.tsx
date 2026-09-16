import { PageHead } from '@/components/shell/PageHead';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { backfillActivityYears, saveAcademicYear, setActiveAcademicYear } from '@/lib/actions/academic-year';
import { btnGhost, btnSecondary, card, input, label, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

export default async function TahunPelajaranPage() {
  const user = await requireUser();
  const writer = canWrite(user.role);

  const [years, loose] = await Promise.all([
    prisma.academicYear.findMany({
      orderBy: { startYear: 'desc' },
      include: { _count: { select: { activities: true } } },
    }),
    prisma.activity.count({ where: { academicYearId: null } }),
  ]);
  const active = years.find((y) => y.isActive);

  return (
    <>
      <PageHead
        pathname="/master/tahun-pelajaran"
        actions={
          writer && (
            <>
              {loose > 0 && (
                <ConfirmAction
                  label={`Kaitkan ${loose} Kegiatan Lama`}
                  title="Kaitkan Kegiatan ke Tahun Pelajaran"
                  body={`${loose} kegiatan belum punya tahun pelajaran. Tahun pelajarannya ditentukan dari tanggal mulai kegiatan.`}
                  bullets={[
                    'Tahun ajaran dianggap dimulai bulan Juli.',
                    'Tahun pelajaran yang belum ada akan dibuat.',
                    'Data kegiatannya sendiri tidak diubah.',
                  ]}
                  confirmLabel="Kaitkan Sekarang"
                  run={backfillActivityYears}
                  className={btnSecondary}
                  tone="warn"
                />
              )}
              <FormModal trigger="+ Tambah Tahun" title="Tambah Tahun Pelajaran" action={saveAcademicYear}>
                <div>
                  <label className={label} htmlFor="name">Tahun Pelajaran</label>
                  <input id="name" name="name" required placeholder="2026/2027" className={`${input} font-mono`} />
                  <p className="mt-1 text-[11.5px] text-gray-500">Dua tahun berurutan, dipisah garis miring.</p>
                </div>
              </FormModal>
            </>
          )
        }
      />

      <div className={`${card} mb-4 p-5`}>
        <div className="text-[12px] font-semibold text-gray-500">TAHUN PELAJARAN BERJALAN</div>
        <div className="mt-1 font-mono text-[24px] font-bold text-gray-900">{active?.name ?? '—'}</div>
        <p className="mt-1 text-[12.5px] text-ink-soft">
          {active
            ? 'Kegiatan baru otomatis masuk tahun ini. Tahun berikutnya dibuat sendiri saat naik kelas.'
            : 'Belum ada tahun berjalan. Tambahkan satu, lalu tetapkan sebagai berjalan.'}
        </p>
      </div>

      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Tahun Pelajaran</th>
              <th className={th}>Status</th>
              <th className={thNum}>Kegiatan</th>
              {writer && <th className={th}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {years.length === 0 && (
              <tr>
                <td className={`${td} py-10 text-center text-gray-500`} colSpan={writer ? 4 : 3}>
                  Belum ada tahun pelajaran. Tambahkan tahun yang sedang berjalan sekarang.
                </td>
              </tr>
            )}
            {years.map((y) => (
              <tr key={y.id}>
                <td className={`${td} ${mono} font-semibold text-gray-900`}>{y.name}</td>
                <td className={td}>
                  {y.isActive ? (
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700">
                      Berjalan
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
                <td className={tdNum}>{y._count.activities}</td>
                {writer && (
                  <td className={td}>
                    {!y.isActive && (
                      <ConfirmAction
                        label="Jadikan Berjalan"
                        title="Ganti Tahun Pelajaran Berjalan"
                        body={`Tahun pelajaran berjalan akan diubah menjadi ${y.name}.`}
                        bullets={[
                          'Kegiatan baru akan masuk ke tahun ini.',
                          'Tingkat dan kelas siswa tidak berubah — gunakan Naik Kelas untuk itu.',
                        ]}
                        confirmLabel="Jadikan Berjalan"
                        run={setActiveAcademicYear.bind(null, y.id)}
                        className={btnGhost}
                        tone="warn"
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
