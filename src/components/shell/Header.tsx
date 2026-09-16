import Link from 'next/link';
import { auth } from '@/lib/auth';
import { logout } from '@/lib/actions/logout';
import { ActivitySwitcher } from '@/components/shell/ActivitySwitcher';
import { getActiveActivity, listSelectableActivities } from '@/lib/activity-context';

export async function Header() {
  const [session, activities] = await Promise.all([auth(), listSelectableActivities()]);
  const active = await getActiveActivity(activities);

  return (
    <header
      data-noprint
      className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 max-[900px]:h-auto max-[900px]:flex-wrap max-[900px]:gap-2 max-[900px]:px-4 max-[900px]:py-2.5"
    >
      <ActivitySwitcher activities={activities} active={active} />

      <div className="flex items-center gap-3 max-[900px]:flex-wrap">
        <Link href="/notifikasi" className="text-[13px] font-medium text-gray-600 hover:text-brand-800">
          Notifikasi
        </Link>
        <Link href="/profil" className="text-[13px] font-semibold text-gray-900 hover:text-brand-800">
          {session?.user?.name ?? 'Pengguna'}
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Keluar
          </button>
        </form>
      </div>
    </header>
  );
}
