import { expect, test } from '@playwright/test';

test('menolak kredensial salah', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email / NIP').fill('anggi.prawita@sman21sby.sch.id');
  await page.getByLabel('Kata Sandi').fill('sandi-salah');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByText('Email atau kata sandi salah')).toBeVisible();
});

test('menerima kredensial benar dan masuk ke dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email / NIP').fill('anggi.prawita@sman21sby.sch.id');
  await page.getByLabel('Kata Sandi').fill('pbk-demo-2026');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test('mengarahkan tamu ke login', async ({ page }) => {
  await page.goto('/pembayaran');
  await expect(page).toHaveURL(/\/login/);
});
