import type { CategoryStatus, Role } from '@prisma/client';

export type SeedCategory = {
  code: string;
  name: string;
  description: string;
  status: CategoryStatus;
};

export const ACTIVITY_CATEGORIES: SeedCategory[] = [
  { code: 'OUT', name: 'Outclass', description: 'Kegiatan outing class per tingkat', status: 'AKTIF' },
  { code: 'KGT', name: 'Kegiatan Sekolah', description: 'Acara internal sekolah', status: 'AKTIF' },
  { code: 'ST', name: 'Study Tour', description: 'Kunjungan edukatif luar kota', status: 'AKTIF' },
  { code: 'LMB', name: 'Lomba & Kompetisi', description: 'Pembiayaan lomba antar sekolah', status: 'NONAKTIF' },
];

export const EXPENSE_CATEGORIES: SeedCategory[] = [
  { code: 'TRP', name: 'Transportasi', description: 'Sewa bus, BBM, parkir', status: 'AKTIF' },
  { code: 'KNS', name: 'Konsumsi', description: 'Makan, snack, air minum', status: 'AKTIF' },
  { code: 'TKT', name: 'Tiket', description: 'Tiket masuk lokasi kegiatan', status: 'AKTIF' },
  { code: 'PNG', name: 'Penginapan', description: 'Hotel, homestay, villa', status: 'AKTIF' },
  { code: 'DOK', name: 'Dokumentasi', description: 'Fotografer, cetak foto, video', status: 'AKTIF' },
  { code: 'ATK', name: 'ATK', description: 'Alat tulis, banner, name tag', status: 'AKTIF' },
  { code: 'HNR', name: 'Honor', description: 'Honor pendamping dan petugas', status: 'AKTIF' },
  { code: 'LNL', name: 'Lain-lain', description: 'Pengeluaran tidak terkategori', status: 'AKTIF' },
  { code: 'SVN', name: 'Souvenir', description: 'Cinderamata peserta', status: 'NONAKTIF' },
];

export const SEED_ADMIN: {
  username: string;
  name: string;
  role: Role;
  phone: string | null;
} = {
  username: 'admin',
  name: 'Administrator',
  role: 'SUPERADMIN',
  phone: null,
};
