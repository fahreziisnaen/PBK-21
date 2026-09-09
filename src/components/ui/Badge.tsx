import { statusLabel, statusTone, type Tone } from '@/lib/status';

const CLASSES: Record<Tone, string> = {
  success: 'bg-success-50 text-success-700',
  warn: 'bg-warn-50 text-warn-700',
  error: 'bg-error-50 text-error-600',
  neutral: 'bg-gray-100 text-gray-600',
};

/**
 * `status` menerima baik nilai enum Prisma mentah (mis. 'AKTIF') maupun
 * label tampilan berbahasa Indonesia (mis. 'Aktif') — keduanya diterjemahkan
 * ke label dan warna yang sama lewat `statusLabel`/`statusTone`.
 */
export function Badge({ status }: { status: string }) {
  return (
    <span
      className={
        'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ' +
        CLASSES[statusTone(status)]
      }
    >
      {statusLabel(status)}
    </span>
  );
}
