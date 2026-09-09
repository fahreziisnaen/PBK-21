import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';

export type SessionUser = Session['user'];

/**
 * Titik masuk kanonik untuk memastikan ada pengguna yang sudah masuk.
 * `src/proxy.ts` sudah menolak permintaan tanpa sesi untuk seluruh halaman,
 * jadi dalam praktiknya ini jarang menendang siapa pun keluar — nilainya
 * ada saat dipanggil dari tempat yang tidak lewat request halaman biasa
 * (mis. dipanggil ulang dari kode lain), dan sebagai satu tempat baku yang
 * dipakai bersama oleh Server Action penulis-data di Plan 02-04, bukan
 * masing-masing menemukan caranya sendiri.
 *
 * Redirect ke /login bila tidak ada sesi.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  return session.user;
}

/**
 * Seperti requireUser, dan juga memastikan peran pengguna termasuk salah
 * satu dari `roles` — mis. `requireRole('BENDAHARA', 'ADMIN')` pada aksi
 * pencatatan pembayaran, supaya KEPALA_SEKOLAH (peran baca-saja menurut
 * spek §2) tidak pernah bisa menjalankannya walau tahu URL aksinya.
 *
 * Redirect ke /login bila belum masuk, atau ke /dashboard bila perannya
 * tidak termasuk yang diizinkan.
 */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect('/dashboard');
  }
  return user;
}
