import type { AcademicYear, Activity } from '@prisma/client';
import { btnSecondary, input } from '@/lib/ui';

type ReportActivity = Activity & { academicYear: AcademicYear | null };

/**
 * Dikelompokkan per tahun pelajaran, sama seperti pemilih di bar atas. Daftar
 * ini bahkan lebih panjang karena memuat kegiatan selesai dan arsip juga, jadi
 * tanpa pengelompokan ia akan terus menumpuk tiap tahun ajaran.
 */
function groupByYear(activities: ReportActivity[]) {
  const groups = new Map<string, { label: string; order: number; items: ReportActivity[] }>();
  for (const a of activities) {
    const key = a.academicYear?.id ?? 'lepas';
    const group = groups.get(key) ?? {
      label: a.academicYear?.name ?? 'Belum dikaitkan tahun pelajaran',
      order: a.academicYear ? (a.academicYear.isActive ? 1e9 : a.academicYear.startYear) : -1,
      items: [],
    };
    group.items.push(a);
    groups.set(key, group);
  }
  return [...groups.values()].sort((x, y) => y.order - x.order);
}

/** Pemilih kegiatan untuk laporan: termasuk kegiatan selesai dan arsip, karena laporannya tetap harus bisa dicetak. */
export function ReportFilters({
  activities,
  activityId,
  from,
  to,
  children,
}: {
  activities: ReportActivity[];
  activityId: string;
  from?: string;
  to?: string;
  children?: React.ReactNode;
}) {
  return (
    <form className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3" data-noprint>
      <select name="activityId" defaultValue={activityId} className={`${input} max-w-[325px]`} aria-label="Kegiatan">
        {groupByYear(activities).map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.status === 'ARSIP' ? ' (arsip)' : a.status === 'SELESAI' ? ' (selesai)' : ''}
              </option>
            ))}
          </optgroup>
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
