'use client';

import { useMemo, useState } from 'react';
import { input } from '@/lib/ui';

export type PickableStudent = { id: string; nis: string; name: string; grade: string; className: string | null };

/**
 * Daftar siswa bercentang dengan pencarian dan penyaring, untuk modal
 * pendaftaran peserta.
 *
 * Penyaringnya di klien: siswanya sudah ikut terkirim bersama halaman, jadi
 * mengetik langsung menyaring tanpa menunggu server. Yang tersembunyi karena
 * penyaring ikut dilepas centangnya — kalau tidak, pengguna bisa mendaftarkan
 * siswa yang tidak terlihat lagi di layarnya dan tidak tahu sudah memilihnya.
 */
export function StudentPicker({ students }: { students: PickableStudent[] }) {
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('');
  const [kelas, setKelas] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const classes = useMemo(() => {
    const names = new Map<string, string>();
    for (const s of students) if (s.className) names.set(s.className, s.grade);
    return [...names.entries()].sort((a, b) => a[0].localeCompare(b[0], 'id', { numeric: true }));
  }, [students]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter(
      (s) =>
        (!needle || s.name.toLowerCase().includes(needle) || s.nis.includes(needle)) &&
        (!grade || s.grade === grade) &&
        (!kelas || (kelas === '-' ? !s.className : s.className === kelas)),
    );
  }, [students, q, grade, kelas]);

  function retainVisible(next: { grade?: string; kelas?: string; q?: string }) {
    const g = next.grade ?? grade;
    const k = next.kelas ?? kelas;
    const needle = (next.q ?? q).trim().toLowerCase();
    const stillVisible = new Set(
      students
        .filter(
          (s) =>
            (!needle || s.name.toLowerCase().includes(needle) || s.nis.includes(needle)) &&
            (!g || s.grade === g) &&
            (!k || (k === '-' ? !s.className : s.className === k)),
        )
        .map((s) => s.id),
    );
    setChecked((prev) => new Set([...prev].filter((id) => stillVisible.has(id))));
  }

  const visibleClasses = grade ? classes.filter(([, g]) => g === grade) : classes;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            retainVisible({ q: e.target.value });
          }}
          placeholder="Cari nama atau NIS…"
          aria-label="Cari siswa"
          className={`${input} max-w-[220px]`}
        />
        <select
          value={grade}
          aria-label="Tingkat siswa"
          className={`${input} max-w-[150px]`}
          onChange={(e) => {
            const g = e.target.value;
            const keepKelas = classes.some(([name, cg]) => name === kelas && (!g || cg === g));
            setGrade(g);
            if (!keepKelas) setKelas('');
            retainVisible({ grade: g, kelas: keepKelas ? kelas : '' });
          }}
        >
          <option value="">Semua tingkat</option>
          <option value="X">Tingkat X</option>
          <option value="XI">Tingkat XI</option>
          <option value="XII">Tingkat XII</option>
        </select>
        <select
          value={kelas}
          aria-label="Kelas siswa"
          className={`${input} max-w-[170px]`}
          onChange={(e) => {
            setKelas(e.target.value);
            retainVisible({ kelas: e.target.value });
          }}
        >
          <option value="">Semua kelas</option>
          <option value="-">— Tanpa kelas —</option>
          {visibleClasses.map(([name]) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

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

      <div className="max-h-[320px] overflow-y-auto rounded-lg border border-gray-200">
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
            <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">{s.name}</span>
            <span className="flex-none font-mono text-[12px] text-gray-500">{s.nis}</span>
            <span className="w-16 flex-none text-right text-[12px] text-gray-500">{s.className ?? s.grade}</span>
          </label>
        ))}
      </div>
    </>
  );
}
