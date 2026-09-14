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
      { label: 'Data Siswa', href: '/siswa' },
      { label: 'Rekap Pembayaran', href: '/rekap' },
    ],
  },
  {
    label: 'MASTER DATA',
    items: [
      { label: 'Kategori Kegiatan', href: '/master/kategori-kegiatan' },
      { label: 'Kategori Pengeluaran', href: '/master/kategori-pengeluaran' },
      { label: 'Kegiatan', href: '/master/kegiatan' },
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
    ],
  },
  { label: 'SISTEM', items: [{ label: 'Status & Komponen', href: '/states' }] },
];
