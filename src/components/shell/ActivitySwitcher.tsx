'use client';

import { useTransition } from 'react';
import type { SelectableActivity } from '@/lib/activity-context';
import { setActiveActivity } from '@/lib/actions/set-activity';
import { fdate } from '@/lib/format';

/**
 * Berganti kegiatan begitu pilihannya berubah — tanpa tombol terpisah dan
 * tanpa memuat ulang halaman. `setActiveActivity` merevalidasi layout, jadi
 * React menukar isi halaman di tempat; `useTransition` menahan tampilan lama
 * tetap terlihat sementara isi barunya disiapkan, sehingga tidak ada kedipan.
 */
/**
 * Mengelompokkan kegiatan per tahun pelajaran di dalam satu dropdown, bukan
 * menambah dropdown kedua: bar atas ini sudah padat di layar ponsel, dan
 * pengelompokan sudah cukup memberi tahu kegiatan ini milik tahun yang mana.
 * Tahun berjalan diletakkan paling atas karena itu yang hampir selalu dipakai.
 */
function groupByYear(activities: SelectableActivity[]) {
  const groups = new Map<string, { label: string; order: number; items: SelectableActivity[] }>();
  for (const a of activities) {
    const key = a.academicYear?.id ?? 'lepas';
    const group = groups.get(key) ?? {
      label: a.academicYear?.name ?? 'Belum dikaitkan tahun pelajaran',
      // Yang berjalan paling atas, lalu tahun terbaru; yang belum dikaitkan
      // selalu di bawah supaya tidak menutupi tahun yang sedang dipakai.
      order: a.academicYear ? (a.academicYear.isActive ? 1e9 : a.academicYear.startYear) : -1,
      items: [],
    };
    group.items.push(a);
    groups.set(key, group);
  }
  return [...groups.values()].sort((x, y) => y.order - x.order);
}

export function ActivitySwitcher({
  activities,
  active,
}: {
  activities: SelectableActivity[];
  active: SelectableActivity | null;
}) {
  const [pending, start] = useTransition();

  if (!active) {
    return <div className="text-[13px] text-gray-500">Belum ada kegiatan — buat lebih dulu di Master Data.</div>;
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 max-[900px]:w-full max-[900px]:flex-none">
      <label htmlFor="activityId" className="flex-none text-[11.5px] font-semibold text-gray-500">
        KEGIATAN
      </label>
      <select
        id="activityId"
        name="activityId"
        defaultValue={active.id}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          if (id && id !== active.id) start(() => setActiveActivity(id));
        }}
        className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 text-[13px] font-semibold text-gray-900 disabled:opacity-60 md:max-w-[380px]"
      >
        {groupByYear(activities).map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {fdate(a.startDate.toISOString().slice(0, 10))}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span
        role="status"
        aria-live="polite"
        className={'flex-none text-[12px] font-semibold text-brand-700 ' + (pending ? '' : 'invisible')}
      >
        Memuat…
      </span>
    </div>
  );
}
