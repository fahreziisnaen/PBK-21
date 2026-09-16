'use client';

import { useRef, useState, useTransition } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { btnDanger, btnSecondary } from '@/lib/ui';
import type { ActionResult } from '@/lib/action-result';

/**
 * Membungkus tabel yang barisnya punya `<input type="checkbox" name="ids">`.
 * Tabelnya tetap dirender di server — yang ada di klien hanya penghitung
 * pilihan, centang-semua, dan tombol aksinya, sehingga baris tabel tidak perlu
 * dikirim dua kali sebagai data.
 *
 * Sengaja TIDAK memakai <form> pembungkus: baris tabelnya sendiri berisi form
 * (modal Bayar dan Edit), dan HTML melarang form bersarang — browser
 * menggabungkannya sehingga tombol Simpan di modal justru mengirim seleksi
 * ini. Karena itu centangnya dibaca dari DOM lalu dikirim sebagai FormData
 * yang disusun sendiri.
 */
export function BulkSelect({
  action,
  actionLabel,
  confirmTitle,
  confirmBody,
  confirmBullets,
  noun = 'baris',
  total,
  children,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  actionLabel: string;
  confirmTitle: string;
  /**
   * Kalimat konfirmasi. `{n}` diganti jumlah yang terpilih — sebuah templat,
   * bukan fungsi, karena prop dari Server Component harus bisa diserialkan.
   */
  confirmBody: string;
  confirmBullets: string[];
  noun?: string;
  /** Jumlah baris yang dirender, untuk keadaan "pilih semua". */
  total: number;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  function boxes(): HTMLInputElement[] {
    return Array.from(rootRef.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? []);
  }

  function recount() {
    setCount(boxes().filter((b) => b.checked).length);
  }

  function toggleAll(checked: boolean) {
    for (const b of boxes()) b.checked = checked;
    recount();
  }

  function run() {
    const fd = new FormData();
    for (const b of boxes()) if (b.checked) fd.append('ids', b.value);
    start(async () => {
      const result = await action(undefined, fd);
      if (result?.message) toast(result.message, result.ok ? 'ok' : 'warn');
      if (result?.ok) setCount(0);
    });
  }

  return (
    <div ref={rootRef} onChange={recount}>
      <div
        data-noprint
        className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5"
      >
        <label className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
          <input
            type="checkbox"
            aria-label="Pilih semua"
            checked={total > 0 && count === total}
            // Sebagian terpilih: kotaknya setengah-centang, bukan kosong.
            ref={(el) => {
              if (el) el.indeterminate = count > 0 && count < total;
            }}
            onChange={(e) => toggleAll(e.target.checked)}
            disabled={total === 0}
            className="h-4 w-4 rounded border-gray-300"
          />
          Pilih semua
        </label>
        <span className="text-[13px] text-gray-500">
          {count > 0 ? `${count} ${noun} dipilih` : `Centang ${noun} untuk aksi massal`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {count > 0 && (
            <button type="button" className={btnSecondary} onClick={() => toggleAll(false)} disabled={pending}>
              Batal Pilih
            </button>
          )}
          <button
            type="button"
            className={btnDanger}
            disabled={count === 0 || pending}
            onClick={() => setConfirming(true)}
          >
            {pending ? 'Memproses…' : actionLabel}
          </button>
        </div>
      </div>

      {children}

      <ConfirmDialog
        open={confirming}
        title={confirmTitle}
        body={confirmBody.replace('{n}', String(count))}
        bullets={confirmBullets}
        confirmLabel={actionLabel}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          run();
        }}
      />
    </div>
  );
}
