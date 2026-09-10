import { expect, test } from '@playwright/test';
import { createE2eUser, deleteE2eUser, type E2eUser } from './support/e2e-users';

// A fresh disposable user per test — the first test's own point is to
// change the password, which mutates the account, so tests do not share
// one fixture. `mustChangePassword: true` and no TOTP forces the gate to
// /ganti-sandi first (password change outranks TOTP enrolment — see
// src/lib/auth-gates.ts), and login clears via the bootstrap exemption.
let user: E2eUser;

test.beforeEach(async () => {
  user = await createE2eUser({ withTotp: false, mustChangePassword: true });
});

test.afterEach(async () => {
  await deleteE2eUser(user.id);
});

test('mengganti sandi wajib lalu berlanjut ke pendaftaran TOTP', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill(user.password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL(/\/ganti-sandi/);

  await page.getByLabel('Sandi Lama').fill(user.password);
  await page.getByLabel('Sandi Baru', { exact: true }).fill('Sandi-Baru-Aman-123');
  await page.getByLabel('Konfirmasi Sandi Baru').fill('Sandi-Baru-Aman-123');
  await page.getByRole('button', { name: 'Simpan Sandi Baru' }).click();

  // mustChangePassword is now false, but this account still has no TOTP —
  // nextGate carries it straight on to enrolment. Landing anywhere other
  // than /ganti-sandi itself is direct proof the redirect is not a loop.
  await page.waitForURL(/\/keamanan\/2fa/);
});

test('menolak sandi lama yang salah, tanpa mengubah apa pun', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill(user.password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL(/\/ganti-sandi/);

  await page.getByLabel('Sandi Lama').fill('sandi-lama-yang-salah');
  await page.getByLabel('Sandi Baru', { exact: true }).fill('Sandi-Baru-Aman-123');
  await page.getByLabel('Konfirmasi Sandi Baru').fill('Sandi-Baru-Aman-123');
  await page.getByRole('button', { name: 'Simpan Sandi Baru' }).click();

  await expect(page.getByText('Sandi lama salah.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/ganti-sandi/);
});

test('menolak konfirmasi yang tidak cocok', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill(user.password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL(/\/ganti-sandi/);

  await page.getByLabel('Sandi Lama').fill(user.password);
  await page.getByLabel('Sandi Baru', { exact: true }).fill('Sandi-Baru-Aman-123');
  await page.getByLabel('Konfirmasi Sandi Baru').fill('Sandi-Lain-999');
  await page.getByRole('button', { name: 'Simpan Sandi Baru' }).click();

  await expect(page.getByText('Konfirmasi sandi baru tidak cocok.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/ganti-sandi/);
});
