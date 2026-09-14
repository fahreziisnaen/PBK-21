// Kelas Tailwind yang dipakai bersama semua halaman, supaya tampilan konsisten
// tanpa menulis ulang string panjang di setiap berkas.

export const btn =
  'inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-[13px] font-semibold disabled:opacity-60';
export const btnPrimary = `${btn} bg-brand-600 text-white hover:bg-brand-700`;
export const btnSecondary = `${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;
export const btnDanger = `${btn} bg-error-600 text-white hover:opacity-90`;
export const btnGhost =
  'inline-flex h-8 items-center rounded-md px-2.5 text-[12.5px] font-semibold text-brand-600 hover:bg-brand-50';
export const btnGhostDanger =
  'inline-flex h-8 items-center rounded-md px-2.5 text-[12.5px] font-semibold text-error-600 hover:bg-error-50';

export const label = 'mb-1.5 block text-xs font-semibold text-gray-700';
export const input =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-[13.5px] text-gray-900 focus:border-brand-600 focus:outline-none';
export const textarea =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13.5px] text-gray-900 focus:border-brand-600 focus:outline-none';

export const card = 'rounded-xl border border-gray-200 bg-white';
export const tableWrap = 'overflow-x-auto rounded-xl border border-gray-200 bg-white';
export const table = 'w-full min-w-[640px] border-collapse text-[13px]';
export const th =
  'border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-gray-500';
export const thNum = `${th} text-right`;
export const td = 'border-b border-gray-100 px-4 py-3 text-gray-700';
export const tdNum = `${td} whitespace-nowrap text-right font-mono`;
export const mono = 'font-mono whitespace-nowrap';
