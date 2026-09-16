import Link from 'next/link';

export const PAGE_SIZE = 50;

/**
 * Nomor halaman dari query string. Nilai yang tidak masuk akal — nol, negatif,
 * bukan angka — dianggap halaman pertama, bukan dibiarkan jadi `skip` negatif
 * yang ditolak database.
 */
export function pageFrom(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 1 ? n : 1;
}

/** Potongan data untuk satu halaman, dipakai saat penyaringannya di JavaScript. */
export function sliceFor<T>(rows: T[], page: number, size = PAGE_SIZE): T[] {
  return rows.slice((page - 1) * size, page * size);
}

function href(params: Record<string, string | undefined>, page: number): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) sp.set(key, value);
  }
  // Halaman pertama tidak perlu menulis `page=1` di URL — lebih bersih dibagikan.
  if (page > 1) sp.set('page', String(page));
  const query = sp.toString();
  return query ? `?${query}` : '?';
}

/**
 * Navigasi halaman untuk tabel panjang.
 *
 * Seluruh penyaring yang sedang aktif ikut dibawa ke tautannya — tanpa itu,
 * menekan "Berikutnya" akan membuang filter dan menampilkan data yang sama
 * sekali lain.
 */
export function Pagination({
  page,
  total,
  params,
  size = PAGE_SIZE,
  label = 'baris',
}: {
  page: number;
  /** Jumlah seluruh baris setelah disaring, bukan hanya yang di halaman ini. */
  total: number;
  params: Record<string, string | undefined>;
  size?: number;
  label?: string;
}) {
  const lastPage = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  // Satu halaman saja: tidak ada yang perlu dinavigasi, tetapi jumlahnya tetap
  // berguna untuk diketahui.
  const single = lastPage <= 1;

  return (
    <div
      data-noprint
      className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-ink-soft"
    >
      <span>
        {total === 0 ? `Tidak ada ${label}` : `Menampilkan ${from}–${to} dari ${total} ${label}`}
      </span>

      {!single && (
        <nav aria-label="Navigasi halaman" className="flex items-center gap-1.5">
          <PageLink params={params} page={page - 1} disabled={page <= 1}>
            ‹ Sebelumnya
          </PageLink>
          <span className="px-2 font-semibold text-ink">
            {page} / {lastPage}
          </span>
          <PageLink params={params} page={page + 1} disabled={page >= lastPage}>
            Berikutnya ›
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: Record<string, string | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className = 'rounded-control border px-3 py-1.5 font-semibold';
  if (disabled) {
    // `<span>`, bukan tautan yang dinonaktifkan: tautan mati tetap bisa
    // difokus dan diklik papan ketik, lalu tidak melakukan apa-apa.
    return <span className={`${className} border-gray-200 text-gray-400`}>{children}</span>;
  }
  return (
    <Link href={href(params, page)} className={`${className} border-gray-300 text-ink hover:border-brand-500 hover:bg-brand-50`}>
      {children}
    </Link>
  );
}
