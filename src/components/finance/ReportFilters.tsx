import type { AcademicYear, Activity } from '@prisma/client';
import { AutoSubmitForm } from '@/components/finance/AutoSubmitForm';
import { DateRange } from '@/components/ui/DateRange';
import { filterFull, filterHalf, filterRow, input } from '@/lib/ui';

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
    <AutoSubmitForm className={`${filterRow} mb-4 rounded-xl border border-gray-200 bg-white p-3`}>
      <select name="activityId" defaultValue={activityId} className={`${input} max-w-[325px] ${filterFull}`} aria-label="Kegiatan">
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
      <DateRange from={from} to={to} />
      {children}
    </AutoSubmitForm>
  );
}

/**
 * Pasangan pilihan tingkat dan kelas untuk laporan. Daftar kelas dipersempit
 * ke tingkat yang sedang disaring, dan tiap pilihan membawa tingkatnya di
 * `data-grade` — dari situ AutoSubmitForm tahu kelas mana yang harus dilepas
 * saat tingkatnya diganti.
 */
export function GradeClassSelects({
  classes,
  grade,
  kelas,
}: {
  classes: { id: string; name: string; grade: string }[];
  grade?: string;
  kelas?: string;
}) {
  return (
    <>
      <select name="grade" defaultValue={grade ?? ''} className={`${input} max-w-[185px] ${filterHalf}`} aria-label="Tingkat">
        <option value="">Semua tingkat</option>
        <option value="X">Tingkat X</option>
        <option value="XI">Tingkat XI</option>
        <option value="XII">Tingkat XII</option>
      </select>
      <select name="kelas" defaultValue={kelas ?? ''} className={`${input} max-w-[205px] ${filterHalf}`} aria-label="Kelas">
        <option value="">{grade ? `Semua kelas tingkat ${grade}` : 'Semua kelas'}</option>
        <option value="-">— Tanpa kelas —</option>
        {classes
          .filter((c) => !grade || c.grade === grade)
          .map((c) => (
            <option key={c.id} value={c.name} data-grade={c.grade}>
              {c.name}
            </option>
          ))}
      </select>
    </>
  );
}
