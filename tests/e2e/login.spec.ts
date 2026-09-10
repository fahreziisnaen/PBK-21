// Loads .env into this test-runner process — the Next.js dev server started
// by Playwright's webServer config reads it too, but that is a separate
// process; without this the seed password below is never actually set here.
import 'dotenv/config';
import { expect, test } from '@playwright/test';

const USERNAME = 'admin';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'pbk-lokal-2026';

test('menolak kredensial salah', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Kata Sandi').fill('sandi-salah');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByText('Username atau kata sandi salah')).toBeVisible();
});

test('kredensial benar menyelesaikan login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Kata Sandi').fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  // The seed account has neither TOTP nor a phone, so it enters through the
  // bootstrap exemption and lands on the dashboard. Task 11 adds the forced
  // enrolment gate and updates this assertion to expect /keamanan/2fa —
  // asserting that here would leave a test red across a task boundary for no
  // benefit, since nothing in Task 10 can make it pass.
  await expect(page).toHaveURL(/\/dashboard/);
});

test('mengarahkan tamu ke login', async ({ page }) => {
  await page.goto('/pembayaran');
  await expect(page).toHaveURL(/\/login/);
});
