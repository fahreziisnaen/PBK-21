import type { Activity } from '@prisma/client';
import { setActiveActivity } from '@/lib/actions/set-activity';
import { fdate } from '@/lib/format';

export function ActivitySwitcher({ activities, active }: { activities: Activity[]; active: Activity | null }) {
  if (!active) {
    return <div className="text-[13px] text-gray-500">Belum ada kegiatan — buat lebih dulu di Master Data.</div>;
  }

  async function change(formData: FormData) {
    'use server';
    const id = String(formData.get('activityId') ?? '');
    if (id) await setActiveActivity(id);
  }

  return (
    <form action={change} className="flex items-center gap-2">
      <label htmlFor="activityId" className="text-[11.5px] font-semibold text-gray-500">
        KEGIATAN
      </label>
      <select
        id="activityId"
        name="activityId"
        defaultValue={active.id}
        className="h-9 rounded-lg border border-gray-300 bg-white px-2.5 text-[13px] font-semibold text-gray-900"
      >
        {activities.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {fdate(a.startDate.toISOString().slice(0, 10))}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-700"
      >
        Ganti
      </button>
    </form>
  );
}
