'use client';

import { useId, useState } from 'react';

/**
 * Kolom sandi dengan tombol tampilkan/sembunyikan.
 *
 * Tombolnya `type="button"` — tanpa itu ia ikut mengirim formnya saat ditekan,
 * karena tombol di dalam form defaultnya submit.
 */
export function PasswordField({
  name = 'password',
  label = 'Kata Sandi',
  autoComplete = 'current-password',
  required = true,
  className = '',
}: {
  name?: string;
  label?: string;
  autoComplete?: string;
  required?: boolean;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-gray-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          required={required}
          // Ruang di kanan disisakan untuk tombolnya, supaya sandi panjang
          // tidak tertutup ikon mata.
          className="h-[42px] w-full rounded-control border border-gray-300 pl-3 pr-11 text-[13.5px] text-ink"
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          // Sengaja "sandi", bukan "kata sandi": nama yang memuat label
          // kolomnya akan membuat dua kontrol berbeda cocok dengan pencarian
          // aksesibilitas yang sama — membingungkan pembaca layar, dan
          // membuat setiap uji yang mencari "Kata Sandi" menemukan dua hasil.
          aria-label={shown ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
          aria-pressed={shown}
          // Tidak ikut urutan Tab: pengguna papan ketik mengetik sandi lalu
          // menekan Enter, dan tombol ini menyela jalur itu tanpa perlu.
          // Masih bisa dicapai lewat pembaca layar dan tentu saja sentuhan.
          tabIndex={-1}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-control text-gray-500 hover:text-ink"
        >
          {shown ? (
            // Mata dicoret = sedang terlihat, klik untuk menyembunyikan.
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M3 3l18 18" strokeLinecap="round" />
              <path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.5 2-1.4 3.1M6.5 6.8C4.2 8.3 3 10.4 3 12c0 2.5 4 7 9 7 1.7 0 3.2-.5 4.5-1.2" strokeLinecap="round" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M3 12c0-2.5 4-7 9-7s9 4.5 9 7-4 7-9 7-9-4.5-9-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
