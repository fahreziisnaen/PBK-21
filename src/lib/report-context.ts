import { prisma } from '@/lib/prisma';
import { getActiveActivity } from '@/lib/activity-context';
import { parseDateInput } from '@/lib/finance';

/** Kegiatan dan periode untuk halaman laporan, dari query string; default kegiatan aktif. */
export async function resolveReport(sp: { activityId?: string; from?: string; to?: string }) {
  const activities = await prisma.activity.findMany({
    include: { category: true, academicYear: true },
    orderBy: [{ year: 'desc' }, { startDate: 'desc' }],
  });
  const active = await getActiveActivity();
  const activity = activities.find((a) => a.id === sp.activityId) ?? activities.find((a) => a.id === active?.id) ?? activities[0] ?? null;
  return {
    activities,
    activity,
    from: parseDateInput(sp.from ?? null),
    to: parseDateInput(sp.to ?? null),
    school: await prisma.school.findFirst(),
  };
}
