import { input } from '@/lib/ui';

/**
 * Pasangan tanggal "dari – sampai" untuk baris penyaring.
 *
 * Keduanya dibungkus satu kotak supaya tidak terpisah: di ponsel tanda "–"
 * sebelumnya tertinggal sendirian di ujung baris dan tanggal akhirnya turun ke
 * baris berikutnya. Di kisi penyaring ponsel pasangan ini memenuhi satu baris.
 */
export function DateRange({ from, to }: { from?: string; to?: string }) {
  return (
    <div className="flex w-[340px] items-center gap-2 max-[640px]:col-span-2 max-[640px]:w-auto">
      <input
        type="date"
        name="from"
        defaultValue={from ?? ''}
        className={`${input} min-w-0 flex-1`}
        aria-label="Dari tanggal"
      />
      <span className="flex-none text-gray-400" aria-hidden>
        –
      </span>
      <input type="date" name="to" defaultValue={to ?? ''} className={`${input} min-w-0 flex-1`} aria-label="Sampai tanggal" />
    </div>
  );
}
