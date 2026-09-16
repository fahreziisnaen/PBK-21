import { redirect } from 'next/navigation';

/**
 * Tahap kode kini dikerjakan di modal pada /login, bukan di halaman terpisah.
 * Route-nya dipertahankan supaya tautan lama, riwayat peramban, dan bookmark
 * tidak mendarat di 404 — halaman masuk sendiri yang memulihkan tahap yang
 * sedang berjalan dari cookie challenge dan membuka modalnya kembali.
 */
export default function VerifikasiPage() {
  redirect('/login');
}
