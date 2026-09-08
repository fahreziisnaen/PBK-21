export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] as const;

export const MONFULL = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const;

export function rp(n: number): string {
  return 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
}

export function rpShort(n: number): string {
  const v = n || 0;
  if (v >= 1_000_000) {
    return 'Rp' + (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace('.', ',') + ' jt';
  }
  if (v >= 1_000) return 'Rp' + Math.round(v / 1_000) + ' rb';
  return 'Rp' + v;
}

export function fdate(iso: string): string {
  if (!iso) return '-';
  const p = iso.split('-');
  return `${p[2]} ${MON[Number(p[1]) - 1]} ${p[0]}`;
}

export function fdateLong(iso: string): string {
  if (!iso) return '-';
  const p = iso.split('-');
  return `${p[2]} ${MONFULL[Number(p[1]) - 1]} ${p[0]}`;
}

const SATUAN = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima',
  'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas',
];

function eja(x: number): string {
  if (x < 12) return SATUAN[x];
  if (x < 20) return SATUAN[x - 10] + ' belas';
  if (x < 100) return SATUAN[Math.floor(x / 10)] + ' puluh ' + eja(x % 10);
  if (x < 200) return 'seratus ' + eja(x - 100);
  if (x < 1000) return SATUAN[Math.floor(x / 100)] + ' ratus ' + eja(x % 100);
  if (x < 2000) return 'seribu ' + eja(x - 1000);
  if (x < 1_000_000) return eja(Math.floor(x / 1000)) + ' ribu ' + eja(x % 1000);
  return eja(Math.floor(x / 1_000_000)) + ' juta ' + eja(x % 1_000_000);
}

export function terbilang(n: number): string {
  const v = Math.round(n || 0);
  if (v === 0) return 'Nol rupiah';
  const t = eja(v).replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1) + ' rupiah';
}

export function padSeq(n: number, width: number): string {
  return String(n).padStart(width, '0');
}
