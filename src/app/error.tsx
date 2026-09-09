'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';

/**
 * Boundary di segmen root (bukan `global-error.tsx` — itu khusus untuk error
 * di `src/app/layout.tsx` itu sendiri). File ini menangkap error yang
 * terjadi di mana pun DI BAWAH root layout, termasuk di dalam
 * `(app)/layout.tsx` sendiri — jadi ini yang menangkap kegagalan `Header`
 * (mis. `listSelectableActivities()` di `src/lib/activity-context.ts`
 * gagal karena Postgres bermasalah), yang tidak tertangkap oleh
 * `(app)/error.tsx` karena Header dirender oleh layout itu, bukan oleh
 * children-nya. Tanpa berkas ini, kegagalan seperti itu jatuh ke halaman
 * "Application error" bawaan Next.js yang berbahasa Inggris dan tidak
 * mengikuti desain aplikasi.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState onRetry={reset} />;
}
