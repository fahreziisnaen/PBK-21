'use client';

import { useState } from 'react';
import { StudentFilterFields, useStudentFilter } from '@/components/finance/StudentFilter';
import { StudentLine, type PickableStudent } from '@/components/finance/StudentPicker';

/**
 * Pemilih siswa yang tinggal kelas pada halaman Naik Kelas.
 *
 * Berbeda dari pemilih pendaftaran peserta, centang di sini TIDAK dilepas saat
 * penyaring berganti: siswa yang tinggal kelas biasanya sedikit dan tersebar,
 * jadi alurnya mencari satu nama, mencentang, lalu mencari nama berikutnya.
 * Supaya tidak ada pilihan yang tersembunyi, semua yang dicentang selalu
 * tampil di daftar "Tinggal kelas" di atas, dan bisa dilepas dari sana.
 */
export function StayBackPicker({ students }: { students: PickableStudent[] }) {
  const filter = useStudentFilter(students);
  const { visible } = filter;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const chosen = students.filter((s) => checked.has(s.id));

  function toggle(id: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {chosen.map((s) => (
        <input key={s.id} type="hidden" name="tinggal" value={s.id} />
      ))}

      <div className="max-w-[720px]">
        <StudentFilterFields filter={filter} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[12.5px]" aria-live="polite">
        {chosen.length === 0 ? (
          <span className="text-ink-soft">Belum ada yang dicentang — semua siswa aktif akan naik.</span>
        ) : (
          <>
            <div className="mb-1.5 font-semibold text-gray-900">Tinggal kelas ({chosen.length})</div>
            <ul className="flex flex-wrap gap-1.5">
              {chosen.map((s) => (
                <li key={s.id} className="flex items-center gap-1 rounded-full border border-gray-300 bg-white py-0.5 pl-2.5 pr-1">
                  <span className="max-w-[200px] truncate">{s.name}</span>
                  <span className="text-gray-500">· {s.className ?? s.grade}</span>
                  <button
                    type="button"
                    onClick={() => toggle(s.id, false)}
                    aria-label={`Batalkan tinggal kelas ${s.name}`}
                    className="grid h-6 w-6 place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="text-[12px] text-ink-soft">
        {visible.length} dari {students.length} siswa aktif tampil
      </div>
      <div className="max-h-[320px] overflow-y-auto rounded-card border border-gray-200 max-[520px]:max-h-[50vh]">
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
              checked={checked.has(s.id)}
              onChange={(e) => toggle(s.id, e.target.checked)}
              className="h-4 w-4 flex-none rounded border-gray-300"
            />
            <StudentLine student={s} />
          </label>
        ))}
      </div>
    </div>
  );
}
