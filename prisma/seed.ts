import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ACTIVITY_CATEGORIES, EXPENSE_CATEGORIES, SEED_ADMIN } from './seed-data';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.school.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', name: 'SMAN 21 Surabaya', fiscalYear: 2026 },
  });

  for (const c of ACTIVITY_CATEGORIES) {
    await prisma.activityCategory.upsert({ where: { code: c.code }, update: {}, create: c });
  }
  for (const c of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({ where: { code: c.code }, update: {}, create: c });
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD belum diisi. Set di .env (pengembangan lokal) atau di ' +
        'environment container (produksi) — lihat .env.example. Tidak ada nilai ' +
        'baku: sandi awal tidak boleh tersimpan di repositori.',
    );
  }

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

  // Kegiatan starter — supaya context-switcher punya isi sebelum Plan 03
  // membangun CRUD kegiatan. Aman dihapus lewat UI setelah itu.
  const out = await prisma.activityCategory.findUniqueOrThrow({ where: { code: 'OUT' } });
  const existing = await prisma.activity.findFirst({ where: { receiptPrefix: 'OC-X' } });
  if (!existing) {
    await prisma.activity.create({
      data: {
        name: 'Outing Class X 2026',
        categoryId: out.id,
        year: 2026,
        startDate: new Date('2026-09-19'),
        endDate: new Date('2026-09-20'),
        location: 'Batu, Malang',
        description: 'Outing class tingkat X dengan agenda edukasi dan penguatan karakter.',
        contribution: 250_000,
        participantTarget: 100,
        chairperson: 'Rudi Hartono, S.Pd.',
        status: 'AKTIF',
        receiptPrefix: 'OC-X',
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
