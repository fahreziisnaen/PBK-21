import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ACTIVITY_CATEGORIES, EXPENSE_CATEGORIES } from './seed-data';

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

  await prisma.user.upsert({
    where: { email: 'anggi.prawita@sman21sby.sch.id' },
    update: {},
    create: {
      name: 'Anggi Prawita',
      email: 'anggi.prawita@sman21sby.sch.id',
      nip: '19870412 201003 2 004',
      phone: '0812-3344-5566',
      role: 'BENDAHARA',
      passwordHash: await bcrypt.hash('pbk-demo-2026', 10),
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
