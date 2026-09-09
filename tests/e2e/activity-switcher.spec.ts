import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email / NIP').fill('admin@pbk.local');
  await page.getByLabel('Kata Sandi').fill('pbk-demo-2026');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL(/\/dashboard/);
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('menampilkan kegiatan aktif di header', async ({ page }) => {
  await login(page);

  await expect(page.getByLabel('KEGIATAN')).toBeVisible();
  await expect(page.getByLabel('KEGIATAN')).toContainText('Outing Class X 2026');
});

test('mengganti kegiatan aktif dan tetap tersimpan setelah reload', async ({ page }) => {
  // Tahun/tanggal sengaja dibuat lebih lama supaya kegiatan ini TIDAK menjadi
  // pilihan default (fallback mengurutkan year+startDate desc) — sehingga
  // pergantian yang kita uji benar-benar berasal dari cookie, bukan kebetulan
  // urutan fallback.
  const category = await prisma.activityCategory.findUniqueOrThrow({ where: { code: 'OUT' } });
  const testActivity = await prisma.activity.create({
    data: {
      name: 'Kegiatan Uji E2E Switcher',
      categoryId: category.id,
      year: 2020,
      startDate: new Date('2020-01-10'),
      endDate: new Date('2020-01-11'),
      location: 'Lokasi Uji E2E',
      contribution: 100_000,
      participantTarget: 10,
      status: 'DRAFT',
      receiptPrefix: 'E2E-TST',
    },
  });

  try {
    await login(page);

    const select = page.getByLabel('KEGIATAN');
    // Default sebelum switch harus tetap kegiatan yang sudah AKTIF, bukan kegiatan uji.
    await expect(select).toContainText('Outing Class X 2026');

    await select.selectOption(testActivity.id);
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Ganti' }).click(),
    ]);
    expect(response.ok()).toBeTruthy();
    await expect(select).toHaveValue(testActivity.id);

    // Reload penuh (bukan navigasi client-side) — memaksa Server Component
    // membaca ulang cookie dari awal, membuktikan pilihan benar-benar tersimpan.
    await page.reload();
    await expect(page.getByLabel('KEGIATAN')).toHaveValue(testActivity.id);
  } finally {
    await prisma.activity.delete({ where: { id: testActivity.id } }).catch(() => {});
  }
});

test.describe('lebar ponsel', () => {
  test.use({ viewport: { width: 420, height: 760 } });

  test('aksi header (Notifikasi, profil, Keluar) tetap berada dalam viewport', async ({ page }) => {
    await login(page);

    await expect(page.getByRole('link', { name: 'Notifikasi' })).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Notifikasi' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keluar' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible();
  });
});
