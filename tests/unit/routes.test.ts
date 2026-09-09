import { describe, expect, it } from 'vitest';
import { getRouteMeta, ROUTES } from '@/lib/routes';
import { NAV_GROUPS } from '@/lib/nav';

describe('ROUTES', () => {
  it('mendaftarkan 18 route', () => {
    expect(Object.keys(ROUTES)).toHaveLength(18);
  });

  it('menyalin judul dan subjudul dari prototipe', () => {
    expect(ROUTES['/dashboard']).toEqual({
      title: 'Dashboard',
      subtitle: 'Ringkasan keuangan kegiatan terpilih',
      crumbs: ['Dashboard'],
    });
    expect(ROUTES['/buku-kas'].subtitle).toBe('Mutasi kas kronologis kegiatan aktif');
    expect(ROUTES['/master/kegiatan'].crumbs).toEqual(['Master Data', 'Kegiatan']);
  });
});

describe('getRouteMeta', () => {
  it('mencocokkan path persis', () => {
    expect(getRouteMeta('/rekap').title).toBe('Rekap Pembayaran');
  });

  it('mencocokkan route detail dinamis', () => {
    expect(getRouteMeta('/siswa/abc123').title).toBe('Detail Siswa');
    expect(getRouteMeta('/pembayaran/xyz').title).toBe('Detail Pembayaran');
  });

  it('jatuh ke Dashboard untuk path tak dikenal', () => {
    expect(getRouteMeta('/entah').title).toBe('Dashboard');
  });
});

describe('NAV_GROUPS', () => {
  it('punya 7 grup dengan label prototipe', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      'DASHBOARD', 'KEUANGAN', 'DATA', 'MASTER DATA', 'LAPORAN', 'ADMINISTRASI', 'SISTEM',
    ]);
  });

  it('hanya menautkan href yang terdaftar di ROUTES', () => {
    for (const g of NAV_GROUPS) {
      for (const it of g.items) expect(ROUTES[it.href]).toBeDefined();
    }
  });
});
