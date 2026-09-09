'use client';

import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  title: string;
  body: string;
  bullets: string[];
  confirmLabel: string;
  tone?: 'error' | 'warn';
  onConfirm: () => void;
  onCancel: () => void;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  open, title, body, bullets, confirmLabel, tone = 'error', onConfirm, onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const container = dialogRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const confirmClass =
    tone === 'warn' ? 'bg-warn-700 hover:brightness-110' : 'bg-error-600 hover:bg-error-700';

  return (
    <div
      ref={dialogRef}
      data-noprint
      className="fixed inset-0 z-50 grid place-items-center bg-gray-900/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="animate-pbkin w-full max-w-[480px] rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1.5 text-[17px] font-bold tracking-[-0.3px] text-gray-900">{title}</h2>
        <p className="mb-4 text-[13px] leading-relaxed text-gray-600">{body}</p>

        <ul className="mb-5 space-y-2">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2 text-[12.5px] leading-relaxed text-gray-600">
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-gray-300" />
              {b}
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={'rounded-lg px-4 py-2 text-[13px] font-semibold text-white ' + confirmClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
