export type Tone = 'success' | 'warn' | 'error' | 'neutral';

const TONES: Record<string, Tone> = {
  Lunas: 'success', Aktif: 'success', Sah: 'success',
  'Belum Lunas': 'warn', Draft: 'warn',
  'Belum Bayar': 'error', Dibatalkan: 'error', Nonaktif: 'error',
  Arsip: 'neutral', Selesai: 'neutral',
};

export function statusTone(status: string): Tone {
  return TONES[status] ?? 'neutral';
}
