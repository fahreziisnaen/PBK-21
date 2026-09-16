'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { submitOtp } from '@/lib/actions/login-otp';
import type { OtpVerdict } from '@/lib/auth-flow';

/** Tanda centang yang digambar setelah kode benar, sebelum berpindah halaman. */
function SuccessMark() {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div className="relative grid h-20 w-20 place-items-center">
        <span aria-hidden className="pbk-ripple absolute inset-0 rounded-full bg-brand-500" />
        <span className="pbk-pop relative grid h-20 w-20 place-items-center rounded-full bg-brand-500">
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              className="pbk-draw"
              stroke="#1a1a1a"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      <p className="pbk-rise kasera-heading mt-5 text-[17px] text-ink">Berhasil Masuk</p>
      <p className="pbk-rise mt-1 text-[13px] text-ink-soft">Menyiapkan halaman Anda…</p>
    </div>
  );
}

/**
 * Tahap kedua masuk: kode verifikasi diminta dalam modal di atas halaman
 * masuk, bukan di halaman terpisah. Cookie challenge tetap ditulis server,
 * jadi memuat ulang halaman tetap menemukan tahap yang sedang berjalan dan
 * membuka modal ini lagi.
 */
export function TokenModal({
  challengeId,
  hint,
  bootstrap,
  onCancel,
}: {
  challengeId: string;
  hint: string | null;
  /** Akun tanpa faktor kedua: tidak ada kode untuk diisi, diteruskan sendiri. */
  bootstrap: boolean;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState<OtpVerdict | undefined, FormData>(submitOtp, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  // Effect di React Strict Mode dijalankan dua kali pada mount. Tanpa penjaga
  // ini, challenge bootstrap dikirim dua kali: pengiriman pertama memakainya,
  // yang kedua menemukannya sudah terpakai dan menggagalkan login yang
  // sebenarnya sudah berhasil. Ref bertahan lintas pemanggilan effect.
  const autoSubmitted = useRef(false);
  const router = useRouter();
  const done = state?.ok === true;

  useEffect(() => {
    // Akun bootstrap tidak punya kode: formnya mengirim dirinya sendiri
    // begitu modal muncul, sehingga tamu tidak pernah melihat kolom kode.
    if (!bootstrap) {
      codeRef.current?.focus();
      return;
    }
    if (autoSubmitted.current) return;
    autoSubmitted.current = true;
    formRef.current?.requestSubmit();
  }, [bootstrap]);

  useEffect(() => {
    if (!done) return;
    // Jeda hanya selama animasinya; tujuannya ditentukan server, bukan di sini.
    const to = state.to;
    const timer = setTimeout(() => router.replace(to), 1100);
    return () => clearTimeout(timer);
  }, [done, state, router]);

  useEffect(() => {
    // Challenge bootstrap bisa saja sudah terpakai saat modal ini muncul.
    // Tidak ada yang tersisa untuk diteruskan, jadi kembalikan ke awal
    // daripada menampilkan modal tanpa kolom kode yang pasti gagal.
    if (bootstrap && state && !state.ok) onCancel();
  }, [bootstrap, state, onCancel]);

  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [done, onCancel]);

  return (
    <div className="animate-pbkin fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Verifikasi Masuk"
        className="w-full max-w-[400px] rounded-card border border-gray-200 border-t-4 border-t-brand-500 bg-white p-7 shadow-2xl max-[420px]:p-5"
      >
        {done ? (
          <SuccessMark />
        ) : bootstrap ? (
          <div className="py-4 text-center">
            <p className="kasera-heading text-[16px] text-ink">Menyelesaikan Masuk</p>
            <p className="mt-1 text-[13px] text-ink-soft">Mohon tunggu sebentar.</p>
            <form ref={formRef} action={formAction} className="hidden">
              <input type="hidden" name="challengeId" value={challengeId} />
            </form>
          </div>
        ) : (
          <form ref={formRef} action={formAction}>
            <h2 className="kasera-heading text-[19px] text-ink">Verifikasi Masuk</h2>
            <p className="mb-5 mt-1 text-[13px] leading-relaxed text-ink-soft">{hint}</p>

            <input type="hidden" name="challengeId" value={challengeId} />

            <label htmlFor="code" className="mb-1.5 block text-xs font-semibold text-gray-700">
              Kode Verifikasi
            </label>
            <input
              ref={codeRef}
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              className="mb-3.5 h-[52px] w-full rounded-control border border-gray-300 text-center font-mono text-[22px] tracking-[10px] text-ink"
            />

            {state && !state.ok && state.message && (
              <p role="alert" className="mb-3 rounded-lg bg-error-50 px-3 py-2 text-[12.5px] text-error-600">
                {state.message}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="h-11 w-full rounded-control bg-brand-500 text-sm font-semibold text-ink hover:bg-brand-600 disabled:opacity-60"
            >
              {pending ? 'Memeriksa…' : 'Verifikasi'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="mt-2 h-10 w-full rounded-control text-[12.5px] font-semibold text-ink-soft hover:bg-gray-50"
            >
              Batal
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
