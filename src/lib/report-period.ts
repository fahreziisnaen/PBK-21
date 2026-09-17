import { fdateLong } from '@/lib/format';

/** Tanggal ISO (YYYY-MM-DD) dari sebuah Date, dibaca dalam UTC seperti kolom @db.Date. */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Keterangan periode untuk kop laporan.
 *
 * Tanpa penyaring tanggal, awal periode diambil dari transaksi PERTAMA, bukan
 * dari tanggal mulai kegiatan. Iuran dipungut sebelum kegiatan berangkat, jadi
 * "Periode 10 September s.d. saat ini" di atas tabel yang dimulai 1 Agustus
 * adalah keterangan yang salah — dan itu terjadi di hampir setiap kegiatan.
 *
 * Akhir periode ditulis sebagai tanggal, bukan "saat ini": laporan yang
 * dicetak hari ini lalu dibaca bulan depan tidak boleh berubah artinya.
 */
export function reportPeriod({
  from,
  to,
  firstDate,
  lastDate,
  today,
}: {
  from: Date | null;
  to: Date | null;
  firstDate: Date | null;
  lastDate: Date | null;
  /** Tanggal cetak, YYYY-MM-DD. */
  today: string;
}): string {
  const start = from ? iso(from) : firstDate ? iso(firstDate) : null;
  // Transaksi bertanggal setelah hari ini tetap masuk laporan; akhir periodenya
  // harus mencakupnya, bukan berhenti di tanggal cetak.
  const end = to ? iso(to) : lastDate && iso(lastDate) > today ? iso(lastDate) : today;
  if (!start) return `Sampai ${fdateLong(end)} — belum ada transaksi`;
  return `${fdateLong(start)} s.d. ${fdateLong(end)}`;
}
