export type Tone = 'success' | 'warn' | 'error' | 'neutral';

// Nilai enum Prisma (lihat prisma/schema.prisma) yang bersifat status, ke
// label tampilan berbahasa Indonesia yang dipakai prototipe. Union dari
// ActivityStatus, CategoryStatus, PaymentStatus, dan ExpenseStatus — persis
// tujuh nilai: DRAFT, AKTIF, SELESAI, ARSIP, NONAKTIF, SAH, DIBATALKAN.
const ENUM_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  AKTIF: 'Aktif',
  SELESAI: 'Selesai',
  ARSIP: 'Arsip',
  NONAKTIF: 'Nonaktif',
  SAH: 'Sah',
  DIBATALKAN: 'Dibatalkan',
};

const TONES: Record<string, Tone> = {
  Lunas: 'success', Aktif: 'success', Sah: 'success',
  'Belum Lunas': 'warn', Draft: 'warn',
  'Belum Bayar': 'error', Dibatalkan: 'error', Nonaktif: 'error',
  Arsip: 'neutral', Selesai: 'neutral',
};

/**
 * Menerjemahkan status ke label tampilan berbahasa Indonesia. Menerima baik
 * nilai enum Prisma mentah (mis. 'AKTIF') maupun label tampilan yang sudah
 * dalam bahasa Indonesia (mis. 'Aktif', atau status komputasi seperti
 * 'Lunas' yang tidak berasal dari enum) — nilai yang tidak dikenali
 * dikembalikan apa adanya (identity).
 */
export function statusLabel(status: string): string {
  return ENUM_LABELS[status] ?? status;
}

export function statusTone(status: string): Tone {
  return TONES[statusLabel(status)] ?? 'neutral';
}
