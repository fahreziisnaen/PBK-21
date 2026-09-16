import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRouteMeta, ROUTES, type RouteMeta } from '@/lib/routes';
import { NAV_GROUPS } from '@/lib/nav';

describe('ROUTES', () => {
  it('mendaftarkan 26 route', () => {
    expect(Object.keys(ROUTES)).toHaveLength(26);
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
    expect(getRouteMeta('/siswa/abc123').title).toBe('Detail Peserta');
    expect(getRouteMeta('/pembayaran/xyz').title).toBe('Detail Pembayaran');
  });

  it('jatuh ke Dashboard untuk path tak dikenal', () => {
    expect(getRouteMeta('/entah').title).toBe('Dashboard');
  });

  describe('route dinamis bersarang (kedalaman > 2)', () => {
    // Tabel route kustom — plan 03 belum mendaftarkan '/master/kegiatan/[id]'
    // ke ROUTES sungguhan, jadi algoritme prefix diuji lewat parameter
    // `routes` yang bisa disuntik, bukan lewat data produksi.
    const routes: Record<string, RouteMeta> = {
      '/dashboard': { title: 'Dashboard', subtitle: '', crumbs: ['Dashboard'] },
      '/master/kegiatan/[id]': { title: 'Detail Kegiatan', subtitle: '', crumbs: ['Master Data', 'Kegiatan', 'Detail'] },
    };

    it('mencocokkan prefix /{…}/[id] pada kedalaman 3', () => {
      expect(getRouteMeta('/master/kegiatan/abc123', routes).title).toBe('Detail Kegiatan');
    });

    it('tidak mencocokkan prefix parsial yang salah dan tetap jatuh ke Dashboard', () => {
      expect(getRouteMeta('/master/kategori-kegiatan/abc123', routes).title).toBe('Dashboard');
      expect(getRouteMeta('/lain/master/kegiatan/abc123', routes).title).toBe('Dashboard');
    });
  });

  describe('console.warn saat fallback', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('mencetak console.warn saat fallback di luar production', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      getRouteMeta('/tidak-terdaftar');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('/tidak-terdaftar');
    });

    it('tidak mencetak apa pun di production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      getRouteMeta('/tidak-terdaftar');
      expect(warn).not.toHaveBeenCalled();
    });

    it('tidak mencetak apa pun untuk path yang berhasil dicocokkan', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      getRouteMeta('/dashboard');
      expect(warn).not.toHaveBeenCalled();
    });
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
