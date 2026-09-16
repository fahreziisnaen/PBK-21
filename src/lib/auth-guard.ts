import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isSessionExpired, isSessionStale, nextGate } from '@/lib/auth-gates';

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
export async function requireUser(
  opts: { allowGated?: boolean } = {},
): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  // A valid cookie is not enough. This check used to live only in the (app)
  // layout, which is not a security boundary: a Server Action never renders
  // a layout, so changePassword and confirmEnrollment stayed callable from a
  // session that a password reset was supposed to kill — an attacker holding
  // a stolen session could re-enrol their own TOTP after the owner locked
  // them out. It belongs here, at the one door every authenticated path
  // already goes through.
  //
  // isActive is re-read for the same reason: deactivating a user must end
  // their session, not merely block their next login.
  const fresh = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      passwordChangedAt: true,
      isActive: true,
      mustChangePassword: true,
      totpEnabledAt: true,
      phone: true,
      role: true,
    },
  });
  if (!fresh || !fresh.isActive) {
    // `ended`, not `reset`: the proxy clears the cookie for either, which is
    // what breaks the redirect loop, but the login page words them
    // differently. Telling a deactivated user "sandi Anda berhasil
    // diperbarui" and then refusing their login would be a plain lie.
    redirect('/login?ended=1');
  }
  if (isSessionStale(fresh.passwordChangedAt, session.user.passwordStamp)) {
    redirect('/login?reset=1');
  }
  // Ditegakkan di sini, bukan lewat masa berlaku cookie: cookie sesi dibuat
  // next-auth dengan satu nilai tetap untuk semua orang, jadi "Ingat saya"
  // tidak bisa dititipkan padanya. Sama seperti isSessionStale, ini juga harus
  // ada di sini dan bukan di layout — Server Action tidak pernah merender layout.
  if (isSessionExpired(session.user.remember, session.user.loginAt)) {
    redirect('/login?ended=1');
  }

  // The post-login gate, enforced here for the same reason isSessionStale is:
  // a Server Action never renders a layout, so a user still owing a password
  // change or TOTP enrolment could invoke actions directly. Only two actions
  // are gated today and both defend themselves, but every write action the
  // next plan adds would inherit the hole silently — the wrong default to
  // hand forward.
  //
  // `allowGated` is for the callers that SERVE the gate: the (app) layout
  // (which does its own pathname-aware check, so /ganti-sandi can render) and
  // the two actions behind those pages. Without it they would redirect to the
  // page they are already on.
  if (!opts.allowGated) {
    const gate = nextGate({
      mustChangePassword: fresh.mustChangePassword,
      totpEnabledAt: fresh.totpEnabledAt,
      phone: fresh.phone,
      role: fresh.role,
    });
    if (gate) redirect(gate);
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
