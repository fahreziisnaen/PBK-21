'use client';

import { useActionState, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { btnPrimary, btnSecondary } from '@/lib/ui';
import type { ActionResult } from '@/lib/action-result';

type Props = {
  /** Teks tombol pembuka. */
  trigger: React.ReactNode;
  triggerClassName?: string;
  title: string;
  submitLabel?: string;
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  wide?: boolean;
};

/**
 * Tombol + modal + form. Server Action mengembalikan `{ ok, message }`;
 * saat berhasil modal menutup sendiri dan menampilkan toast, saat gagal
 * pesannya tampil di dalam modal dan isian tetap ada.
 */
export function FormModal({
  trigger,
  triggerClassName = btnPrimary,
  title,
  submitLabel = 'Simpan',
  action,
  children,
  wide,
}: Props) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.ok) {
      setOpen(false);
      if (result.message) toast(result.message);
    }
    return result;
  }, undefined);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 pt-[8vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`w-full ${wide ? 'max-w-[640px]' : 'max-w-[480px]'} rounded-xl bg-white shadow-xl`}
          >
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
            </div>
            <form action={formAction}>
              <div className="space-y-4 px-6 py-5">
                {children}
                {state && !state.ok && state.message && (
                  <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-[12.5px] text-error-600">
                    {state.message}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
                <button type="button" className={btnSecondary} onClick={() => setOpen(false)} disabled={pending}>
                  Batal
                </button>
                <button type="submit" className={btnPrimary} disabled={pending}>
                  {pending ? 'Menyimpan…' : submitLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
