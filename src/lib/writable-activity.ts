import type { Activity } from '@prisma/client';
import { getActiveActivity } from '@/lib/activity-context';

/**
 * Kegiatan aktif yang boleh menerima data baru. Kegiatan yang diarsipkan
 * hanya-baca (spec §4.4) — transaksi baru ditolak.
 */
export async function getWritableActivity(): Promise<{ activity: Activity } | { error: string }> {
  const activity = await getActiveActivity();
  if (!activity) return { error: 'Belum ada kegiatan aktif. Buat kegiatan di Master Data lebih dulu.' };
  if (activity.status === 'ARSIP') return { error: 'Kegiatan ini sudah diarsipkan dan hanya bisa dibaca.' };
  return { activity };
}
