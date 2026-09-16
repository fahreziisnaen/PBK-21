export type NavItem = { label: string; href: string };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { label: 'DASHBOARD', items: [{ label: 'Dashboard', href: '/dashboard' }] },
  {
    label: 'KEUANGAN',
    items: [
      { label: 'Pembayaran', href: '/pembayaran' },
      { label: 'Pengeluaran', href: '/pengeluaran' },
      { label: 'Buku Kas', href: '/buku-kas' },
    ],
  },
  {
    label: 'DATA',
    items: [
      { label: 'Data Peserta', href: '/siswa' },
      { label: 'Rekap Pembayaran', href: '/rekap' },
    ],
  },
  {
    label: 'MASTER DATA',
    items: [
      // Berpasangan dari yang melandasi ke yang bergantung padanya:
      // tahun pelajaran → kelas → siswa, lalu kategori → kegiatan.
      // Naik Kelas paling bawah: aksi tahunan yang mengubah seluruh data,
      // jadi tidak diletakkan berdampingan dengan menu harian.
      { label: 'Tahun Pelajaran', href: '/master/tahun-pelajaran' },
      { label: 'Kelas', href: '/master/kelas' },
      { label: 'Data Siswa', href: '/master/siswa' },
      { label: 'Kategori Kegiatan', href: '/master/kategori-kegiatan' },
      { label: 'Kategori Pengeluaran', href: '/master/kategori-pengeluaran' },
      { label: 'Kegiatan', href: '/master/kegiatan' },
      { label: 'Naik Kelas', href: '/master/naik-kelas' },
    ],
  },
  {
    label: 'LAPORAN',
    items: [
      { label: 'Laporan Keuangan', href: '/laporan/keuangan' },
      { label: 'Laporan Pembayaran', href: '/laporan/pembayaran' },
    ],
  },
  {
    label: 'ADMINISTRASI',
    items: [
      { label: 'Kuitansi', href: '/kuitansi' },
      { label: 'Pengaturan Kegiatan', href: '/pengaturan' },
      { label: 'Pengguna', href: '/pengguna' },
      { label: 'Backup & Reset', href: '/pemeliharaan' },
    ],
  },
  { label: 'SISTEM', items: [{ label: 'Status & Komponen', href: '/states' }] },
];
