// Kelas Tailwind yang dipakai bersama semua halaman, supaya tampilan konsisten
// tanpa menulis ulang string panjang di setiap berkas.

export const btn =
  'inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-[13px] font-semibold disabled:opacity-60';
// Kuning brand dengan teks hitam — 10,6:1, pasangan kontras tertinggi yang
// dimiliki palet ini. Putih di atas kuning hanya 1,64:1 dan dilarang.
export const btnPrimary = `${btn} bg-brand-500 text-ink hover:bg-brand-600`;
export const btnSecondary = `${btn} border border-gray-300 bg-white text-ink hover:border-brand-500 hover:bg-brand-50`;
export const btnDanger = `${btn} bg-accent-500 text-white hover:bg-accent-600`;
export const btnGhost =
  'inline-flex h-8 items-center rounded-md px-2.5 text-[12.5px] font-semibold text-brand-700 hover:bg-brand-50';
export const btnGhostDanger =
  'inline-flex h-8 items-center rounded-md px-2.5 text-[12.5px] font-semibold text-error-600 hover:bg-error-50';

export const label = 'mb-1.5 block text-xs font-semibold text-gray-700';
export const input =
  'h-10 w-full rounded-control border border-gray-300 bg-white px-3 text-[13.5px] text-ink focus:outline-none';
export const textarea =
  'w-full rounded-control border border-gray-300 bg-white px-3 py-2 text-[13.5px] text-ink focus:outline-none';

// Baris penyaring. Di layar lebar isiannya berjajar dengan lebarnya masing-
// masing; di ponsel jadi kisi dua kolom. Tanpa itu setiap isian menempati
// barisnya sendiri dengan lebar yang tidak seragam, dan tujuh penyaring
// Laporan Keuangan menghabiskan satu layar penuh sebelum laporannya terlihat.
export const filterRow = 'flex flex-wrap items-center gap-2 max-[640px]:grid max-[640px]:grid-cols-2';
/** Isian penyaring yang di ponsel memenuhi satu baris kisi (pencarian, pemilih kegiatan). */
export const filterFull = 'max-[640px]:col-span-2 max-[640px]:max-w-none';
/** Isian penyaring yang di ponsel berbagi baris berdua (pilihan tingkat, kelas, status). */
export const filterHalf = 'max-[640px]:max-w-none';

export const card = 'rounded-card border border-gray-200 bg-white';
export const tableWrap = 'overflow-x-auto rounded-card border border-gray-200 bg-white';
export const table = 'w-full min-w-[640px] border-collapse text-[13px]';
export const th =
  'border-b-2 border-gray-200 bg-gray-50 px-4 py-2.5 text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-soft';
export const thNum = `${th} text-right`;
export const td = 'border-b border-gray-100 px-4 py-3 text-gray-700';
export const tdNum = `${td} whitespace-nowrap text-right font-mono`;
export const mono = 'font-mono whitespace-nowrap';
