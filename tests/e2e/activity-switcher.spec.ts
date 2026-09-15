import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// A disposable, TOTP-enrolled BENDAHARA — passes the post-login gate
// without ever touching `admin`. See tests/e2e/support/e2e-users.ts.
let user: E2eUser;
// Kategori dan kegiatan milik spec ini sendiri. Dulu spec ini membaca
// "Outing Class X 2026" dari seeder — seeder tidak lagi membuatnya, dan
// setelah factory reset data itu memang tidak ada.
const stamp = Date.now().toString(36).toUpperCase();
const MAIN = `E2E Switcher Utama ${stamp}`;
let categoryId: string;
let mainActivityId: string;

test.beforeAll(async () => {
  user = await createE2eUser();
  const category = await prisma.activityCategory.create({ data: { code: `E${stamp.slice(-8)}`, name: 'Kategori Uji Switcher' } });
  categoryId = category.id;
  // Tahun jauh ke depan: pilihan bawaan diurutkan year+startDate desc, jadi
  // kegiatan ini pasti menjadi kegiatan aktif default selama spec berjalan.
  const main = await prisma.activity.create({
    data: {
      name: MAIN,
      categoryId,
      year: 2099,
      startDate: new Date('2099-01-10'),
      endDate: new Date('2099-01-11'),
      location: 'Lokasi Uji E2E',
      contribution: 100_000,
      status: 'AKTIF',
      receiptPrefix: `E2E-M${stamp.slice(-4)}`,
    },
  });
  mainActivityId = main.id;
});

test.afterAll(async () => {
  await prisma.activity.deleteMany({ where: { categoryId } });
  await prisma.activityCategory.delete({ where: { id: categoryId } }).catch(() => {});
  await deleteE2eUser(user.id);
  await prisma.$disconnect();
});

async function login(page: Page) {
  await loginAsFixture(page, user);
}

test('menampilkan kegiatan aktif di header', async ({ page }) => {
  await login(page);

  await expect(page.getByLabel('KEGIATAN')).toBeVisible();
  await expect(page.getByLabel('KEGIATAN')).toHaveValue(mainActivityId);
});

test('mengganti kegiatan aktif dan tetap tersimpan setelah reload', async ({ page }) => {
  // Tahun/tanggal sengaja dibuat lebih lama supaya kegiatan ini TIDAK menjadi
  // pilihan default (fallback mengurutkan year+startDate desc) — sehingga
  // pergantian yang kita uji benar-benar berasal dari cookie, bukan kebetulan
  // urutan fallback.
  const testActivity = await prisma.activity.create({
    data: {
      name: 'Kegiatan Uji E2E Switcher',
      categoryId,
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
    await expect(select).toHaveValue(mainActivityId);

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
