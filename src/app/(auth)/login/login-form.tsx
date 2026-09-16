'use client';

import { useActionState, useState, useTransition } from 'react';
import { cancelLoginChallenge } from '@/lib/actions/cancel-login';
import { startLogin } from '@/lib/actions/login-password';
import type { LoginStart } from '@/lib/auth-flow';
import { TokenModal } from './TokenModal';

export function LoginForm({ resume }: { resume?: Extract<LoginStart, { ok: true }> }) {
  const [state, formAction, pending] = useActionState<LoginStart | undefined, FormData>(startLogin, undefined);
  const [cancelled, setCancelled] = useState(false);
  const [, startCancel] = useTransition();

  // Dibatalkan menang atas keduanya: tanpa urutan ini, hasil startLogin yang
  // masih tersimpan di state akan terus membuka modalnya walau sudah ditutup.
  const stage = cancelled ? undefined : state?.ok ? state : resume;
  const error = state && !state.ok ? state.message : undefined;

  return (
    <>
    <form action={formAction} className="w-full">
      <h1 className="kasera-heading mb-1.5 text-[26px] text-ink">Masuk ke KASERA</h1>
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
        <a href="/lupa-sandi" className="text-[12.5px] font-semibold text-brand-700 hover:text-brand-800">
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
        className="h-11 w-full rounded-lg bg-brand-500 text-sm font-semibold text-ink hover:bg-brand-600 disabled:opacity-60"
      >
        {pending ? 'Memproses…' : 'Masuk'}
      </button>
    </form>

    {stage && (
      <TokenModal
        key={stage.challengeId}
        challengeId={stage.challengeId}
        hint={stage.hint}
        bootstrap={stage.bootstrap}
        onCancel={() =>
          // Ditunggu sampai cookie challenge-nya benar-benar dibuang sebelum
          // modal ditutup. Uji e2e-nya tidak membuktikan ini perlu — tanpa
          // menunggu pun ia lulus, karena assertion Playwright sendiri sudah
          // memberi jeda. Yang dijaga di sini adalah pengguna yang memuat
          // ulang halaman seketika di koneksi lambat.
          startCancel(async () => {
            await cancelLoginChallenge();
            setCancelled(true);
          })
        }
      />
    )}
    </>
  );
}
