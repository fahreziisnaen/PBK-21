'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { filterFull, filterHalf, filterRow, input } from '@/lib/ui';

export type FilterClass = { id: string; name: string; grade: string };
export type FilterOption = { value: string; label: string };

/**
 * Baris penyaring yang menerapkan dirinya sendiri — tanpa tombol Terapkan.
 *
 * Daftar kelas menyusut mengikuti tingkat yang dipilih: menawarkan kelas XII
 * sementara tingkat X sedang disaring hanya menghasilkan tabel kosong, dan
 * pengguna tidak punya cara tahu kenapa. Kelas yang sudah terpilih ikut
 * dibersihkan bila tidak lagi masuk tingkat barunya.
 */
export function FilterBar({
  classes,
  statusOptions,
  statusLabel = 'Status',
  searchPlaceholder = 'Cari nama atau NIS…',
  defaultStatus = '',
}: {
  classes: FilterClass[];
  statusOptions: FilterOption[];
  statusLabel?: string;
  searchPlaceholder?: string;
  /** Nilai status yang dianggap bawaan; dipakai menentukan tombol Reset muncul. */
  defaultStatus?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const q = params.get('q') ?? '';
  const grade = params.get('grade') ?? '';
  const kelas = params.get('kelas') ?? '';
  const status = params.get('status') ?? defaultStatus;

  // Kotak pencarian dikendalikan lokal supaya ketikan tidak hilang saat URL
  // diperbarui; perubahannya ditunda sesaat agar tidak satu permintaan per huruf.
  const [text, setText] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  const firstRender = useRef(true);
  // Disesuaikan ketika render, bukan lewat effect: `q` berubah saat tombol
  // Reset menekan URL, dan kotaknya harus ikut kosong pada render yang sama.
  if (syncedQ !== q) {
    setSyncedQ(q);
    setText(q);
  }

  function push(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    start(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (text === q) return;
    const timer = setTimeout(() => push({ q: text }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const visibleClasses = grade ? classes.filter((c) => c.grade === grade) : classes;
  const dirty = Boolean(q || grade || kelas) || status !== defaultStatus;

  return (
    <div data-noprint className={`${filterRow} mb-3 ${pending ? 'opacity-70' : ''}`}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label="Cari"
        className={`${input} max-w-[260px] ${filterFull}`}
      />

      <select
        value={grade}
        aria-label="Tingkat"
        className={`${input} max-w-[185px] ${filterHalf}`}
        onChange={(e) => {
          const next = e.target.value;
          // Kelas yang tidak lagi masuk tingkat baru dilepas bersamaan, dalam
          // satu perubahan URL — kalau dibiarkan, hasilnya pasti kosong.
          const stillValid = classes.some((c) => c.name === kelas && (!next || c.grade === next));
          push({ grade: next, kelas: stillValid ? kelas : '' });
        }}
      >
        <option value="">Semua tingkat</option>
        <option value="X">Tingkat X</option>
        <option value="XI">Tingkat XI</option>
        <option value="XII">Tingkat XII</option>
      </select>

      <select
        value={kelas}
        aria-label="Kelas"
        className={`${input} max-w-[205px] ${filterHalf}`}
        onChange={(e) => push({ kelas: e.target.value })}
      >
        <option value="">{grade ? `Semua kelas tingkat ${grade}` : 'Semua kelas'}</option>
        <option value="-">— Tanpa kelas —</option>
        {visibleClasses.map((c) => (
          <option key={c.id} value={c.name}>{c.name}</option>
        ))}
      </select>

      <select
        value={status}
        aria-label={statusLabel}
        className={`${input} max-w-[205px] ${filterHalf}`}
        onChange={(e) => push({ status: e.target.value })}
      >
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {dirty && (
        <button
          type="button"
          onClick={() => start(() => router.replace(pathname, { scroll: false }))}
          className="text-[12.5px] font-semibold text-brand-700 hover:text-brand-800 max-[640px]:justify-self-start"
        >
          Reset
        </button>
      )}
    </div>
  );
}
