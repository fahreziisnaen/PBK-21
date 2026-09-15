import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SEED_ADMIN } from './seed-data';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export async function main() {
  // Checked first, before any database work: no default password may ever
  // exist in the repository, so a missing env var must fail fast.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD belum diisi. Set di .env (pengembangan lokal) atau di ' +
        'environment container (produksi) — lihat .env.example. Tidak ada nilai ' +
        'baku: sandi awal tidak boleh tersimpan di repositori.',
    );
  }

  // Seed ini berjalan di SETIAP deploy, jadi hanya membuat yang wajib ada:
  // identitas sekolah dan akun admin. Kategori dan kegiatan contoh tidak lagi
  // di-seed — kalau di-seed, factory reset akan dibatalkan diam-diam oleh
  // deploy berikutnya, dan data contoh muncul kembali di data master.
  await prisma.school.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', name: 'SMAN 21 Surabaya', fiscalYear: 2026 },
  });


  await prisma.user.upsert({
    where: { username: SEED_ADMIN.username },
    // Empty update: a redeploy must never reset a password the operator changed.
    update: {},
    create: {
      username: SEED_ADMIN.username,
      name: SEED_ADMIN.name,
      role: SEED_ADMIN.role,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      mustChangePassword: true,
    },
  });

}

// Run only when this file is the process entry point (`npx tsx prisma/seed.ts`
// via `prisma db seed`), not when a test imports `main` for inspection.
const isEntryPoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntryPoint) {
  main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
