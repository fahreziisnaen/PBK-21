/**
 * Fungsi murni seputar tahun pelajaran. Dipisahkan dari berkas Server Action
 * karena berkas `'use server'` hanya boleh mengekspor fungsi async.
 */

/** Nama tahun pelajaran dari tahun mulainya: 2026 → "2026/2027". */
export function academicYearName(startYear: number): string {
  return `${startYear}/${startYear + 1}`;
}

/**
 * Tahun mulai dari namanya. Mengembalikan null bila bentuknya tidak dikenali,
 * supaya nama yang diketik sembarangan tidak diam-diam jadi angka aneh.
 */
export function parseAcademicYear(name: string): number | null {
  const m = name.trim().match(/^(\d{4})\s*\/\s*(\d{4})$/);
  if (!m) return null;
  const start = Number(m[1]);
  // Tahun kedua harus persis setelahnya: "2026/2028" bukan tahun pelajaran.
  if (Number(m[2]) !== start + 1) return null;
  if (start < 2000 || start > 2100) return null;
  return start;
}

/**
 * Tahun pelajaran yang berlaku pada suatu tanggal, dengan asumsi tahun ajaran
 * dimulai bulan Juli. Dipakai untuk menebak tahun pelajaran kegiatan lama yang
 * hanya menyimpan tanggal.
 */
export function academicYearOf(date: Date): number {
  const year = date.getUTCFullYear();
  // Januari–Juni masih tahun pelajaran yang dimulai tahun sebelumnya.
  return date.getUTCMonth() + 1 >= 7 ? year : year - 1;
}

export type Grade = 'X' | 'XI' | 'XII';

/** Tingkat berikutnya; null berarti lulus. */
export function nextGrade(grade: Grade): Grade | null {
  return grade === 'X' ? 'XI' : grade === 'XI' ? 'XII' : null;
}
