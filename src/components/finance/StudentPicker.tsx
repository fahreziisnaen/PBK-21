'use client';

import { useState } from 'react';
import { matchesStudent, StudentFilterFields, useStudentFilter } from '@/components/finance/StudentFilter';

export type PickableStudent = { id: string; nis: string; name: string; grade: string; className: string | null };

/**
 * Daftar siswa bercentang dengan pencarian dan penyaring, untuk modal
 * pendaftaran peserta.
 *
 * Yang tersembunyi karena penyaring ikut dilepas centangnya — kalau tidak,
 * pengguna bisa mendaftarkan siswa yang tidak terlihat lagi di layarnya dan
 * tidak tahu sudah memilihnya.
 */
export function StudentPicker({ students }: { students: PickableStudent[] }) {
  const filter = useStudentFilter(students);
  const { visible } = filter;
  const [checked, setChecked] = useState<Set<string>>(new Set());

  return (
    <>
      <StudentFilterFields
        filter={filter}
        onChange={(next) => {
          filter.setCriteria(next);
          const stillVisible = new Set(students.filter((s) => matchesStudent(s, next)).map((s) => s.id));
          setChecked((prev) => new Set([...prev].filter((id) => stillVisible.has(id))));
        }}
      />

      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <button
          type="button"
          onClick={() => setChecked(new Set(visible.map((s) => s.id)))}
          className="font-semibold text-brand-700 hover:text-brand-800"
        >
          Pilih {visible.length} yang tampil
        </button>
        {checked.size > 0 && (
          <button type="button" onClick={() => setChecked(new Set())} className="font-semibold text-ink-soft hover:text-ink">
            Batal pilih
          </button>
        )}
        <span className="ml-auto text-ink-soft">{checked.size} dipilih</span>
      </div>

      <div className="max-h-[320px] overflow-y-auto rounded-lg border border-gray-200 max-[520px]:max-h-[45vh]">
        {visible.length === 0 && (
          <p className="px-3 py-6 text-center text-[12.5px] text-gray-500">Tidak ada siswa yang cocok.</p>
        )}
        {visible.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 text-[13px] last:border-0 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              name="studentIds"
              value={s.id}
              checked={checked.has(s.id)}
              onChange={(e) =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(s.id);
                  else next.delete(s.id);
                  return next;
                })
              }
              className="h-4 w-4 flex-none rounded border-gray-300"
            />
            <StudentLine student={s} />
          </label>
        ))}
      </div>
    </>
  );
}

/**
 * Nama, NIS, dan kelas satu siswa dalam daftar pilihan. NIS dan kelas di
 * bawah nama, bukan sebaris: di layar ponsel tiga kolom sebaris memotong nama
 * tinggal beberapa huruf.
 */
export function StudentLine({
  student,
  aside,
}: {
  student: { nis: string; name: string; grade: string; className: string | null };
  /** Keterangan tambahan di ujung kanan, mis. sisa tagihan. */
  aside?: React.ReactNode;
}) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-gray-900">{student.name}</span>
        <span className="block truncate text-[12px] text-gray-500">
          <span className="font-mono">{student.nis}</span> · {student.className ?? `${student.grade} (tanpa kelas)`}
        </span>
      </span>
      {aside && <span className="flex-none text-right text-[12px] text-gray-600">{aside}</span>}
    </>
  );
}
