'use client';

import { useActionState } from 'react';
import { confirmEnrollment } from '@/lib/actions/totp-enroll';

export function EnrollForm({ secret, qrDataUri }: { secret: string; qrDataUri: string }) {
  const [error, formAction, pending] = useActionState(confirmEnrollment, undefined);

  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-5 flex justify-center rounded-xl border border-gray-200 bg-white p-6">
        {/* Server-generated data: URI, not a remote image — a plain <img> is correct here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUri} alt="Kode QR pendaftaran TOTP" width={200} height={200} />
      </div>

      <label htmlFor="manualSecret" className="mb-1.5 block text-xs font-semibold text-gray-700">
        Kode Manual (bila kamera tidak dapat memindai)
      </label>
      <input
        id="manualSecret"
        readOnly
        value={secret}
        className="mb-5 h-[42px] w-full rounded-lg border border-gray-300 bg-gray-50 px-3 font-mono text-[13px] tracking-[1.5px] text-gray-900"
      />

      <form action={formAction}>
        <input type="hidden" name="secret" value={secret} />

        <label htmlFor="code" className="mb-1.5 block text-xs font-semibold text-gray-700">
          Kode dari Aplikasi Authenticator
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
          className="h-11 w-full rounded-lg bg-brand-500 text-sm font-semibold text-ink hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? 'Memproses…' : 'Aktifkan'}
        </button>
      </form>
    </div>
  );
}
