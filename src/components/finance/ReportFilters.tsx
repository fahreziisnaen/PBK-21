import type { Activity } from '@prisma/client';
import { btnSecondary, input } from '@/lib/ui';

/** Pemilih kegiatan untuk laporan: termasuk kegiatan selesai dan arsip, karena laporannya tetap harus bisa dicetak. */
export function ReportFilters({
  activities,
  activityId,
  from,
  to,
  children,
}: {
  activities: Activity[];
  activityId: string;
  from?: string;
  to?: string;
  children?: React.ReactNode;
}) {
  return (
    <form className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3" data-noprint>
      <select name="activityId" defaultValue={activityId} className={`${input} max-w-[280px]`} aria-label="Kegiatan">
        {activities.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}{a.status === 'ARSIP' ? ' (arsip)' : a.status === 'SELESAI' ? ' (selesai)' : ''}
          </option>
        ))}
      </select>
      <input type="date" name="from" defaultValue={from ?? ''} className={`${input} max-w-[160px]`} aria-label="Dari tanggal" />
      <span className="text-gray-400">–</span>
      <input type="date" name="to" defaultValue={to ?? ''} className={`${input} max-w-[160px]`} aria-label="Sampai tanggal" />
      {children}
      <button className={btnSecondary}>Tampilkan</button>
    </form>
  );
}
