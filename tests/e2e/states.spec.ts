import { expect, test } from '@playwright/test';

test('memperagakan badge, toast, dan dialog', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email / NIP').fill('admin@pbk.local');
  await page.getByLabel('Kata Sandi').fill('pbk-demo-2026');
  await page.getByRole('button', { name: 'Masuk' }).click();
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
