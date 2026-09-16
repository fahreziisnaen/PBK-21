import Image from 'next/image';

export const APP_NAME = 'KASERA';
export const APP_TAGLINE = 'Sistem Administrasi Kas';
export const APP_SCHOOL = 'SMAN 21 Surabaya';

/**
 * Lambang KASERA. Dipakai di sidebar, halaman login, dan verifikasi, supaya
 * logonya hanya didefinisikan sekali. `priority` hanya pada pemakaian yang
 * tampil di layar pertama.
 */
export function BrandMark({
  size = 38,
  priority = false,
  className = '',
}: {
  size?: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src="/kasera_logo.png"
      alt="Logo KASERA"
      width={size}
      height={size}
      priority={priority}
      className={`flex-none rounded-[9px] ${className}`}
    />
  );
}

/** Lambang plus nama aplikasi — susunan yang sama di sidebar dan halaman masuk. */
export function BrandLockup({
  tone = 'dark',
  size = 38,
  priority = false,
}: {
  /** `dark` untuk latar hitam (sidebar), `light` untuk latar putih (login). */
  tone?: 'dark' | 'light';
  size?: number;
  priority?: boolean;
}) {
  const title = tone === 'dark' ? 'text-white' : 'text-ink';
  const sub = tone === 'dark' ? 'text-sidebar-muted' : 'text-gray-500';
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={size} priority={priority} />
      <div className="min-w-0">
        <div className={`kasera-heading truncate text-[15px] leading-tight ${title}`}>{APP_NAME}</div>
        {/* Dua baris, bukan satu dipisah titik: lebar sidebar 242px menyisakan
            sekitar 180px untuk teks, dan satu baris gabungan akan terpotong. */}
        <div className={`truncate text-[10.5px] leading-tight ${sub}`}>{APP_TAGLINE}</div>
        <div className={`truncate text-[10.5px] leading-tight ${sub}`}>{APP_SCHOOL}</div>
      </div>
    </div>
  );
}
