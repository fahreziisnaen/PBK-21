'use client';

import { useRef, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Form penyaring laporan yang menerapkan dirinya sendiri saat isiannya berubah.
 *
 * Isiannya tetap dirender di server (daftar kegiatan, kelas, kategori); yang di
 * klien hanya pengirimannya. Nilai kosong tidak ditulis ke URL, supaya tautan
 * laporan yang dibagikan tetap pendek.
 */
export function AutoSubmitForm({ className, children }: { className?: string; children: React.ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  function submit() {
    const form = formRef.current;
    if (!form) return;
    const sp = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === 'string' && value) sp.set(key, value);
    }
    const query = sp.toString();
    start(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function onChange(event: React.FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const form = formRef.current;
    if (!form) return;

    // Kelas yang tidak masuk tingkat barunya dilepas sebelum dikirim — kalau
    // dibiarkan, laporannya pasti kosong dan tidak ada petunjuk kenapa.
    if (target.name === 'grade' && target.value) {
      const kelas = form.elements.namedItem('kelas');
      if (kelas instanceof HTMLSelectElement && kelas.value && kelas.value !== '-') {
        if (kelas.selectedOptions[0]?.dataset.grade !== target.value) kelas.value = '';
      }
    }

    // Kolom tanggal memicu `change` di setiap potongan yang diketik — tahun
    // "2", "20", "202" lalu "2026". Yang belum berupa tanggal utuh ditunggu,
    // dan pengirimannya ditunda sebentar supaya ketikan beruntun jadi satu.
    const isDate = target instanceof HTMLInputElement && target.type === 'date';
    if (isDate && target.value && !(Number(target.value.slice(0, 4)) >= 2000)) return;
    // Kotak pencarian juga ditunda: tanpa itu setiap huruf memuat ulang halaman.
    const isText = target instanceof HTMLInputElement && (target.type === 'text' || target.type === 'search');

    clearTimeout(timer.current);
    timer.current = setTimeout(submit, isDate ? 500 : isText ? 350 : 0);
  }

  return (
    <form
      ref={formRef}
      onChange={onChange}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      data-noprint
      aria-busy={pending}
      className={`${className ?? ''} transition-opacity ${pending ? 'opacity-70' : ''}`}
    >
      {children}
    </form>
  );
}
