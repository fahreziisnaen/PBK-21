import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { computeTotpCode, createE2eUser, deleteE2eUser, prisma, type E2eUser } from './support/e2e-users';

// Dua opsi di halaman masuk: tombol tampilkan sandi, dan "Ingat saya".

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

let user: E2eUser;

test.beforeAll(async () => {
  user = await createE2eUser({ role: 'BENDAHARA', withTotp: true });
});

test.afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await deleteE2eUser(user.id);
});

test('tombol mata menampilkan dan menyembunyikan sandi', async ({ page }) => {
  await page.goto('/login');
  const field = page.getByLabel('Kata Sandi');
  await field.fill('rahasia-saya');

  // Tersembunyi secara bawaan.
  await expect(field).toHaveAttribute('type', 'password');

  await page.getByRole('button', { name: 'Tampilkan sandi' }).click();
  await expect(field).toHaveAttribute('type', 'text');
  // Isiannya tidak hilang saat tipenya berganti.
  await expect(field).toHaveValue('rahasia-saya');

  await page.getByRole('button', { name: 'Sembunyikan sandi' }).click();
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveValue('rahasia-saya');
});

test('tombol mata tidak ikut mengirim formnya', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill(user.password);

  await page.getByRole('button', { name: 'Tampilkan sandi' }).click();

  // Kalau tombolnya bertipe submit, klik di atas akan memulai login dan modal
  // tokennya muncul. Ia harus tetap tidak ada.
  await expect(page.getByRole('dialog', { name: 'Verifikasi Masuk' })).toBeHidden();
  await expect(page).toHaveURL(/\/login$/);
});

test('tanpa "Ingat saya", sesi dibatasi waktu', async ({ page }) => {
  await page.goto('/login');
  const ingat = page.getByRole('checkbox', { name: 'Ingat saya' });
  await expect(ingat).not.toBeChecked();

  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill(user.password);
  await page.getByRole('button', { name: 'Masuk' }).click();

  const dialog = page.getByRole('dialog', { name: 'Verifikasi Masuk' });
  await dialog.getByLabel('Kode Verifikasi').fill(computeTotpCode(user.totpSecret!));
  await dialog.getByRole('button', { name: 'Verifikasi' }).click();
  await page.waitForURL(/\/dashboard/);

  // Pilihannya benar-benar sampai ke sesi, bukan berhenti di form.
  const session = await page.evaluate(async () => {
    const res = await fetch('/api/auth/session');
    return res.json();
  });
  expect(session.user.remember).toBe(false);
  expect(typeof session.user.loginAt).toBe('number');
});

test('dengan "Ingat saya" dicentang, sesinya ditandai diingat', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('checkbox', { name: 'Ingat saya' }).check();
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill(user.password);
  await page.getByRole('button', { name: 'Masuk' }).click();

  const dialog = page.getByRole('dialog', { name: 'Verifikasi Masuk' });
  await dialog.getByLabel('Kode Verifikasi').fill(computeTotpCode(user.totpSecret!));
  await dialog.getByRole('button', { name: 'Verifikasi' }).click();
  await page.waitForURL(/\/dashboard/);

  const session = await page.evaluate(async () => {
    const res = await fetch('/api/auth/session');
    return res.json();
  });
  expect(session.user.remember).toBe(true);
});
