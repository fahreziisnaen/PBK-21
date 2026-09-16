'use client';

import { useActionState } from 'react';
import { requestReset } from '@/lib/actions/forgot-password';

export function RequestResetForm() {
  const [error, formAction, pending] = useActionState(requestReset, undefined);

  return (
    <form action={formAction} className="w-full max-w-[376px]">
      <h1 className="mb-1.5 text-xl font-bold tracking-[-0.3px]">Lupa Sandi</h1>
      <p className="mb-6 text-[12.5px] text-gray-500">
        Masukkan username Anda. Kode akan dikirim melalui aplikasi autentikator atau WhatsApp,
        sesuai pengaturan akun Anda.
      </p>

      <label htmlFor="username" className="mb-1.5 block text-xs font-semibold text-gray-700">
        Username
      </label>
      <input
        id="username"
        name="username"
        type="text"
        autoComplete="username"
        required
        className="mb-4 h-[42px] w-full rounded-lg border border-gray-300 px-3 text-[13.5px]"
      />

      {error ? (
        <p role="status" className="mb-3 text-[12.5px] text-gray-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-[42px] w-full rounded-lg bg-brand-500 text-[13.5px] font-semibold text-ink hover:bg-brand-600 disabled:opacity-60"
      >
        {pending ? 'Mengirim…' : 'Kirim Kode'}
      </button>

      <a href="/login" className="mt-4 block text-center text-[12.5px] font-semibold text-brand-700 hover:text-brand-800">
        Kembali ke halaman masuk
      </a>
    </form>
  );
}
