import { statusTone, type Tone } from '@/lib/status';

const CLASSES: Record<Tone, string> = {
  success: 'bg-success-50 text-success-700',
  warn: 'bg-warn-50 text-warn-700',
  error: 'bg-error-50 text-error-600',
  neutral: 'bg-gray-100 text-gray-600',
};

export function Badge({ status }: { status: string }) {
  return (
    <span
      className={
        'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ' +
        CLASSES[statusTone(status)]
      }
    >
      {status}
    </span>
  );
}
