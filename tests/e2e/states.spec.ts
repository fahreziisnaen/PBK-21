import { expect, test } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, type E2eUser } from './support/e2e-users';

// A disposable, TOTP-enrolled BENDAHARA — passes the post-login gate
// without ever touching `admin`. See tests/e2e/support/e2e-users.ts.
let user: E2eUser;

test.beforeAll(async () => {
  user = await createE2eUser();
});

test.afterAll(async () => {
  await deleteE2eUser(user.id);
});

test('memperagakan badge, toast, dan dialog', async ({ page }) => {
  await loginAsFixture(page, user);

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
