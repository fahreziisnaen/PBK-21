import { expect, test } from '@playwright/test';

test('menampilkan kegiatan aktif di header', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email / NIP').fill('anggi.prawita@sman21sby.sch.id');
  await page.getByLabel('Kata Sandi').fill('pbk-demo-2026');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL(/\/dashboard/);

  await expect(page.getByLabel('KEGIATAN')).toBeVisible();
  await expect(page.getByLabel('KEGIATAN')).toContainText('Outing Class X 2026');
});
