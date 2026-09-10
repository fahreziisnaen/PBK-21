'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { nextGate } from '@/lib/auth-gates';

export async function submitOtp(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const challengeId = formData.get('challengeId');

  try {
    // `redirect: false` — deliberately NOT `redirectTo: '/dashboard'`. When
    // next-auth itself performs the redirect, it renders the destination
    // page (including the (app) layout) inline as part of THIS action's own
    // response; a second redirect() thrown from deep inside that render
    // (the post-login gate, Task 11) is not honoured there, and the guest
    // is left stuck on /dashboard with the gate silently bypassed. Doing
    // exactly one redirect, here, at the top of this action — avoids that
    // nested-redirect trap.
    await signIn('otp', {
      challengeId,
      code: formData.get('code'),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return error.type === 'CredentialsSignin'
        ? 'Kode salah, sudah kedaluwarsa, atau sudah dipakai.'
        : 'Terjadi kesalahan saat masuk. Coba lagi.';
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

  // redirect() throws NEXT_REDIRECT to unwind the render — never wrap this
  // in try/catch, or the throw is swallowed and the guest sits on the
  // verification page with no feedback.
  redirect((gateUser && nextGate(gateUser)) || '/dashboard');
}
