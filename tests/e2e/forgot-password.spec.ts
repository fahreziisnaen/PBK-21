import { expect, test } from '@playwright/test';
import {
  computeTotpCode,
  createE2eUser,
  deleteE2eUser,
  loginAsFixture,
  prisma,
  type E2eUser,
} from './support/e2e-users';

const NEW_PASSWORD = 'E2e!Reset-Passw0rd';

async function requestCode(page: import('@playwright/test').Page, username: string) {
  await page.goto('/lupa-sandi');
  await page.getByLabel('Username').fill(username);
  await page.getByRole('button', { name: 'Kirim Kode' }).click();
  await page.waitForURL(/\/lupa-sandi\/verifikasi/);
}

test.describe('lupa sandi', () => {
  let user: E2eUser;

  test.beforeEach(async () => {
    user = await createE2eUser({ withTotp: true });
  });

  test.afterEach(async () => {
    await deleteE2eUser(user.id);
  });

  test('mengatur ulang sandi lewat TOTP lalu bisa masuk dengan sandi baru', async ({ page }) => {
    await requestCode(page, user.username);

    await page.getByLabel('Kode Verifikasi').fill(computeTotpCode(user.totpSecret!));
    await page.getByLabel('Sandi Baru', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Konfirmasi Sandi Baru').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Simpan Sandi Baru' }).click();
    await page.waitForURL(/\/login/);

    // The reset is only real if the new password actually authenticates.
    await page.getByLabel('Username').fill(user.username);
    await page.getByLabel('Kata Sandi').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByRole('dialog', { name: 'Verifikasi Masuk' })).toBeVisible();
  });

  test('menolak kode salah tanpa mengubah sandi', async ({ page }) => {
    await requestCode(page, user.username);

    await page.getByLabel('Kode Verifikasi').fill('000000');
    await page.getByLabel('Sandi Baru', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Konfirmasi Sandi Baru').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Simpan Sandi Baru' }).click();

    await expect(page.getByRole('alert')).toBeVisible();

    // The old password must still work — a rejected code must change nothing.
    await page.goto('/login');
    await page.getByLabel('Username').fill(user.username);
    await page.getByLabel('Kata Sandi').fill(user.password);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByRole('dialog', { name: 'Verifikasi Masuk' })).toBeVisible();
  });
});

test('akun tanpa faktor kedua tidak bisa direset, dan penolakannya tidak terlihat', async ({ page }) => {
  // No TOTP and no phone — a bootstrap account. At login such an account is
  // admitted with no code; here it must be refused, or anyone could reset it
  // by typing its username. The refusal must look identical to success.
  const bootstrap = await createE2eUser({ withTotp: false });
  try {
    await requestCode(page, bootstrap.username);

    // Same page as a real request: no challenge row was created for it.
    const challenges = await prisma.authChallenge.count({ where: { userId: bootstrap.id } });
    expect(challenges).toBe(0);

    // And its password is untouched, so the old one still authenticates.
    await page.goto('/login');
    await page.getByLabel('Username').fill(bootstrap.username);
    await page.getByLabel('Kata Sandi').fill(bootstrap.password);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await page.waitForURL(/\/keamanan\/2fa/);
  } finally {
    await deleteE2eUser(bootstrap.id);
  }
});

test('username tak dikenal mendarat di halaman yang sama', async ({ page }) => {
  // The redirect itself must not distinguish a real username from a fake one.
  await requestCode(page, 'e2e-tidak-ada-sama-sekali');
  await expect(page.getByRole('button', { name: 'Simpan Sandi Baru' })).toBeVisible();
});

test('sesi lama mati setelah sandi berubah', async ({ page }) => {
  // The security point of a reset: sessions on other devices must stop
  // working. Simulated by changing the password out from under a live
  // session, exactly as a reset from another browser would.
  const victim = await createE2eUser({ withTotp: true });
  try {
    await loginAsFixture(page, victim);
    await expect(page).toHaveURL(/\/dashboard/);

    await prisma.user.update({
      where: { id: victim.id },
      data: { passwordChangedAt: new Date() },
    });

    await page.goto('/siswa');
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await deleteE2eUser(victim.id);
  }
});
