import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Revisi lanjutan: bukti transfer, tagihan massal, tanda tangan bendahara,
// kuitansi JPG, kelas pada data pembayaran, dan pemisahan tunai/transfer di
// laporan keuangan.

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const stamp = Date.now().toString(36).toUpperCase();
const CLASS = `E2E-R${stamp.slice(-4)}`;

// PNG 1×1 piksel — cukup untuk membuktikan berkas tersimpan dan tampil kembali.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let bendahara: E2eUser;
let activityId: string;
// Satu sesi dipakai keempat skenario: login keempat dalam 15 menit akan
// ditolak MAX_CHALLENGES_PER_WINDOW — pengaman 2FA, bukan cacat fitur.
let page: Page;
const studentIds: string[] = [];

test.beforeAll(async ({ browser }) => {
  bendahara = await createE2eUser({ role: 'BENDAHARA', withTotp: true });
  const category = await prisma.activityCategory.create({ data: { code: `R${stamp.slice(-7)}`, name: `Kategori Revisi ${stamp}` } });
  const cls = await prisma.schoolClass.create({ data: { name: CLASS, grade: 'X' } });
  const activity = await prisma.activity.create({
    data: {
      name: `E2E Revisi ${stamp}`,
      categoryId: category.id,
      year: 2098,
      startDate: new Date('2098-03-01'),
      endDate: new Date('2098-03-02'),
      location: 'Uji Revisi',
      contribution: 200_000,
      status: 'AKTIF',
      receiptPrefix: `RV-${stamp.slice(-4)}`,
    },
  });
  activityId = activity.id;
  for (const n of [1, 2]) {
    const student = await prisma.student.create({
      data: { nis: `RV${stamp}${n}`, name: `Siswa Revisi ${n} ${stamp}`, grade: 'X', className: cls.name },
    });
    studentIds.push(student.id);
    await prisma.participant.create({ data: { activityId, studentId: student.id, billing: 200_000 } });
  }

  const context = await browser.newContext();
  page = await context.newPage();
  await loginAsFixture(page, bendahara);
  await context.addCookies([{ name: 'pbk_activity', value: activityId, domain: 'localhost', path: '/' }]);
});

test.afterAll(async () => {
  await page.context().close();
  await prisma.paymentProof.deleteMany({ where: { payment: { activityId } } });
  await prisma.payment.deleteMany({ where: { activityId } });
  await prisma.participant.deleteMany({ where: { activityId } });
  await prisma.activity.delete({ where: { id: activityId } }).catch(() => {});
  await prisma.activityCategory.deleteMany({ where: { name: `Kategori Revisi ${stamp}` } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.schoolClass.deleteMany({ where: { name: CLASS } });
  await prisma.auditLog.deleteMany({ where: { userId: bendahara.id } });
  await deleteE2eUser(bendahara.id);
});

test('ubah tagihan massal mengubah seluruh peserta sekaligus', async () => {
  await page.goto('/siswa');
  await page.getByRole('button', { name: 'Ubah Tagihan Massal' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ubah Tagihan Banyak Siswa' });
  await dialog.getByLabel('Berlaku untuk').selectOption(`class:${CLASS}`);
  await dialog.getByLabel('Tagihan Baru (Rp)').fill('275000');
  await dialog.getByRole('button', { name: 'Ubah Tagihan' }).click();
  await expect(page.getByText(/Tagihan 2 siswa/)).toBeVisible();

  const billings = await prisma.participant.findMany({ where: { activityId }, select: { billing: true } });
  expect(billings.map((b) => b.billing)).toEqual([275_000, 275_000]);
});

test('pembayaran transfer menyimpan bukti, dan kelas tampil di data pembayaran', async () => {
  await page.goto('/pembayaran');
  await page.getByRole('button', { name: '+ Catat Pembayaran' }).click();
  const dialog = page.getByRole('dialog', { name: 'Catat Pembayaran' });
  await dialog.getByLabel('Cari siswa').fill(`RV${stamp}1`);
  await dialog.getByRole('radio', { name: new RegExp(`Siswa Revisi 1 ${stamp}`) }).check();
  await dialog.getByLabel('Nominal (Rp)').fill('275000');
  await dialog.getByRole('radio', { name: 'Transfer' }).check();
  await dialog.getByLabel('Bukti Transfer').setInputFiles({ name: 'bukti.png', mimeType: 'image/png', buffer: PNG });
  await dialog.getByRole('button', { name: 'Simpan' }).click();

  // Kelas siswa muncul di baris pembayaran, dan pembayaran ditandai punya bukti.
  const row = page.getByRole('row', { name: new RegExp(CLASS) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('bukti');

  const payment = await prisma.payment.findFirstOrThrow({ where: { activityId }, include: { proof: true } });
  expect(payment.proof?.data.startsWith('data:image/png;base64,')).toBe(true);

  await page.goto(`/pembayaran/${payment.id}`);
  await expect(page.getByRole('img', { name: `Bukti transfer ${payment.receiptNo}` })).toBeVisible();
  await expect(page.getByText('Kelas siswa')).toBeVisible();
  await expect(page.getByText(CLASS).first()).toBeVisible();
});

test('tanda tangan bendahara tercetak di kuitansi, dan kuitansi bisa diunduh JPG', async () => {
  await page.goto('/profil');
  await page.getByLabel('Berkas tanda tangan').setInputFiles({ name: 'ttd.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Simpan Tanda Tangan' }).click();
  await expect(page.getByRole('img', { name: 'Tanda tangan Anda' })).toBeVisible();

  const payment = await prisma.payment.findFirstOrThrow({ where: { activityId } });
  await page.goto(`/kuitansi?id=${payment.id}`);
  await expect(page.getByRole('img', { name: 'Tanda tangan bendahara' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Unduh JPG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.jpg$/);
});

test('laporan keuangan memisahkan tunai dan transfer', async () => {
  await page.goto(`/laporan/keuangan?activityId=${activityId}`);
  await expect(page.getByText('Pemasukan Transfer').locator('..')).toContainText('Rp275.000');
  await expect(page.getByText('Pemasukan Tunai').locator('..')).toContainText('Rp0');
  await expect(page.getByRole('columnheader', { name: 'Metode' })).toBeVisible();
  // Keterangan transaksi menyebut kelas siswa, bukan namanya saja.
  await expect(page.getByRole('cell', { name: new RegExp(CLASS) })).toBeVisible();

  // Filter transfer saja tetap menampilkan transaksinya; filter tunai mengosongkannya.
  await page.goto(`/laporan/keuangan?activityId=${activityId}&method=TRANSFER`);
  await expect(page.getByRole('cell', { name: 'Transfer', exact: true })).toBeVisible();
  await page.goto(`/laporan/keuangan?activityId=${activityId}&method=TUNAI`);
  await expect(page.getByText('Tidak ada transaksi pada filter ini.')).toBeVisible();
});
