// Loads .env into this test-runner process for SEED_ADMIN_PASSWORD below.
import 'dotenv/config';
import { expect, test } from '@playwright/test';

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'pbk-lokal-2026';

test('memperagakan badge, toast, dan dialog', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Kata Sandi').fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  // The seed account is a bootstrap login (no TOTP, no phone), so it clears
  // /login/verifikasi automatically without asking for a code.
  await page.waitForURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Status & Komponen', exact: true }).click();

  await expect(page.getByText('Belum Lunas', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Tampilkan toast' }).click();
  await expect(page.getByRole('status')).toContainText('Pembayaran OC-X/0088 tersimpan');

  await page.getByRole('button', { name: 'Tampilkan dialog konfirmasi' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('tidak ada catatan keuangan yang dihapus');
  await dialog.getByRole('button', { name: 'Ya, Batalkan Pembayaran' }).click();
  await expect(page.getByRole('status')).toContainText('dibatalkan');
});
