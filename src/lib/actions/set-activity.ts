'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ACTIVITY_COOKIE } from '@/lib/activity-context';

export async function setActiveActivity(id: string) {
  const store = await cookies();
  store.set(ACTIVITY_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
}
