'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';

/**
 * Boundary untuk error yang terjadi di dalam satu halaman `(app)/**`
 * (mis. query Prisma gagal saat memuat data satu halaman). Sidebar dan
 * Header tetap tampil di sekelilingnya karena keduanya dirender oleh
 * `(app)/layout.tsx`, satu lapis DI LUAR boundary ini — Next.js tidak
 * pernah membungkus layout.tsx suatu segmen dengan error.tsx segmen yang
 * sama. Kegagalan pada Header sendiri (mis. `listSelectableActivities()`
 * di `src/lib/activity-context.ts`) karena itu ditangani oleh
 * `src/app/error.tsx`, satu lapis lebih tinggi — lihat catatan di sana.
 */
export default function AppError({
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
