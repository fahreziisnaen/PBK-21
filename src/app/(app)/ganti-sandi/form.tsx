'use client';

import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { useActionState } from 'react';
import { changePassword } from '@/lib/actions/change-password';

export function ChangePasswordForm() {
  const [error, formAction, pending] = useActionState(changePassword, undefined);

  return (
    <form action={formAction} className="w-full max-w-[420px]">
      <label htmlFor="oldPassword" className="mb-1.5 block text-xs font-semibold text-gray-700">
        Sandi Lama
      </label>
      <input
        id="oldPassword"
        name="oldPassword"
        type="password"
        autoComplete="current-password"
        required
        className="mb-4 h-[42px] w-full rounded-lg border border-gray-300 px-3 text-[13.5px]"
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
        minLength={MIN_PASSWORD_LENGTH}
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
        minLength={MIN_PASSWORD_LENGTH}
        className="mb-3.5 h-[42px] w-full rounded-lg border border-gray-300 px-3 text-[13.5px]"
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
        {pending ? 'Menyimpan…' : 'Simpan Sandi Baru'}
      </button>
    </form>
  );
}
