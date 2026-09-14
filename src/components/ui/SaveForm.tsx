'use client';

import { useActionState, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { btnPrimary } from '@/lib/ui';
import type { ActionResult } from '@/lib/action-result';

/** Form biasa (bukan modal) dengan tombol Simpan, pesan galat, dan toast saat berhasil. */
export function SaveForm({
  action,
  children,
  disabled,
  submitLabel = 'Simpan',
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  disabled?: boolean;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const toast = useToast();
  useEffect(() => {
    if (state?.ok && state.message) toast(state.message);
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-4">
      {children}
      {state && !state.ok && state.message && (
        <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-[12.5px] text-error-600">{state.message}</p>
      )}
      {!disabled && (
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? 'Menyimpan…' : submitLabel}
        </button>
      )}
    </form>
  );
}
