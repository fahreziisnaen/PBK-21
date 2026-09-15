import Link from 'next/link';
import type { SchoolClass } from '@prisma/client';
import { PageHead } from '@/components/shell/PageHead';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { deleteClass, saveClass } from '@/lib/actions/master';
import { btnGhost, input, label, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

function ClassFields({ row }: { row?: SchoolClass }) {
  return (
    <>
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="name">Nama Kelas</label>
          <input id="name" name="name" required maxLength={20} defaultValue={row?.name} className={`${input} uppercase`} placeholder="mis. X-1" />
        </div>
        <div>
          <label className={label} htmlFor="grade">Tingkat</label>
          <select id="grade" name="grade" required defaultValue={row?.grade ?? 'X'} className={input}>
            <option value="X">X</option>
            <option value="XI">XI</option>
            <option value="XII">XII</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="homeroomTeacher">Wali Kelas</label>
        <input id="homeroomTeacher" name="homeroomTeacher" defaultValue={row?.homeroomTeacher ?? ''} className={input} placeholder="Opsional" />
      </div>
      {row && (
        <p className="text-[12px] text-gray-500">Mengganti nama atau tingkat kelas ikut memperbarui semua siswa di kelas ini.</p>
      )}
    </>
  );
}

export default async function KelasPage() {
  const user = await requireUser();
  const writer = canWrite(user.role);

  const [classes, counts] = await Promise.all([
    prisma.schoolClass.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] }),
    prisma.student.groupBy({ by: ['className'], _count: true }),
  ]);
  const studentsIn = new Map(counts.map((c) => [c.className, c._count]));
  const sorted = [...classes].sort(
    (a, b) => ['X', 'XI', 'XII'].indexOf(a.grade) - ['X', 'XI', 'XII'].indexOf(b.grade) || a.name.localeCompare(b.name, 'id', { numeric: true }),
  );

  return (
    <>
      <PageHead
        pathname="/master/kelas"
        actions={
          writer && (
            <FormModal trigger="+ Tambah Kelas" title="Tambah Kelas" action={saveClass}>
              <ClassFields />
            </FormModal>
          )
        }
      />

      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Kelas</th>
              <th className={th}>Tingkat</th>
              <th className={th}>Wali Kelas</th>
              <th className={thNum}>Siswa</th>
              {writer && <th className={th}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td className={`${td} py-10 text-center text-gray-500`} colSpan={5}>
                  Belum ada kelas. Tambahkan kelas di sini, atau kelas akan dibuat otomatis saat mengimpor siswa dari Excel.
                </td>
              </tr>
            )}
            {sorted.map((c) => {
              const students = studentsIn.get(c.name) ?? 0;
              return (
                <tr key={c.id}>
                  <td className={`${td} ${mono} font-semibold text-gray-900`}>{c.name}</td>
                  <td className={td}>{c.grade}</td>
                  <td className={td}>{c.homeroomTeacher ?? '—'}</td>
                  <td className={tdNum}>
                    {students > 0 ? (
                      <Link href={`/rekap`} className="text-brand-600 hover:underline">{students}</Link>
                    ) : (
                      0
                    )}
                  </td>
                  {writer && (
                    <td className={`${td} whitespace-nowrap`}>
                      <FormModal trigger="Edit" triggerClassName={btnGhost} title="Edit Kelas" action={saveClass}>
                        <ClassFields row={c} />
                      </FormModal>
                      {students === 0 && (
                        <ConfirmAction
                          label="Hapus"
                          title="Hapus Kelas"
                          body={`Kelas ${c.name} akan dihapus permanen.`}
                          bullets={['Hanya kelas tanpa siswa yang bisa dihapus.', 'Tindakan ini tidak bisa dibatalkan.']}
                          confirmLabel="Hapus Permanen"
                          run={deleteClass.bind(null, c.id)}
                        />
                      )}
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
