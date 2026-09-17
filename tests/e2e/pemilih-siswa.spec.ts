import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Pemilihan siswa yang dulu hanya berupa daftar panjang tanpa pencarian:
// kolom Siswa di Catat Pembayaran dan daftar tinggal kelas di Naik Kelas.

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const stamp = Date.now().toString(36).toUpperCase();
const P = stamp.slice(-4);
const KELAS_X = `S${P}-X1`;
const KELAS_XI = `S${P}-XI1`;

let user: E2eUser;
let page: Page;
let activityId: string;
let categoryId: string;
let tempYearId: string | undefined;
const studentIds: string[] = [];
const ids: Record<string, string> = {};

test.beforeAll(async ({ browser }) => {
  user = await createE2eUser({ role: 'BENDAHARA', withTotp: true });
  await prisma.schoolClass.createMany({
    data: [
      { name: KELAS_X, grade: 'X' },
      { name: KELAS_XI, grade: 'XI' },
    ],
  });
  const category = await prisma.activityCategory.create({ data: { code: `SP${P}`, name: `Kategori Pemilih ${stamp}` } });
  categoryId = category.id;
  const activity = await prisma.activity.create({
    data: {
      name: `Kegiatan Pemilih ${stamp}`, categoryId, year: 2091,
      startDate: new Date('2091-05-01'), endDate: new Date('2091-05-02'), location: 'Uji',
      contribution: 300_000, status: 'AKTIF', receiptPrefix: `SP-${P}`,
    },
  });
  activityId = activity.id;

  const rows = [
    { key: 'ani', nis: `SP${stamp}1`, name: `Ani Pemilih ${stamp}`, grade: 'X' as const, className: KELAS_X },
    { key: 'budi', nis: `SP${stamp}2`, name: `Budi Pemilih ${stamp}`, grade: 'X' as const, className: KELAS_X },
    { key: 'citra', nis: `SP${stamp}3`, name: `Citra Pemilih ${stamp}`, grade: 'XI' as const, className: KELAS_XI },
    { key: 'lunas', nis: `SP${stamp}4`, name: `Lunas Pemilih ${stamp}`, grade: 'XI' as const, className: KELAS_XI },
  ];
  for (const r of rows) {
    const { key, ...data } = r;
    const s = await prisma.student.create({ data });
    studentIds.push(s.id);
    ids[key] = s.id;
    const pt = await prisma.participant.create({ data: { activityId, studentId: s.id, billing: 300_000 } });
    ids[`pt:${key}`] = pt.id;
    if (key === 'lunas') {
      await prisma.payment.create({
        data: {
          activityId, participantId: pt.id, amount: 300_000, date: new Date('2091-04-01'),
          method: 'TUNAI', seq: 1, receiptNo: `SP-${P}/0001`, createdById: user.id,
        },
      });
    }
  }

  // Halaman Naik Kelas butuh tahun pelajaran berjalan.
  if (!(await prisma.academicYear.findFirst({ where: { isActive: true } }))) {
    tempYearId = (await prisma.academicYear.create({ data: { name: '2092/2093', startYear: 2092, isActive: true } })).id;
  }

  const context = await browser.newContext();
  await context.addCookies([{ name: 'pbk_activity', value: activityId, domain: 'localhost', path: '/' }]);
  page = await context.newPage();
  await loginAsFixture(page, user);
});

test.afterAll(async () => {
  await page.context().close();
  await prisma.payment.deleteMany({ where: { activityId } });
  await prisma.participant.deleteMany({ where: { activityId } });
  await prisma.activity.delete({ where: { id: activityId } }).catch(() => {});
  await prisma.activityCategory.delete({ where: { id: categoryId } }).catch(() => {});
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.schoolClass.deleteMany({ where: { name: { in: [KELAS_X, KELAS_XI] } } });
  if (tempYearId) await prisma.academicYear.delete({ where: { id: tempYearId } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await deleteE2eUser(user.id);
});

async function openPaymentDialog() {
  await page.goto('/pembayaran');
  await page.getByRole('button', { name: '+ Catat Pembayaran' }).click();
  return page.getByRole('dialog', { name: 'Catat Pembayaran' });
}

test('catat pembayaran: siswa dicari lewat nama atau NIS, dan yang lunas tidak ditawarkan', async () => {
  const dialog = await openPaymentDialog();
  const choices = dialog.getByRole('radiogroup', { name: 'Siswa' }).getByRole('radio');

  await dialog.getByLabel('Cari siswa').fill(`Pemilih ${stamp}`);
  await expect(choices).toHaveCount(3);
  await expect(dialog.getByRole('radio', { name: new RegExp(`Lunas Pemilih ${stamp}`) })).toHaveCount(0);

  await dialog.getByLabel('Cari siswa').fill(`budi pemilih ${stamp.toLowerCase()}`);
  await expect(choices).toHaveCount(1);
  await dialog.getByLabel('Cari siswa').fill(`SP${stamp}3`);
  await expect(choices).toHaveCount(1);
  await expect(choices.first()).toHaveAccessibleName(new RegExp(`Citra Pemilih ${stamp}`));
});

test('catat pembayaran: tingkat mempersempit daftar kelas, kelas mempersempit siswa', async () => {
  const dialog = await openPaymentDialog();
  await dialog.getByLabel('Cari siswa').fill(`Pemilih ${stamp}`);

  await dialog.getByLabel('Tingkat siswa').selectOption('XI');
  await expect(dialog.getByLabel('Kelas siswa').getByRole('option', { name: KELAS_X })).toHaveCount(0);
  await expect(dialog.getByRole('radio', { name: new RegExp(`Citra Pemilih ${stamp}`) })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: new RegExp(`Ani Pemilih ${stamp}`) })).toHaveCount(0);

  await dialog.getByLabel('Tingkat siswa').selectOption('');
  await dialog.getByLabel('Kelas siswa').selectOption(KELAS_X);
  await expect(dialog.getByRole('radiogroup', { name: 'Siswa' }).getByRole('radio')).toHaveCount(2);
});

test('catat pembayaran: pilihan tetap terkirim meski siswanya tersaring keluar', async () => {
  const dialog = await openPaymentDialog();
  await dialog.getByLabel('Cari siswa').fill(`SP${stamp}1`);
  await dialog.getByRole('radio', { name: new RegExp(`Ani Pemilih ${stamp}`) }).check();
  await expect(dialog.getByText(`Dipilih: Ani Pemilih ${stamp}`)).toBeVisible();

  // Mengganti pencarian menyembunyikan Ani dari daftar, tetapi pilihannya tetap.
  await dialog.getByLabel('Cari siswa').fill(`SP${stamp}2`);
  await expect(dialog.getByRole('radio', { name: new RegExp(`Ani Pemilih ${stamp}`) })).toHaveCount(0);
  await expect(dialog.getByText(`Dipilih: Ani Pemilih ${stamp}`)).toBeVisible();

  await dialog.getByLabel('Nominal (Rp)').fill('100000');
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(dialog).toBeHidden();

  const payment = await prisma.payment.findFirstOrThrow({ where: { activityId, amount: 100_000 } });
  expect(payment.participantId).toBe(ids['pt:ani']);
});

test('catat pembayaran tanpa memilih siswa ditolak dengan pesan yang jelas', async () => {
  const dialog = await openPaymentDialog();
  await dialog.getByLabel('Nominal (Rp)').fill('50000');
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(dialog.locator('p[role="alert"]')).toHaveText('Pilih siswa.');
});

test('bayar dari baris peserta langsung memakai siswa itu, tanpa pemilih', async () => {
  await page.goto('/siswa');
  await page.getByRole('row', { name: new RegExp(`Budi Pemilih ${stamp}`) }).getByRole('button', { name: 'Bayar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Catat Pembayaran' });
  await expect(dialog.getByText(`Budi Pemilih ${stamp}`)).toBeVisible();
  await expect(dialog.getByLabel('Cari siswa')).toHaveCount(0);
  await expect(dialog.getByLabel('Nominal (Rp)')).toHaveValue('300000');
});

test('naik kelas: siswa tinggal kelas dicari satu per satu, dan centangnya tidak hilang', async () => {
  await page.goto('/master/naik-kelas');
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Jalankan Naik Kelas' }) });
  const tinggal = () => form.evaluate((f) => new FormData(f as HTMLFormElement).getAll('tinggal'));

  await page.getByLabel('Cari siswa').fill(`Ani Pemilih ${stamp}`);
  await expect(page.getByRole('checkbox', { name: new RegExp(`Budi Pemilih ${stamp}`) })).toHaveCount(0);
  await page.getByRole('checkbox', { name: new RegExp(`Ani Pemilih ${stamp}`) }).check();

  // Pencarian berikutnya: Ani tidak tampil lagi di daftar, tetapi tetap dipilih
  // dan terlihat di ringkasan tinggal kelas.
  await page.getByLabel('Cari siswa').fill(`SP${stamp}3`);
  await page.getByRole('checkbox', { name: new RegExp(`Citra Pemilih ${stamp}`) }).check();
  await expect(page.getByText('Tinggal kelas (2)')).toBeVisible();
  expect((await tinggal()).sort()).toEqual([ids.ani, ids.citra].sort());

  // Penyaring kelas juga tersedia.
  await page.getByLabel('Cari siswa').fill('');
  await page.getByLabel('Kelas siswa').selectOption(KELAS_X);
  await expect(page.getByRole('checkbox', { name: new RegExp(`Citra Pemilih ${stamp}`) })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: new RegExp(`Budi Pemilih ${stamp}`) })).toBeVisible();

  // Dilepas dari ringkasan.
  await page.getByRole('button', { name: `Batalkan tinggal kelas Ani Pemilih ${stamp}` }).click();
  await expect(page.getByText('Tinggal kelas (1)')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: new RegExp(`Ani Pemilih ${stamp}`) })).not.toBeChecked();
  expect(await tinggal()).toEqual([ids.citra]);
});
