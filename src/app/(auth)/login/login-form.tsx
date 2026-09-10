'use client';

import { useActionState } from 'react';
import { startLogin } from '@/lib/actions/login-password';

export function LoginForm() {
  const [error, formAction, pending] = useActionState(startLogin, undefined);

  return (
    <form action={formAction} className="w-full max-w-[376px]">
      <h1 className="mb-1.5 text-[26px] font-bold tracking-[-0.7px]">Masuk ke PBK</h1>
      <p className="mb-6 text-[13.5px] leading-relaxed text-gray-500">
        Gunakan akun bendahara atau administrator yang terdaftar di sekolah Anda.
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

      <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-gray-700">
        Kata Sandi
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        className="mb-3.5 h-[42px] w-full rounded-lg border border-gray-300 px-3 text-[13.5px]"
      />

      <div className="mb-5 flex items-center justify-end">
        <a href="/lupa-sandi" className="text-[12.5px] font-semibold text-brand-600 hover:text-brand-700">
          Lupa sandi?
        </a>
      </div>

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
        {pending ? 'Memproses…' : 'Masuk'}
      </button>
    </form>
  );
}
