'use client';

import { useActionState } from 'react';
import { completeReset } from '@/lib/actions/forgot-password';

export function CompleteResetForm({ hint }: { hint: string }) {
  const [error, formAction, pending] = useActionState(completeReset, undefined);

  return (
    <form action={formAction} className="w-full max-w-[376px]">
      <h1 className="mb-1.5 text-xl font-bold tracking-[-0.3px]">Masukkan Kode</h1>
      <p className="mb-6 text-[12.5px] text-gray-500">{hint}</p>

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
        className="mb-4 h-[42px] w-full rounded-lg border border-gray-300 px-3 text-[13.5px] tracking-[3px]"
      />

      <label htmlFor="newPassword" className="mb-1.5 block text-xs font-semibold text-gray-700">
        Sandi Baru
      </label>
      <input
        id="newPassword"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        className="mb-4 h-[42px] w-full rounded-lg border border-gray-300 px-3 text-[13.5px]"
      />

      <label htmlFor="confirmPassword" className="mb-1.5 block text-xs font-semibold text-gray-700">
        Konfirmasi Sandi Baru
      </label>
      <input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        className="mb-4 h-[42px] w-full rounded-lg border border-gray-300 px-3 text-[13.5px]"
      />

      {error ? (
        <p role="alert" className="mb-3 rounded-lg bg-error-50 px-3 py-2 text-[12.5px] text-error-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-[42px] w-full rounded-lg bg-brand-600 text-[13.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? 'Menyimpan…' : 'Simpan Sandi Baru'}
      </button>
    </form>
  );
}
