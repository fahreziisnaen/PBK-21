import Link from 'next/link';

/**
 * Menggantikan halaman "This page could not be found." bawaan Next.js —
 * seluruh teks yang dihadapi pengguna wajib berbahasa Indonesia (lihat
 * Global Constraint di spesifikasi produk). Dipakai baik untuk URL yang
 * benar-benar tidak ada maupun pemanggilan `notFound()` dari segmen mana
 * pun yang tidak punya `not-found.tsx` sendiri.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[13px] font-bold tracking-[0.06em] text-brand-700">404</p>
      <h1 className="text-[22px] font-bold tracking-[-0.3px] text-gray-900">Halaman Tidak Ditemukan</h1>
      <p className="max-w-md text-[13.5px] leading-relaxed text-gray-600">
        Halaman yang Anda cari tidak tersedia atau sudah dipindahkan.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-brand-500 px-4 py-2 text-[13px] font-semibold text-ink hover:bg-brand-600"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
