'use client';

import { btnPrimary } from '@/lib/ui';

export function PrintButton({ label = 'Cetak' }: { label?: string }) {
  return (
    <button type="button" className={btnPrimary} onClick={() => window.print()} data-noprint>
      {label}
    </button>
  );
}
