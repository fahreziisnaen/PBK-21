import { expect, test } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, type E2eUser } from './support/e2e-users';

// A disposable, TOTP-enrolled BENDAHARA — passes the post-login gate
// (nextGate returns null once totpEnabledAt is set) without ever touching
// `admin`. See tests/e2e/support/e2e-users.ts for why.
let user: E2eUser;

test.beforeAll(async () => {
  user = await createE2eUser();
});

test.afterAll(async () => {
  await deleteE2eUser(user.id);
});

test.beforeEach(async ({ page }) => {
  await loginAsFixture(page, user);
});

test('menampilkan tujuh grup nav', async ({ page }) => {
  for (const label of ['DASHBOARD', 'KEUANGAN', 'DATA', 'MASTER DATA', 'LAPORAN', 'ADMINISTRASI', 'SISTEM']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});

test('menavigasi ke seluruh route utama dengan judul benar', async ({ page }) => {
  const cases: [string, string][] = [
    ['Pembayaran', 'Seluruh transaksi penerimaan kontribusi siswa'],
    ['Pengeluaran', 'Belanja kegiatan menurut kategori master'],
    ['Buku Kas', 'Mutasi kas kronologis kegiatan aktif'],
    ['Data Siswa', 'Peserta dan tagihan pada kegiatan aktif'],
    ['Rekap Pembayaran', 'Rekapitulasi per tingkat dan status'],
    ['Kategori Kegiatan', 'Master kategori untuk pengelompokan kegiatan'],
    ['Laporan Keuangan', 'Laporan pemasukan, pengeluaran, dan saldo'],
    ['Kuitansi', 'Pratinjau kuitansi siap cetak'],
    ['Status & Komponen', 'Empty state, error state, dan dialog konfirmasi'],
  ];
  for (const [link, subtitle] of cases) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: link })).toBeVisible();
    await expect(page.getByText(subtitle)).toBeVisible();
  }
});

test('menandai item nav aktif', async ({ page }) => {
  await page.getByRole('link', { name: 'Buku Kas', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Buku Kas', exact: true })).toHaveAttribute('aria-current', 'page');
});
