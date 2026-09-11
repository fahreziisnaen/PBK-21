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

test('mengganti sandi wajib lalu diminta masuk kembali dengan sandi baru', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill(user.password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL(/\/ganti-sandi/);

  await page.getByLabel('Sandi Lama').fill(user.password);
  await page.getByLabel('Sandi Baru', { exact: true }).fill('Sandi-Baru-Aman-123');
  await page.getByLabel('Konfirmasi Sandi Baru').fill('Sandi-Baru-Aman-123');
  await page.getByRole('button', { name: 'Simpan Sandi Baru' }).click();

  // Changing the password ends every session for the account, this one
  // included — see isSessionStale. So the user lands back on /login, and the
  // page says why rather than leaving them to guess. Landing anywhere other
  // than /ganti-sandi is also direct proof the redirect is not a loop.
  await page.waitForURL(/\/login/);
  await expect(page.getByText('Sandi Anda berhasil diperbarui', { exact: false })).toBeVisible();

  // And the new password genuinely works.
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill('Sandi-Baru-Aman-123');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL(/\/keamanan\/2fa|\/login\/verifikasi/);
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
