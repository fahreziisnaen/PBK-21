'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { submitOtp } from '@/lib/actions/login-otp';

export function VerifyForm({
  challengeId,
  hint,
  autoSubmit = false,
}: {
  challengeId: string;
  hint: string | null;
  autoSubmit?: boolean;
}) {
  const [error, formAction, pending] = useActionState(submitOtp, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    // A bootstrap challenge has no code to wait for — the form submits
    // itself the instant it mounts, so the guest never sees a code field.
    if (autoSubmit) formRef.current?.requestSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The bootstrap challenge might already be spent by the time this
    // client mounts (a narrow race with the server-side check in
    // page.tsx, which already redirects a dead challenge straight to
    // /login before ever rendering this branch). If the auto-submit still
    // comes back with an error instead of a redirect, there is nothing
    // left to forward — leaving the guest on this codeless form would risk
    // a redirect loop, so send them back to /login to start over instead.
    if (autoSubmit && error) router.replace('/login');
  }, [autoSubmit, error, router]);

  if (autoSubmit) {
    return (
      <div className="w-full max-w-[376px]">
        <h1 className="mb-1.5 text-[26px] font-bold tracking-[-0.7px]">Menyelesaikan masuk…</h1>
        <p className="mb-6 text-[13.5px] leading-relaxed text-gray-500">Mohon tunggu sebentar.</p>
        <form ref={formRef} action={formAction} className="hidden">
          <input type="hidden" name="challengeId" value={challengeId} />
        </form>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="w-full max-w-[376px]">
      <h1 className="mb-1.5 text-[26px] font-bold tracking-[-0.7px]">Verifikasi Masuk</h1>
      <p className="mb-6 text-[13.5px] leading-relaxed text-gray-500">{hint}</p>

      <input type="hidden" name="challengeId" value={challengeId} />

      <label htmlFor="code" className="mb-1.5 block text-xs font-semibold text-gray-700">
        Kode Verifikasi
      </label>
      <input
        id="code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        className="mb-3.5 h-[42px] w-full rounded-lg border border-gray-300 px-3 text-[13.5px] tracking-[4px]"
      />

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-error-50 px-3 py-2 text-[12.5px] text-error-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-lg bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? 'Memproses…' : 'Verifikasi'}
      </button>
    </form>
  );
}
