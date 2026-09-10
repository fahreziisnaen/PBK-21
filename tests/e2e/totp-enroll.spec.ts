import { expect, test } from '@playwright/test';
import { computeTotpCode, createE2eUser, deleteE2eUser, type E2eUser } from './support/e2e-users';

// A fresh disposable user per test (not shared via beforeAll) — the first
// test's own point is to enrol TOTP, which mutates the account, so the
// second test needs its own still-unenrolled account rather than reusing
// one already enrolled. Each has no TOTP and no phone, so the gate forces
// it to /keamanan/2fa (nextGate: role === 'SUPERADMIN' || !phone) and login
// clears via the bootstrap exemption (no code needed), exactly like `admin`
// today. Never enrols TOTP on `admin` itself — see
// tests/e2e/support/e2e-users.ts.
let user: E2eUser;

test.beforeEach(async () => {
  user = await createE2eUser({ withTotp: false });
});

test.afterEach(async () => {
  await deleteE2eUser(user.id);
});

test('mendaftarkan TOTP dan membuka aplikasi', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill(user.password);
  await page.getByRole('button', { name: 'Masuk' }).click();

  // Bootstrap login (no phone, no TOTP yet) auto-clears /login/verifikasi,
  // then the post-login gate forces this account here.
  await page.waitForURL(/\/keamanan\/2fa/);

  await expect(page.getByRole('img', { name: 'Kode QR pendaftaran TOTP' })).toBeVisible();

  const secret = await page.getByLabel('Kode Manual (bila kamera tidak dapat memindai)').inputValue();
  expect(secret.length).toBeGreaterThan(0);

  const code = computeTotpCode(secret);
  await page.getByLabel('Kode dari Aplikasi Authenticator').fill(code);
  await page.getByRole('button', { name: 'Aktifkan' }).click();

  // The gate no longer applies once totpEnabledAt is set — the app opens.
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole('link', { name: 'Notifikasi' })).toBeVisible();
});

test('menolak kode yang salah tanpa mengaktifkan 2FA', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill(user.password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL(/\/keamanan\/2fa/);

  await page.getByLabel('Kode dari Aplikasi Authenticator').fill('000000');
  await page.getByRole('button', { name: 'Aktifkan' }).click();

  // Not getByRole('alert') — Next's own route announcer also carries that
  // role, making the locator ambiguous. Match the actual error text instead.
  await expect(page.getByText('Kode salah. Pastikan jam perangkat Anda tepat dan coba lagi.')).toBeVisible();
  await expect(page).toHaveURL(/\/keamanan\/2fa/);
});
