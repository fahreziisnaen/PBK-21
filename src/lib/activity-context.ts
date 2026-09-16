import { cookies } from 'next/headers';
import type { Activity, AcademicYear } from '@prisma/client';
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

/** Kegiatan beserta tahun pelajarannya, untuk ditampilkan di judul halaman. */
export type SelectableActivity = Activity & { academicYear: AcademicYear | null };

export async function listSelectableActivities(): Promise<SelectableActivity[]> {
  return prisma.activity.findMany({
    where: { status: { in: ['AKTIF', 'DRAFT'] } },
    include: { academicYear: true },
    orderBy: [{ year: 'desc' }, { startDate: 'desc' }],
  });
}

/**
 * Untuk Server Component. Menerima daftar kegiatan yang sudah diambil bila
 * caller sudah memilikinya (mis. Header, yang juga menampilkan seluruh
 * daftar) — supaya `listSelectableActivities()` tidak dijalankan dua kali
 * per render. Tanpa argumen, ia mengambil daftarnya sendiri.
 */
export async function getActiveActivity(preloadedActivities?: SelectableActivity[]): Promise<SelectableActivity | null> {
  const activities = preloadedActivities ?? (await listSelectableActivities());
  const store = await cookies();
  const id = resolveActiveActivity(store.get(ACTIVITY_COOKIE)?.value, activities);
  return activities.find((a) => a.id === id) ?? null;
}
