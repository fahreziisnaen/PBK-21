import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { computeTotpCode, createE2eUser, deleteE2eUser, prisma, type E2eUser } from './support/e2e-users';

// Tahap kode masuk dikerjakan di modal pada /login, bukan halaman terpisah.

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

let user: E2eUser;

test.beforeAll(async () => {
  user = await createE2eUser({ role: 'BENDAHARA', withTotp: true });
});

test.afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await deleteE2eUser(user.id);
});

async function submitPassword(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill(user.password);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

test('kode diminta di modal, tanpa pindah halaman', async ({ page }) => {
  await submitPassword(page);

  const dialog = page.getByRole('dialog', { name: 'Verifikasi Masuk' });
  await expect(dialog).toBeVisible();
  // Yang membuktikan ini modal, bukan halaman: URL-nya tidak berubah.
  await expect(page).toHaveURL(/\/login$/);
  await expect(dialog.getByText('Google Authenticator')).toBeVisible();
  // Kolomnya langsung terfokus, jadi kode bisa ditempel tanpa klik dulu.
  await expect(dialog.getByLabel('Kode Verifikasi')).toBeFocused();
});

test('kode salah ditolak di dalam modal dan modalnya tetap terbuka', async ({ page }) => {
  await submitPassword(page);
  const dialog = page.getByRole('dialog', { name: 'Verifikasi Masuk' });

  await dialog.getByLabel('Kode Verifikasi').fill('000000');
  await dialog.getByRole('button', { name: 'Verifikasi' }).click();

  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('Batal menutup modal, dan memuat ulang tidak membukanya lagi', async ({ page }) => {
  await submitPassword(page);
  const dialog = page.getByRole('dialog', { name: 'Verifikasi Masuk' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Batal' }).click();
  await expect(dialog).toBeHidden();

  // Cookie challenge-nya ikut dibuang — tanpa itu modalnya hidup lagi di sini.
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Verifikasi Masuk' })).toBeHidden();
  await expect(page.getByLabel('Username')).toBeVisible();
});

test('kode benar memunculkan tanda berhasil lalu masuk ke dashboard', async ({ page }) => {
  await submitPassword(page);
  const dialog = page.getByRole('dialog', { name: 'Verifikasi Masuk' });

  await dialog.getByLabel('Kode Verifikasi').fill(computeTotpCode(user.totpSecret!));
  await dialog.getByRole('button', { name: 'Verifikasi' }).click();

  // Tanda berhasil tampil lebih dulu, baru halaman berpindah sendiri.
  await expect(page.getByText('Berhasil Masuk')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await page.waitForURL(/\/dashboard/);
});

test('memuat ulang di tengah verifikasi membuka kembali modalnya', async ({ page }) => {
  await submitPassword(page);
  await expect(page.getByRole('dialog', { name: 'Verifikasi Masuk' })).toBeVisible();

  // Challenge-nya hidup di server, jadi tahap yang berjalan tidak boleh hilang
  // hanya karena halamannya dimuat ulang — kalau hilang, pengguna terpaksa
  // mengirim sandi lagi dan memakan jatah penerbitan challenge.
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Verifikasi Masuk' })).toBeVisible();
});

test('tautan lama /login/verifikasi diarahkan ke halaman masuk', async ({ page }) => {
  await page.goto('/login/verifikasi');
  await expect(page).toHaveURL(/\/login$/);
});
