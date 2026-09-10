// Loads .env into this test-runner process for SEED_ADMIN_PASSWORD below.
import 'dotenv/config';
import { expect, test } from '@playwright/test';

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'pbk-lokal-2026';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Kata Sandi').fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  // The seed account is a bootstrap login (no TOTP, no phone), so it clears
  // /login/verifikasi automatically without asking for a code.
  await page.waitForURL(/\/dashboard/);
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
