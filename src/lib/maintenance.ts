import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Db = Prisma.TransactionClient;
type Row = Record<string, unknown>;
type Delegate = {
  findMany: (args?: unknown) => Promise<Row[]>;
  createMany: (args: { data: Row[] }) => Promise<unknown>;
  deleteMany: (args?: unknown) => Promise<{ count: number }>;
  count: (args?: unknown) => Promise<number>;
};
type Table = { name: string; label: string; of: (db: Db) => Delegate; prepare?: (row: Row) => Row };

/**
 * Tabel yang masuk backup, diurutkan induk lebih dulu: diisi dari atas ke
 * bawah, dihapus dari bawah ke atas, supaya relasi antar tabel tidak pernah
 * menunjuk ke baris yang belum ada.
 *
 * Sengaja TIDAK disertakan: AuthChallenge (kode login sementara, kedaluwarsa
 * dalam 5 menit) dan AuthEvent (log keamanan milik server ini, bukan data
 * sekolah).
 */
const TABLES: Table[] = [
  { name: 'School', label: 'Identitas sekolah', of: (db) => db.school as unknown as Delegate },
  { name: 'AppSetting', label: 'Pengaturan', of: (db) => db.appSetting as unknown as Delegate },
  { name: 'User', label: 'Pengguna', of: (db) => db.user as unknown as Delegate },
  { name: 'ActivityCategory', label: 'Kategori kegiatan', of: (db) => db.activityCategory as unknown as Delegate },
  { name: 'ExpenseCategory', label: 'Kategori pengeluaran', of: (db) => db.expenseCategory as unknown as Delegate },
  { name: 'SchoolClass', label: 'Kelas', of: (db) => db.schoolClass as unknown as Delegate },
  { name: 'Student', label: 'Siswa', of: (db) => db.student as unknown as Delegate },
  { name: 'Activity', label: 'Kegiatan', of: (db) => db.activity as unknown as Delegate },
  { name: 'Participant', label: 'Peserta kegiatan', of: (db) => db.participant as unknown as Delegate },
  { name: 'Payment', label: 'Pembayaran', of: (db) => db.payment as unknown as Delegate },
  { name: 'PaymentProof', label: 'Bukti transfer', of: (db) => db.paymentProof as unknown as Delegate },
  { name: 'Expense', label: 'Pengeluaran', of: (db) => db.expense as unknown as Delegate },
  { name: 'Notification', label: 'Notifikasi', of: (db) => db.notification as unknown as Delegate },
  {
    name: 'AuditLog',
    label: 'Jejak audit',
    of: (db) => db.auditLog as unknown as Delegate,
    // Kolom JSON kosong harus ditulis sebagai DbNull; `null` biasa ditolak Prisma.
    prepare: (row) => ({ ...row, meta: row.meta === null ? Prisma.DbNull : row.meta }),
  },
];

/** Tabel yang dikosongkan factory reset. Pengguna, sekolah, dan pengaturan dipertahankan. */
const RESET_TABLES = new Set([
  'ActivityCategory', 'ExpenseCategory', 'SchoolClass', 'Student', 'Activity',
  'Participant', 'Payment', 'PaymentProof', 'Expense', 'Notification', 'AuditLog',
]);

const LONG_TX = { timeout: 120_000, maxWait: 10_000 };

export type BackupFile = {
  app: 'PBK';
  format: 1;
  migration: string;
  createdAt: string;
  counts: Record<string, number>;
  tables: Record<string, Row[]>;
};

/** Migrasi terakhir yang terpasang — backup hanya bisa dipulihkan ke struktur database yang sama. */
export async function currentMigration(db: Db = prisma): Promise<string> {
  const rows = await db.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name DESC LIMIT 1`;
  return rows[0]?.migration_name ?? 'unknown';
}

export async function dataCounts(): Promise<{ name: string; label: string; count: number; reset: boolean }[]> {
  return Promise.all(
    TABLES.map(async (t) => ({
      name: t.name,
      label: t.label,
      count: await t.of(prisma).count(),
      reset: RESET_TABLES.has(t.name),
    })),
  );
}

export async function createBackup(): Promise<BackupFile> {
  // Satu transaksi supaya semua tabel terbaca dari potret yang sama —
  // pembayaran yang masuk di tengah proses tidak membuat backup setengah jadi.
  return prisma.$transaction(async (tx) => {
    const tables: Record<string, Row[]> = {};
    const counts: Record<string, number> = {};
    for (const t of TABLES) {
      tables[t.name] = await t.of(tx).findMany();
      counts[t.name] = tables[t.name]!.length;
    }
    return { app: 'PBK', format: 1, migration: await currentMigration(tx), createdAt: new Date().toISOString(), counts, tables } as BackupFile;
  }, LONG_TX);
}

export async function restoreBackup(text: string): Promise<{ ok: true; counts: Record<string, number> } | { ok: false; error: string }> {
  let backup: BackupFile;
  try {
    backup = JSON.parse(text) as BackupFile;
  } catch {
    return { ok: false, error: 'File bukan backup PBK yang valid (JSON tidak terbaca). Pastikan file tidak rusak atau terpotong.' };
  }
  if (backup?.app !== 'PBK' || backup.format !== 1 || typeof backup.tables !== 'object')
    return { ok: false, error: 'File ini bukan backup PBK.' };

  const migration = await currentMigration();
  if (backup.migration !== migration)
    return {
      ok: false,
      error: `Backup dibuat dari versi database yang berbeda (${backup.migration}), sedangkan aplikasi ini memakai ${migration}. Pulihkan di versi aplikasi yang sama.`,
    };

  for (const t of TABLES)
    if (!Array.isArray(backup.tables[t.name])) return { ok: false, error: `Backup tidak lengkap: tabel ${t.label} tidak ada.` };

  // Tanpa superadmin aktif, tidak ada yang bisa login untuk mengelola
  // aplikasi setelah restore — satu-satunya jalan keluar tinggal lewat SSH.
  const users = backup.tables.User as { role?: string; isActive?: boolean }[];
  if (!users.some((u) => u.role === 'SUPERADMIN' && u.isActive !== false))
    return { ok: false, error: 'Backup tidak berisi akun superadmin yang aktif, sehingga tidak ada yang bisa login setelah dipulihkan.' };

  await prisma.$transaction(async (tx) => {
    await tx.authChallenge.deleteMany();
    for (const t of [...TABLES].reverse()) await t.of(tx).deleteMany();
    for (const t of TABLES) {
      const rows = backup.tables[t.name]!;
      if (rows.length) await t.of(tx).createMany({ data: t.prepare ? rows.map(t.prepare) : rows });
    }
  }, LONG_TX);

  return { ok: true, counts: Object.fromEntries(TABLES.map((t) => [t.name, backup.tables[t.name]!.length])) };
}

/** Mengosongkan data transaksi dan master. Pengguna, identitas sekolah, dan pengaturan tetap. */
export async function factoryReset(): Promise<Record<string, number>> {
  return prisma.$transaction(async (tx) => {
    const removed: Record<string, number> = {};
    for (const t of [...TABLES].reverse()) {
      if (!RESET_TABLES.has(t.name)) continue;
      removed[t.name] = (await t.of(tx).deleteMany()).count;
    }
    return removed;
  }, LONG_TX);
}

export const TABLE_LABELS = Object.fromEntries(TABLES.map((t) => [t.name, t.label]));
