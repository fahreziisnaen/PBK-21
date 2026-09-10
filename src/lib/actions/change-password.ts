'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { recordAuthEvent } from '@/lib/auth-event';
import { AUTH_EVENTS } from '@/lib/auth-event-names';
import { nextGate } from '@/lib/auth-gates';

const schema = z
  .object({
    oldPassword: z.string().min(1, 'Sandi lama wajib diisi.'),
    newPassword: z.string().min(8, 'Sandi baru minimal 8 karakter.'),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Konfirmasi sandi baru tidak cocok.',
    path: ['confirmPassword'],
  });

export async function changePassword(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const sessionUser = await requireUser();

  const parsed = schema.safeParse({
    oldPassword: formData.get('oldPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? 'Data tidak valid.';
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });

  // Verified before writing anything — a change-password form is not the
  // place to trust the caller just because they hold a valid session; an
  // unattended, unlocked browser must not be enough to take over the
  // account's second factor path.
  const ok = await bcrypt.compare(parsed.data.oldPassword, user.passwordHash);
  if (!ok) return 'Sandi lama salah.';

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.newPassword, 10),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });

  await recordAuthEvent({
    event: AUTH_EVENTS.PASSWORD_CHANGED,
    userId: user.id,
    username: user.username,
  });

  // Compute the destination ourselves instead of always redirecting to
  // /dashboard and trusting the (app) layout to carry a still-gated user
  // the rest of the way: a second redirect() thrown from deep inside that
  // layout, while it renders THIS action's own response target, is not
  // honoured there (the same nested-redirect trap worked around in
  // submitOtp) — a user who changed their password but still needs TOTP
  // would otherwise get stuck on /dashboard instead of reaching
  // /keamanan/2fa. mustChangePassword is hardcoded true->false here rather
  // than re-read, since that is exactly the field this update just changed.
  const gate = nextGate({
    mustChangePassword: false,
    totpEnabledAt: user.totpEnabledAt,
    phone: user.phone,
    role: user.role,
  });

  // redirect() throws NEXT_REDIRECT to unwind the render — never wrap this
  // in try/catch, or the throw is swallowed and the user sits on the form
  // with no feedback.
  redirect(gate ?? '/dashboard');
}
