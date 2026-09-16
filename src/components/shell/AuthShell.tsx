import Image from 'next/image';
import { BrandLockup } from '@/components/shell/BrandMark';

/**
 * Kerangka bersama seluruh halaman masuk: latar bermerek KASERA dengan kartu
 * form di atasnya.
 *
 * Latarnya sudah memuat logo, nama, dan nama sekolah di sisi kiri, jadi
 * kartunya diletakkan di kanan — bagian gambar yang memang dibiarkan kosong —
 * dan lambang di dalam kartu hanya muncul di layar sempit, tempat gambarnya
 * tidak ditampilkan sehingga tidak ada yang menyebut nama aplikasinya.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <Image
        src="/background.png"
        alt=""
        fill
        priority
        sizes="100vw"
        // Gambarnya lanskap 16:9. Di layar sempit ia harus dipotong begitu
        // dalam sehingga yang tersisa hanya bidang kosong tanpa logo — jadi di
        // sana gambarnya tidak dipakai, dan mereknya dibawa oleh lambang di
        // dalam kartu serta garis kuning di tepi atasnya.
        className="hidden object-cover object-center lg:block"
      />

      <div className="relative flex min-h-screen items-center justify-center px-5 py-10 lg:justify-end lg:px-12 xl:pr-[8vw]">
        {/* Garis kuning di tepi atas mengutip diagonal di sudut gambar latar.
            Tanpa backdrop-blur: properti itu menjadikan kartu ini containing
            block bagi keturunan `position: fixed`, sehingga selubung modal
            token hanya menutupi kartu, bukan seluruh layar. */}
        <div className="w-full max-w-[420px] rounded-card border border-gray-200 border-t-4 border-t-brand-500 bg-white p-7 shadow-2xl max-[420px]:p-5">
          <div className="mb-6 lg:hidden">
            <BrandLockup tone="light" size={44} priority />
          </div>

          {children}

          <p className="mt-7 border-t border-gray-100 pt-4 text-[11.5px] text-gray-500">
            SMAN 21 Surabaya · Tahun anggaran 2026
          </p>
        </div>
      </div>
    </div>
  );
}
