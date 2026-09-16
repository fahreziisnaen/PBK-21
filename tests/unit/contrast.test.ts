import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Kontras palet KASERA diukur, bukan dikira-kira. Kuning brand #FFC107 di atas
 * putih hanya 1,64:1 — kalau suatu saat ada yang memakainya sebagai warna teks,
 * berkas ini yang menolak lebih dulu.
 *
 * Nilai warnanya dibaca dari globals.css, jadi menyetel ulang palet tanpa
 * memeriksa kontras akan menggagalkan uji ini, bukan lolos diam-diam.
 */

// Relatif terhadap akar proyek, sama seperti prisma-schema.test.ts.
const css = readFileSync('src/app/globals.css', 'utf8');

function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`Token --color-${name} tidak ada di globals.css`);
  return m[1];
}

/** Luminansi relatif menurut WCAG 2.1. */
export function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rasio kontras WCAG antara dua warna, 1:1 sampai 21:1. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#ffffff';

describe('rasio kontras', () => {
  it('menghitung sesuai contoh yang diketahui', () => {
    expect(contrast('#000000', WHITE)).toBeCloseTo(21, 1);
    expect(contrast(WHITE, WHITE)).toBeCloseTo(1, 5);
  });
});

describe('palet KASERA memenuhi WCAG AA', () => {
  // Pasangan teks/latar yang benar-benar dipakai di aplikasi.
  const teksNormal: [string, string, string][] = [
    ['teks utama di atas putih', token('ink'), WHITE],
    ['teks sekunder di atas putih', token('ink-soft'), WHITE],
    ['teks utama di atas latar aplikasi', token('ink'), token('body-bg')],
    ['teks brand di atas putih', token('brand-700'), WHITE],
    ['teks brand di atas chip brand', token('brand-700'), token('brand-50')],
    ['teks pada tombol utama', token('ink'), token('brand-500')],
    ['teks pada tombol hover', token('ink'), token('brand-600')],
    ['teks galat di atas putih', token('error-600'), WHITE],
    ['teks galat di atas latar galat', token('error-600'), token('error-50')],
    ['teks peringatan di atas latar peringatan', token('warn-700'), token('warn-50')],
    ['teks sukses di atas latar sukses', token('success-700'), token('success-50')],
    ['putih di atas merah aksen', WHITE, token('accent-500')],
    ['nav tidak aktif di atas sidebar', token('sidebar-fg'), token('sidebar')],
    ['nav aktif: teks hitam di atas kuning', token('ink'), token('brand-500')],
    ['judul grup nav di atas sidebar', token('sidebar-muted'), token('sidebar')],
  ];

  it.each(teksNormal)('%s lolos 4,5:1', (_nama, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  // Indikator non-teks (garis fokus, pembatas berarti) cukup 3:1.
  it('garis fokus terlihat di atas putih', () => {
    expect(contrast(token('brand-700'), WHITE)).toBeGreaterThanOrEqual(3);
  });

  it('kuning brand terlalu terang untuk teks di atas putih — justru itu alasan brand-700 ada', () => {
    // Menjaga asumsinya: kalau suatu hari #FFC107 digelapkan sampai lolos AA,
    // pemisahan token ini boleh ditinjau ulang. Sampai saat itu, jangan dipakai.
    expect(contrast(token('brand-500'), WHITE)).toBeLessThan(4.5);
  });

  it('tidak ada teks putih di atas kuning brand', () => {
    expect(contrast(WHITE, token('brand-500'))).toBeLessThan(4.5);
  });
});
