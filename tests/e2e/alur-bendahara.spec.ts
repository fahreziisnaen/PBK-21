import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Satu alur kerja bendahara dari awal sampai akhir, lewat UI sungguhan:
// kegiatan → siswa → pembayaran → kuitansi → pengeluaran → buku kas →
// dashboard → rekap → laporan → pembatalan → pengguna. Membuat kegiatan
// sendiri dan menghapus seluruh datanya di akhir.

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const stamp = Date.now().toString(36).toUpperCase();
const ACTIVITY = `E2E Study Tour ${stamp}`;
const PREFIX = `E2E-${stamp.slice(-4)}`;
const STUDENT = `E2E Siswa ${stamp}`;
const NIS = `E2E${stamp}`;
const CLASS = `E2E-${stamp}`;
const CLASS_DEL = `E2E-DEL-${stamp}`;

let admin: E2eUser;

test.afterAll(async () => {
  const activity = await prisma.activity.findFirst({ where: { name: ACTIVITY } });
  if (activity) {
    await prisma.payment.deleteMany({ where: { activityId: activity.id } });
    await prisma.expense.deleteMany({ where: { activityId: activity.id } });
    await prisma.participant.deleteMany({ where: { activityId: activity.id } });
    await prisma.activity.delete({ where: { id: activity.id } });
  }
  await prisma.student.deleteMany({ where: { nis: NIS } });
  await prisma.schoolClass.deleteMany({ where: { name: { in: [CLASS, CLASS_DEL] } } });
  if (admin) {
    await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
    await deleteE2eUser(admin.id);
  }
});

test('alur bendahara lengkap', async ({ page, context }) => {
  admin = await createE2eUser({ role: 'ADMIN', withTotp: true });
  await loginAsFixture(page, admin);

  // --- Kegiatan ---
  await page.goto('/master/kegiatan');
  await page.getByRole('button', { name: '+ Tambah Kegiatan' }).click();
  const actDialog = page.getByRole('dialog', { name: 'Tambah Kegiatan' });
  await actDialog.getByLabel('Nama Kegiatan').fill(ACTIVITY);
  await actDialog.getByLabel('Kategori').selectOption({ index: 1 });
  await actDialog.getByLabel('Tanggal Mulai').fill('2026-10-01');
  await actDialog.getByLabel('Tanggal Selesai').fill('2026-10-03');
  await actDialog.getByLabel('Lokasi').fill('Yogyakarta');
  await actDialog.getByLabel('Kontribusi per Siswa (Rp)').fill('300000');
  await actDialog.getByLabel('Target Peserta').fill('10');
  await actDialog.getByLabel('Prefix Kuitansi').fill(PREFIX);
  await actDialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByRole('cell', { name: new RegExp(ACTIVITY) })).toBeVisible();

  const activity = await prisma.activity.findFirstOrThrow({ where: { name: ACTIVITY } });
  await context.addCookies([{ name: 'pbk_activity', value: activity.id, domain: 'localhost', path: '/' }]);

  // --- Kelas: tambah dua, hapus satu yang kosong ---
  await page.goto('/master/kelas');
  for (const name of [CLASS, CLASS_DEL]) {
    await page.getByRole('button', { name: '+ Tambah Kelas' }).click();
    const clDialog = page.getByRole('dialog', { name: 'Tambah Kelas' });
    await clDialog.getByLabel('Nama Kelas').fill(name);
    await clDialog.getByLabel('Tingkat').selectOption('X');
    await clDialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('row', { name: new RegExp(CLASS_DEL) }).getByRole('button', { name: 'Hapus' }).click();
  await page.getByRole('button', { name: 'Hapus Permanen' }).click();
  await expect(page.getByRole('cell', { name: CLASS_DEL, exact: true })).toHaveCount(0);

  // --- Siswa: dibuat di Data Siswa, bukan di Data Peserta ---
  await page.goto('/master/siswa');
  await page.getByRole('button', { name: '+ Tambah Siswa' }).click();
  const stDialog = page.getByRole('dialog', { name: 'Tambah Siswa' });
  await stDialog.getByLabel('NIS').fill(NIS);
  await stDialog.getByLabel('Nama Siswa').fill(STUDENT);
  await stDialog.getByLabel('Tingkat').selectOption('X');
  await stDialog.getByLabel('Kelas', { exact: true }).selectOption(CLASS);
  await stDialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByRole('row', { name: new RegExp(STUDENT) })).toBeVisible();

  // --- Peserta: siswa tadi didaftarkan ke kegiatan ---
  await page.goto('/siswa');
  await page.getByRole('button', { name: 'Daftarkan Siswa' }).click();
  const enrollDialog = page.getByRole('dialog', { name: 'Daftarkan Siswa ke Kegiatan' });
  await enrollDialog.getByLabel('Cari siswa').fill(NIS);
  await enrollDialog.getByRole('checkbox', { name: new RegExp(STUDENT) }).check();
  await enrollDialog.getByRole('button', { name: 'Daftarkan Terpilih' }).click();
  const studentRow = page.getByRole('row', { name: new RegExp(STUDENT) });
  await expect(studentRow).toContainText('Belum Bayar');

  // --- Pembayaran (lunas penuh dari baris siswa) ---
  await studentRow.getByRole('button', { name: 'Bayar' }).click();
  const payDialog = page.getByRole('dialog', { name: 'Catat Pembayaran' });
  await expect(payDialog.getByLabel('Nominal (Rp)')).toHaveValue('300000');
  await payDialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByRole('row', { name: new RegExp(STUDENT) })).toContainText('Lunas');

  // --- Daftar pembayaran & kuitansi ---
  const receiptNo = `${PREFIX}/0001`;
  await page.goto('/pembayaran');
  await expect(page.getByRole('link', { name: receiptNo })).toBeVisible();
  await page.getByRole('row', { name: new RegExp(receiptNo) }).getByRole('link', { name: 'Kuitansi' }).click();
  await expect(page.getByText('KUITANSI', { exact: true })).toBeVisible();
  await expect(page.getByText('Tiga ratus ribu rupiah')).toBeVisible();

  // --- Pengeluaran ---
  await page.goto('/pengeluaran');
  await page.getByRole('button', { name: '+ Tambah Pengeluaran' }).click();
  const exDialog = page.getByRole('dialog', { name: 'Tambah Pengeluaran' });
  await exDialog.getByLabel('Kategori').selectOption({ index: 1 });
  await exDialog.getByLabel('Uraian').fill('Sewa bus pariwisata');
  await exDialog.getByLabel('Nominal (Rp)').fill('100000');
  await exDialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByRole('cell', { name: `BKK/${PREFIX}/001` })).toBeVisible();

  // --- Buku kas, dashboard, rekap ---
  await page.goto('/buku-kas');
  await expect(page.getByRole('cell', { name: receiptNo })).toBeVisible();
  await expect(page.getByRole('cell', { name: `BKK/${PREFIX}/001` })).toBeVisible();
  await expect(page.getByText('Saldo Akhir').locator('..')).toContainText('Rp200.000');

  await page.goto('/dashboard');
  await expect(page.getByText('Saldo Kas').locator('..')).toContainText('Rp200.000');

  await page.goto('/rekap');
  await expect(page.getByRole('heading', { name: 'Rekap per Tingkat' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Tingkat X' })).toBeVisible();

  // --- Laporan dengan filter ---
  await page.goto(`/laporan/keuangan?activityId=${activity.id}`);
  await expect(page.getByText('LAPORAN KEUANGAN KEGIATAN')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Sewa bus pariwisata' })).toBeVisible();
  await page.goto(`/laporan/keuangan?activityId=${activity.id}&type=keluar`);
  await expect(page.getByRole('cell', { name: 'Sewa bus pariwisata' })).toBeVisible();
  await expect(page.getByRole('cell', { name: receiptNo })).toHaveCount(0);

  await page.goto(`/laporan/pembayaran?activityId=${activity.id}&status=Lunas`);
  await expect(page.getByText('LAPORAN PEMBAYARAN SISWA')).toBeVisible();
  await expect(page.getByRole('cell', { name: STUDENT })).toBeVisible();

  // --- Pembatalan pembayaran ---
  const payment = await prisma.payment.findFirstOrThrow({ where: { activityId: activity.id } });
  await page.goto(`/pembayaran/${payment.id}`);
  await page.getByRole('button', { name: 'Batalkan', exact: true }).click();
  await page.getByRole('button', { name: 'Batalkan Pembayaran' }).click();
  await expect(page.getByText('Dibatalkan', { exact: true }).first()).toBeVisible();
  await page.goto('/siswa');
  await expect(page.getByRole('row', { name: new RegExp(STUDENT) })).toContainText('Belum Bayar');

  // --- Halaman pendukung ---
  await page.goto('/pengguna');
  await expect(page.getByRole('cell', { name: new RegExp(admin.username) }).first()).toBeVisible();
  for (const path of ['/pengaturan', '/profil', '/notifikasi', '/kuitansi', '/master/kategori-kegiatan', '/master/kategori-pengeluaran', `/siswa/${(await prisma.student.findUniqueOrThrow({ where: { nis: NIS } })).id}`]) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
  }
});
