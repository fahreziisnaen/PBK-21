'use client';

import { useState, useTransition } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { btnGhostDanger } from '@/lib/ui';
import type { ActionResult } from '@/lib/action-result';

type Props = {
  label: string;
  title: string;
  body: string;
  bullets: string[];
  confirmLabel: string;
  /** Server Action tanpa form — dipanggil langsung saat dikonfirmasi. */
  run: () => Promise<ActionResult>;
  className?: string;
  tone?: 'error' | 'warn';
};

/** Tombol aksi destruktif (batalkan, nonaktifkan, arsipkan) dengan dialog konfirmasi. */
export function ConfirmAction({ label, title, body, bullets, confirmLabel, run, className, tone }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  return (
    <>
      <button type="button" className={className ?? btnGhostDanger} onClick={() => setOpen(true)} disabled={pending}>
        {label}
      </button>
      <ConfirmDialog
        open={open}
        title={title}
        body={body}
        bullets={bullets}
        confirmLabel={confirmLabel}
        tone={tone}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          start(async () => {
            const result = await run();
            if (result?.message) toast(result.message, result.ok ? 'ok' : 'warn');
          });
        }}
      />
    </>
  );
}
