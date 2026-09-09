import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Tanpa penjaga ini, DATABASE_URL yang kosong membuat `pg.Pool` diam-diam
// jatuh ke variabel ambien PG* (PGHOST, PGPORT, ...) dan pengguna melihat
// `ECONNREFUSED 127.0.0.1:5432` — galat yang tidak menyebut apa yang
// sebenarnya salah. Gagal cepat dengan pesan yang jelas sebagai gantinya.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL belum diisi. Set di .env (pengembangan lokal) atau di ' +
      'environment container (produksi) — lihat .env.example.',
  );
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
