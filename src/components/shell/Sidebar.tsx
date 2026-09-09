'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS } from '@/lib/nav';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      data-noprint
      className="sticky top-0 flex h-screen w-[242px] flex-none flex-col bg-sidebar max-[900px]:static max-[900px]:h-auto max-[900px]:w-full"
    >
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="grid h-[38px] w-[38px] place-items-center rounded-[9px] bg-brand-600 text-sm font-extrabold text-white">
          PBK
        </div>
        <div>
          <div className="text-sm font-bold tracking-[-0.2px] text-white">Pencatatan Buku Kas</div>
          <div className="text-[11px] text-sidebar-muted">SMAN 21 Surabaya</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6 max-[900px]:flex max-[900px]:flex-wrap max-[900px]:gap-1.5 max-[900px]:overflow-visible">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4 max-[900px]:mb-0">
            <div className="mb-1.5 px-2 text-[10px] font-bold tracking-[0.6px] text-sidebar-dot">
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ' +
                    (active
                      ? 'bg-brand-600 font-bold text-white'
                      : 'font-medium text-sidebar-fg hover:bg-white/5')
                  }
                >
                  <span
                    className={
                      'h-1.5 w-1.5 flex-none rounded-full ' + (active ? 'bg-white' : 'bg-sidebar-dot')
                    }
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
