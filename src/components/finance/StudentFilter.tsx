'use client';

import { useMemo, useState } from 'react';
import { input } from '@/lib/ui';

export type FilterableStudent = { nis: string; name: string; grade: string; className: string | null };
export type StudentCriteria = { q: string; grade: string; kelas: string };

/** Apakah siswa lolos pencarian (nama atau NIS), tingkat, dan kelas. Kelas "-" berarti belum punya kelas. */
export function matchesStudent(s: FilterableStudent, { q, grade, kelas }: StudentCriteria): boolean {
  const needle = q.trim().toLowerCase();
  return (
    (!needle || s.name.toLowerCase().includes(needle) || s.nis.toLowerCase().includes(needle)) &&
    (!grade || s.grade === grade) &&
    (!kelas || (kelas === '-' ? !s.className : s.className === kelas))
  );
}

/**
 * Keadaan penyaring untuk daftar siswa yang sudah ada di klien. Penyaringnya
 * di klien karena daftarnya ikut terkirim bersama halaman: mengetik langsung
 * menyaring tanpa menunggu server.
 */
export function useStudentFilter<T extends FilterableStudent>(students: T[]) {
  const [criteria, setCriteria] = useState<StudentCriteria>({ q: '', grade: '', kelas: '' });

  const classes = useMemo(() => {
    const names = new Map<string, string>();
    for (const s of students) if (s.className) names.set(s.className, s.grade);
    return [...names.entries()].sort((a, b) => a[0].localeCompare(b[0], 'id', { numeric: true }));
  }, [students]);

  const visible = useMemo(() => students.filter((s) => matchesStudent(s, criteria)), [students, criteria]);

  /**
   * Menghitung penyaring berikutnya. Kelas yang tidak masuk tingkat barunya
   * ikut dilepas — kalau dibiarkan, daftarnya pasti kosong tanpa petunjuk.
   */
  function next(change: Partial<StudentCriteria>): StudentCriteria {
    const merged = { ...criteria, ...change };
    if (change.grade !== undefined && merged.kelas && merged.kelas !== '-') {
      const stillValid = classes.some(([name, g]) => name === merged.kelas && (!merged.grade || g === merged.grade));
      if (!stillValid) merged.kelas = '';
    }
    return merged;
  }

  return { criteria, classes, visible, next, setCriteria };
}

export type StudentFilterState = ReturnType<typeof useStudentFilter>;

/**
 * Kotak cari, tingkat, dan kelas. Tata letaknya mengikuti lebar wadahnya
 * (container query), bukan lebar layar: pemilih yang sama dipakai di modal
 * sempit, modal lebar, dan halaman penuh. Di wadah sempit — termasuk ponsel —
 * kotak cari memenuhi satu baris dan dua pilihan berbagi baris di bawahnya.
 */
export function StudentFilterFields({
  filter,
  onChange,
}: {
  filter: StudentFilterState;
  /** Dipanggil dengan penyaring berikutnya; bawaannya langsung diterapkan. */
  onChange?: (next: StudentCriteria) => void;
}) {
  const { criteria, classes } = filter;
  const apply = (change: Partial<StudentCriteria>) => {
    const next = filter.next(change);
    if (onChange) onChange(next);
    else filter.setCriteria(next);
  };
  const visibleClasses = criteria.grade ? classes.filter(([, g]) => g === criteria.grade) : classes;

  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-[minmax(0,1fr)_150px_170px]">
        <input
          type="search"
          value={criteria.q}
          onChange={(e) => apply({ q: e.target.value })}
          placeholder="Cari nama atau NIS…"
          aria-label="Cari siswa"
          className={`${input} col-span-2 @lg:col-span-1`}
        />
        <select value={criteria.grade} aria-label="Tingkat siswa" className={input} onChange={(e) => apply({ grade: e.target.value })}>
          <option value="">Semua tingkat</option>
          <option value="X">Tingkat X</option>
          <option value="XI">Tingkat XI</option>
          <option value="XII">Tingkat XII</option>
        </select>
        <select value={criteria.kelas} aria-label="Kelas siswa" className={input} onChange={(e) => apply({ kelas: e.target.value })}>
          <option value="">Semua kelas</option>
          <option value="-">— Tanpa kelas —</option>
          {visibleClasses.map(([name]) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
