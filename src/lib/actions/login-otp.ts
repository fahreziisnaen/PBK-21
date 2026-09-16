'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { nextGate } from '@/lib/auth-gates';
import type { OtpVerdict } from '@/lib/auth-flow';

export async function submitOtp(_prevState: OtpVerdict | undefined, formData: FormData): Promise<OtpVerdict> {
  const challengeId = formData.get('challengeId');

  try {
    // `redirect: false` — deliberately NOT `redirectTo: '/dashboard'`. When
    // next-auth itself performs the redirect, it renders the destination
    // page (including the (app) layout) inline as part of THIS action's own
    // response; a redirect thrown from deep inside that render (the
    // post-login gate, Task 11) is not honoured there, and the guest is left
    // stuck on /dashboard with the gate silently bypassed. This action
    // therefore navigates nowhere at all: it returns the destination and the
    // client goes there, so the gate is evaluated once, here, on its own.
    await signIn('otp', {
      challengeId,
      code: formData.get('code'),
      remember: formData.get('remember'),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false,
        message:
          error.type === 'CredentialsSignin'
            ? 'Kode salah, sudah kedaluwarsa, atau sudah dipakai.'
            : 'Terjadi kesalahan saat masuk. Coba lagi.',
      };
    }
    throw error; // redirect Next.js dilempar sebagai error — jangan ditelan
  }

  // Not `auth()`: next-auth sets the session cookie through its own response
  // machinery, not through next/headers' cookies(), so a fresh auth() call
  // in this same action invocation reads a request that still predates it
  // and comes back empty. The challenge row already names the user who just
  // signed in and survives being consumed (only `consumedAt` changes), so
  // it is a reliable way to find them without depending on session timing.
  const challenge =
    typeof challengeId === 'string'
      ? await prisma.authChallenge.findUnique({ where: { id: challengeId }, select: { userId: true } })
      : null;
  const gateUser = challenge
    ? await prisma.user.findUnique({
        where: { id: challenge.userId },
        select: { mustChangePassword: true, totpEnabledAt: true, phone: true, role: true },
      })
    : null;

  // Tujuannya dikembalikan, bukan di-redirect dari sini: klien perlu satu
  // momen untuk menampilkan animasi berhasil sebelum berpindah. Gerbang
  // pasca-login tetap ditentukan di server — klien hanya menjalankan hasilnya,
  // tidak boleh memilih tujuannya sendiri.
  return { ok: true, to: (gateUser && nextGate(gateUser)) || '/dashboard' };
}
