export type RouteMeta = { title: string; subtitle: string; crumbs: string[] };

export const ROUTES: Record<string, RouteMeta> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Ringkasan keuangan kegiatan terpilih', crumbs: ['Dashboard'] },
  '/siswa': { title: 'Data Siswa', subtitle: 'Peserta dan tagihan pada kegiatan aktif — daftar lengkap siswa ada di Master Data › Induk Siswa', crumbs: ['Data', 'Data Siswa'] },
  '/siswa/[id]': { title: 'Detail Siswa', subtitle: 'Riwayat tagihan dan pembayaran', crumbs: ['Data', 'Data Siswa', 'Detail'] },
  '/pembayaran': { title: 'Pembayaran', subtitle: 'Seluruh transaksi penerimaan kontribusi siswa', crumbs: ['Keuangan', 'Pembayaran'] },
  '/pembayaran/[id]': { title: 'Detail Pembayaran', subtitle: 'Rincian satu transaksi pembayaran', crumbs: ['Keuangan', 'Pembayaran', 'Detail'] },
  '/kuitansi': { title: 'Kuitansi', subtitle: 'Pratinjau kuitansi siap cetak', crumbs: ['Administrasi', 'Kuitansi'] },
  '/pengeluaran': { title: 'Pengeluaran', subtitle: 'Belanja kegiatan menurut kategori master', crumbs: ['Keuangan', 'Pengeluaran'] },
  '/buku-kas': { title: 'Buku Kas', subtitle: 'Mutasi kas kronologis kegiatan aktif', crumbs: ['Keuangan', 'Buku Kas'] },
  '/rekap': { title: 'Rekap Pembayaran', subtitle: 'Rekapitulasi per tingkat dan status', crumbs: ['Data', 'Rekap Pembayaran'] },
  '/master/kategori-kegiatan': { title: 'Kategori Kegiatan', subtitle: 'Master kategori untuk pengelompokan kegiatan', crumbs: ['Master Data', 'Kategori Kegiatan'] },
  '/master/kategori-pengeluaran': { title: 'Kategori Pengeluaran', subtitle: 'Master kategori belanja kegiatan', crumbs: ['Master Data', 'Kategori Pengeluaran'] },
  '/master/siswa': { title: 'Induk Siswa', subtitle: 'Seluruh siswa sekolah, lepas dari kegiatan', crumbs: ['Master Data', 'Induk Siswa'] },
  '/master/tahun-pelajaran': { title: 'Tahun Pelajaran', subtitle: 'Tahun ajaran yang berjalan dan riwayatnya', crumbs: ['Master Data', 'Tahun Pelajaran'] },
  '/master/naik-kelas': { title: 'Naik Kelas', subtitle: 'Menaikkan tingkat seluruh siswa dan membuka tahun pelajaran berikutnya', crumbs: ['Master Data', 'Naik Kelas'] },
  '/master/kelas': { title: 'Kelas', subtitle: 'Master kelas dan wali kelas per tingkat', crumbs: ['Master Data', 'Kelas'] },
  '/master/kegiatan': { title: 'Kegiatan', subtitle: 'Seluruh kegiatan sekolah yang dikelola PBK', crumbs: ['Master Data', 'Kegiatan'] },
  '/laporan/keuangan': { title: 'Laporan Keuangan', subtitle: 'Laporan pemasukan, pengeluaran, dan saldo', crumbs: ['Laporan', 'Laporan Keuangan'] },
  '/laporan/pembayaran': { title: 'Laporan Pembayaran', subtitle: 'Laporan tagihan dan pelunasan siswa', crumbs: ['Laporan', 'Laporan Pembayaran'] },
  '/pengaturan': { title: 'Pengaturan Kegiatan', subtitle: 'Konfigurasi kegiatan dan format kuitansi', crumbs: ['Administrasi', 'Pengaturan Kegiatan'] },
  '/pengguna': { title: 'Pengguna', subtitle: 'Kelola akun, peran, dan akses pengguna', crumbs: ['Administrasi', 'Pengguna'] },
  '/pemeliharaan': { title: 'Backup & Reset', subtitle: 'Cadangkan, pulihkan, atau kosongkan data aplikasi', crumbs: ['Administrasi', 'Backup & Reset'] },
  '/profil': { title: 'Profil Pengguna', subtitle: 'Akun dan preferensi pengguna', crumbs: ['Akun', 'Profil'] },
  '/notifikasi': { title: 'Pusat Notifikasi', subtitle: 'Semua peristiwa keuangan dan kegiatan', crumbs: ['Akun', 'Notifikasi'] },
  '/states': { title: 'Status & Komponen', subtitle: 'Empty state, error state, dan dialog konfirmasi', crumbs: ['Sistem', 'Status & Komponen'] },
  '/ganti-sandi': { title: 'Ganti Sandi', subtitle: 'Perbarui sandi akun sebelum melanjutkan', crumbs: ['Akun', 'Ganti Sandi'] },
  '/keamanan/2fa': { title: 'Verifikasi Dua Langkah', subtitle: 'Daftarkan aplikasi authenticator untuk akun Anda', crumbs: ['Akun', 'Keamanan', 'Verifikasi Dua Langkah'] },
};

/**
 * `routes` sengaja bisa disuntik (default: ROUTES) supaya algoritme
 * pencarian prefix bisa diuji dengan data tetap tanpa menunggu route
 * bersarang sungguhan (mis. `/master/kegiatan/[id]`) terdaftar oleh plan
 * berikutnya.
 */
export function getRouteMeta(
  pathname: string,
  routes: Record<string, RouteMeta> = ROUTES,
): RouteMeta {
  const exact = routes[pathname];
  if (exact) return exact;

  // Coba setiap prefix `/{…}/[id]` dari yang terpanjang ke yang terpendek,
  // supaya route detail bersarang (mis. `/master/kegiatan/abc123`, bukan
  // cuma `/siswa/abc123` yang persis dua segmen) juga bisa ditemukan.
  const segments = pathname.split('/').filter(Boolean);
  for (let prefixLen = segments.length - 1; prefixLen >= 1; prefixLen--) {
    const dynamic = routes[`/${segments.slice(0, prefixLen).join('/')}/[id]`];
    if (dynamic) return dynamic;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[routes] Tidak ada RouteMeta terdaftar untuk path "${pathname}"; jatuh ke Dashboard.`);
  }

  return routes['/dashboard'];
}
