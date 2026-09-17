import { BrandMark } from '@/components/shell/BrandMark';
import { fdateLong } from '@/lib/format';

type School = { name: string; address: string | null; npsn: string | null } | null;

/**
 * Kop laporan. Satu komponen untuk keempat laporan, supaya kop yang dicetak
 * tidak lagi berbeda-beda: sebelumnya Buku Kas rata kiri tanpa alamat, Rekap
 * tidak punya kop sama sekali, dan laporan lain tanpa alamat maupun NPSN.
 *
 * `printOnly` untuk halaman kerja (Buku Kas, Rekap) yang di layar sudah punya
 * judul halamannya sendiri; kopnya hanya perlu muncul di kertas.
 */
export function ReportKop({
  school,
  title,
  lines,
  period,
  printOnly = false,
}: {
  school: School;
  title: string;
  /** Baris keterangan di bawah judul: kegiatan, kategori, penyaring. */
  lines: string[];
  period?: string;
  printOnly?: boolean;
}) {
  const contact = [school?.address, school?.npsn ? `NPSN ${school.npsn}` : null].filter(Boolean).join(' · ');
  return (
    <div className={`mb-5 ${printOnly ? 'hidden print:block' : ''}`}>
      <div className="flex items-center gap-4 border-b-2 border-gray-900 pb-3">
        <BrandMark size={52} />
        <div className="min-w-0 flex-1 text-center">
          <div className="text-[16px] font-extrabold uppercase tracking-wide text-gray-900">{school?.name ?? 'Sekolah'}</div>
          {contact && <div className="text-[11.5px] text-gray-600">{contact}</div>}
        </div>
        {/* Penyeimbang lebar lambang di kiri, supaya nama sekolah benar-benar di tengah halaman. */}
        <div className="w-[52px] flex-none" aria-hidden />
      </div>
      <div className="mt-3 text-center">
        <div className="text-[15px] font-bold uppercase text-gray-900">{title}</div>
        {lines.filter(Boolean).map((line) => (
          <div key={line} className="text-[13px] text-gray-700">{line}</div>
        ))}
        {period && <div className="text-[12px] text-gray-500">Periode {period}</div>}
      </div>
    </div>
  );
}

type SignatureProps = {
  name: string;
  signatureImage: string | null | undefined;
  /** Tanggal di atas tanda tangan, YYYY-MM-DD. */
  date: string;
};

function SignatureBox({ name, signatureImage, date }: SignatureProps) {
  return (
    <div className="min-w-[220px] text-center text-[13px] text-gray-700">
      <div>Surabaya, {fdateLong(date)}</div>
      <div>Bendahara</div>
      {signatureImage ? (
        // Data URI dari database, bukan berkas eksternal.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signatureImage} alt="Tanda tangan bendahara" className="mx-auto h-16 object-contain" />
      ) : (
        <div className="h-16" />
      )}
      <div className="border-t border-gray-500 pt-1 font-semibold text-gray-900">{name}</div>
    </div>
  );
}

/**
 * Blok tanda tangan bendahara di bawah laporan.
 *
 * `printOnly`: hanya di kertas (halaman kerja yang di layar tidak butuh
 * tanda tangan). `screenOnly`: hanya di layar, karena salinan cetaknya ada
 * di footer tabel lewat {@link SignatureFooterRow}.
 */
export function ReportSignature({
  printOnly = false,
  screenOnly = false,
  ...props
}: SignatureProps & { printOnly?: boolean; screenOnly?: boolean }) {
  return (
    <div
      data-signature
      data-noprint={screenOnly || undefined}
      className={`mt-8 justify-end ${printOnly ? 'hidden print:flex' : 'flex'}`}
    >
      <SignatureBox {...props} />
    </div>
  );
}

/**
 * Tanda tangan sebagai baris terakhir footer tabel, hanya di kertas.
 *
 * Sebagai blok terpisah sesudah tabel, Chrome bisa mencetak tanda tangan
 * sendirian di halaman baru: `break-before: avoid` tidak dipatuhi pada
 * halaman laporan ini (tabel digeser di 31 posisi, 13 di antaranya tanda
 * tangannya yatim). Di dalam footer yang `break-inside: avoid`, tanda tangan
 * selalu pindah halaman bersama baris Total.
 */
export function SignatureFooterRow({ colSpan, ...props }: SignatureProps & { colSpan: number }) {
  return (
    <tr data-signature-row className="hidden print:table-row">
      <td colSpan={colSpan}>
        <div data-signature>
          <SignatureBox {...props} />
        </div>
      </td>
    </tr>
  );
}
