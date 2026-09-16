/**
 * Dipisahkan dari berkas Server Action yang memakainya: berkas `'use server'`
 * hanya boleh mengekspor fungsi async, sehingga helper sinkron seperti ini
 * tidak bisa dibagi dari sana.
 */

/** P2002 — pelanggaran batasan unik, mis. NIS atau nama kelas yang sudah ada. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002';
}
