import Link from 'next/link';

/**
 * Isi bersama untuk seluruh error boundary (`error.tsx`) di aplikasi. Dipakai
 * dari komponen client (`error.tsx` wajib 'use client') supaya tampilannya
 * konsisten di setiap lapis boundary.
 */
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[12.5px] font-bold tracking-[0.06em] text-error-600 uppercase">
        Terjadi Kesalahan
      </p>
      <h1 className="text-[22px] font-bold tracking-[-0.3px] text-gray-900">Halaman Gagal Dimuat</h1>
      <p className="max-w-md text-[13.5px] leading-relaxed text-gray-600">
        Terjadi gangguan saat memuat halaman ini — kemungkinan koneksi ke
        database terputus sesaat. Coba muat ulang; kalau masalah terus
        berlanjut, kembali ke Dashboard atau hubungi admin.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-brand-500 px-4 py-2 text-[13px] font-semibold text-ink hover:bg-brand-600"
        >
          Coba Lagi
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-gray-300 px-4 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
