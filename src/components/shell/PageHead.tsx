import { getRouteMeta } from '@/lib/routes';

export function PageHead({
  pathname,
  actions,
  activity,
}: {
  pathname: string;
  actions?: React.ReactNode;
  /** Kegiatan yang sedang dipilih, untuk halaman yang datanya terikat kegiatan. */
  activity?: { name: string; year?: number; status?: string } | null;
}) {
  const meta = getRouteMeta(pathname);

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-gray-500">
          {meta.crumbs.map((crumb, i) => (
            <span key={crumb} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-gray-300">/</span>}
              <span className={i === meta.crumbs.length - 1 ? 'font-semibold text-gray-700' : ''}>{crumb}</span>
            </span>
          ))}
        </nav>
        <h1 className="kasera-heading text-[21px] text-ink">{meta.title}</h1>
        {/* Garis kuning tipis, mengikuti pelek logo. */}
        <div className="mt-1.5 h-[3px] w-10 rounded-full bg-brand-500" />
        <p className="mt-2 text-[13px] text-ink-soft">{meta.subtitle}</p>
        {activity ? (
          // Halaman ini menampilkan data satu kegiatan saja — namanya ditulis
          // di judul supaya tidak ada keraguan angka ini milik kegiatan mana.
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[12.5px] font-semibold text-brand-700">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-brand-500" />
              <span className="truncate">{activity.name}</span>
            </span>
            {activity.year && <span className="text-[12px] text-gray-500">TA {activity.year}</span>}
            {activity.status === 'ARSIP' && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600">Arsip — hanya baca</span>
            )}
          </div>
        ) : null}
      </div>
      {actions && <div data-noprint className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
