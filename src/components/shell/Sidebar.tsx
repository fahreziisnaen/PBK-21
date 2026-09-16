'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV_GROUPS } from '@/lib/nav';

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[9px] bg-brand-600 text-sm font-extrabold text-white">
        PBK
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold tracking-[-0.2px] text-white">Pencatatan Buku Kas</div>
        <div className="truncate text-[11px] text-sidebar-muted">SMAN 21 Surabaya</div>
      </div>
    </div>
  );
}

/**
 * Di layar lebar: kolom nav tetap di kiri. Di layar sempit: bar atas dengan
 * tombol menu, dan navigasinya jadi laci yang menutup sendiri setiap pindah
 * halaman — supaya isi halaman tidak terdorong ke bawah oleh 17 tautan nav.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [shownFor, setShownFor] = useState(pathname);

  // Menutup laci saat halaman berganti. Disesuaikan ketika render, bukan lewat
  // effect: React menjalankan ulang render ini sebelum melukis, jadi laci tidak
  // sempat terlihat menutupi halaman baru.
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  // Mengunci gulir latar selama laci terbuka, supaya jempol tidak menggulir
  // halaman di belakang laci.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <div data-noprint className="hidden items-center justify-between gap-3 bg-sidebar px-4 py-3 max-[900px]:flex">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Buka menu"
          aria-expanded={open}
          className="grid h-10 w-10 flex-none place-items-center rounded-lg text-white hover:bg-white/10"
        >
          <span aria-hidden className="space-y-[5px]">
            <span className="block h-[2px] w-5 rounded bg-current" />
            <span className="block h-[2px] w-5 rounded bg-current" />
            <span className="block h-[2px] w-5 rounded bg-current" />
          </span>
        </button>
      </div>

      {open && (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 hidden bg-gray-900/50 max-[900px]:block"
        />
      )}

      <aside
        data-noprint
        className={
          'sticky top-0 flex h-screen w-[242px] flex-none flex-col bg-sidebar ' +
          'max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:z-50 max-[900px]:w-[274px] ' +
          'max-[900px]:max-w-[85vw] max-[900px]:shadow-2xl max-[900px]:transition-[transform,visibility] max-[900px]:duration-200 ' +
          // Saat tertutup bukan hanya digeser keluar layar: `invisible` juga
          // mengeluarkannya dari urutan Tab dan dari pembaca layar, supaya 17
          // tautan nav tidak ikut dibacakan di setiap halaman.
          (open
            ? 'max-[900px]:visible max-[900px]:translate-x-0'
            : 'max-[900px]:invisible max-[900px]:-translate-x-full')
        }
      >
        <div className="flex items-center justify-between gap-2 px-4 py-5 max-[900px]:py-4">
          <Brand />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup menu"
            className="hidden h-9 w-9 flex-none place-items-center rounded-lg text-2xl leading-none text-sidebar-muted hover:bg-white/10 max-[900px]:grid"
          >
            <span aria-hidden>×</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
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
    </>
  );
}
