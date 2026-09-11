'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ACTIVITY_COOKIE } from '@/lib/activity-context';
import { requireUser } from '@/lib/auth-guard';

export async function setActiveActivity(id: string) {
  // Guarded even though the direct impact is small — it only sets a cookie in
  // the caller's own browser. It matters because spec §11 makes the guard
  // mandatory on every Server Action, and this was the one live
  // counter-example to the rule the next plan will be told to follow. The
  // proxy cannot backstop it either: a Server Action can be POSTed to any
  // path, including ones the matcher excludes.
  await requireUser();

  const store = await cookies();
  store.set(ACTIVITY_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    // The VPS deploy terminates TLS at Caddy, so the cookie must be marked
    // secure in production. Conditional so local HTTP development still works.
    secure: process.env.NODE_ENV === 'production',
  });
  revalidatePath('/', 'layout');
}
