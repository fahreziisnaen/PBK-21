import { getRouteMeta } from '@/lib/routes';

export function PageHead({ pathname, actions }: { pathname: string; actions?: React.ReactNode }) {
  const meta = getRouteMeta(pathname);

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-gray-500">
          {meta.crumbs.map((crumb, i) => (
            <span key={crumb} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-gray-300">/</span>}
              <span className={i === meta.crumbs.length - 1 ? 'font-semibold text-gray-700' : ''}>{crumb}</span>
            </span>
          ))}
        </nav>
        <h1 className="text-[22px] font-bold tracking-[-0.5px] text-gray-900">{meta.title}</h1>
        <p className="mt-0.5 text-[13px] text-gray-500">{meta.subtitle}</p>
      </div>
      {actions && <div data-noprint className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
