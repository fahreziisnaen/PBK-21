import { cookies } from 'next/headers';
import type { Activity } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const ACTIVITY_COOKIE = 'pbk_activity';

/** Murni — dites terpisah dari I/O. */
export function resolveActiveActivity<T extends { id: string }>(
  cookieValue: string | undefined,
  activities: T[],
): string | null {
  if (activities.length === 0) return null;
  if (cookieValue && activities.some((a) => a.id === cookieValue)) return cookieValue;
  return activities[0].id;
}

export async function listSelectableActivities(): Promise<Activity[]> {
  return prisma.activity.findMany({
    where: { status: { in: ['AKTIF', 'DRAFT'] } },
    orderBy: [{ year: 'desc' }, { startDate: 'desc' }],
  });
}

export async function getActiveActivity(): Promise<Activity | null> {
  const activities = await listSelectableActivities();
  const store = await cookies();
  const id = resolveActiveActivity(store.get(ACTIVITY_COOKIE)?.value, activities);
  return activities.find((a) => a.id === id) ?? null;
}
