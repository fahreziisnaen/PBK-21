import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Filter tingkat dan kelas di Laporan Keuangan dan Laporan Pembayaran.

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const stamp = Date.now().toString(36).toUpperCase();
const P = stamp.slice(-4);
const KELAS_A = `L${P}-X1`; // tingkat X
const KELAS_B = `L${P}-X2`; // tingkat X
const KELAS_C = `L${P}-XI1`; // tingkat XI

let user: E2eUser;
let page: Page;
let activityId: string;
let categoryId: string;
let expenseCategoryId: string;
const studentIds: string[] = [];

test.beforeAll(async ({ browser }) => {
  user = await createE2eUser({ role: 'BENDAHARA', withTotp: true });
  await prisma.schoolClass.createMany({
    data: [
      { name: KELAS_A, grade: 'X' },
      { name: KELAS_B, grade: 'X' },
      { name: KELAS_C, grade: 'XI' },
    ],
  });
  const category = await prisma.activityCategory.create({ data: { code: `LK${P}`, name: `Kategori Laporan ${stamp}` } });
  categoryId = category.id;
  const expCat = await prisma.expenseCategory.create({ data: { code: `LE${P}`, name: `Transport Uji ${stamp}` } });
  expenseCategoryId = expCat.id;
  const activity = await prisma.activity.create({
    data: {
      name: `Kegiatan Laporan ${stamp}`, categoryId, year: 2087,
      startDate: new Date('2087-08-01'), endDate: new Date('2087-08-02'), location: 'Uji',
      contribution: 500_000, status: 'AKTIF', receiptPrefix: `LP-${P}`,
    },
  });
  activityId = activity.id;

  // Satu pembayar per kelas, dengan nominal berbeda supaya totalnya bisa
  // dibedakan satu sama lain.
  const payers = [
    { kelas: KELAS_A, grade: 'X' as const, amount: 100_000 },
    { kelas: KELAS_B, grade: 'X' as const, amount: 200_000 },
    { kelas: KELAS_C, grade: 'XI' as const, amount: 400_000 },
  ];
  let seq = 1;
  for (const [i, p] of payers.entries()) {
    const st = await prisma.student.create({
      data: { nis: `LP${stamp}${i}`, name: `Pembayar ${p.kelas} ${stamp}`, grade: p.grade, className: p.kelas },
    });
    studentIds.push(st.id);
    const pt = await prisma.participant.create({ data: { activityId, studentId: st.id, billing: 500_000 } });
    await prisma.payment.create({
      data: {
        activityId, participantId: pt.id, amount: p.amount, date: new Date('2087-08-01'),
        method: 'TUNAI', seq: seq++, receiptNo: `LP-${P}/000${i + 1}`, createdById: user.id,
      },
    });
  }
  // Satu pengeluaran kegiatan — tidak milik kelas mana pun.
  await prisma.expense.create({
    data: {
      activityId, categoryId: expenseCategoryId, seq: 1, refNo: `BKK/LP-${P}/001`,
      date: new Date('2087-08-01'), description: `Sewa bus ${stamp}`, amount: 150_000,
      method: 'TUNAI', createdById: user.id,
    },
  });

  const context = await browser.newContext();
  page = await context.newPage();
  await loginAsFixture(page, user);
});

test.afterAll(async () => {
  await page.context().close();
  await prisma.expense.deleteMany({ where: { activityId } });
  await prisma.payment.deleteMany({ where: { activityId } });
  await prisma.participant.deleteMany({ where: { activityId } });
  await prisma.activity.delete({ where: { id: activityId } }).catch(() => {});
  await prisma.activityCategory.delete({ where: { id: categoryId } }).catch(() => {});
  await prisma.expenseCategory.delete({ where: { id: expenseCategoryId } }).catch(() => {});
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.schoolClass.deleteMany({ where: { name: { in: [KELAS_A, KELAS_B, KELAS_C] } } });
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await deleteE2eUser(user.id);
});

const kpi = (label: string) => page.getByText(label, { exact: true }).locator('..');

test('tanpa filter kelas, laporan keuangan utuh dengan pengeluaran dan saldo', async () => {
  await page.goto(`/laporan/keuangan?activityId=${activityId}`);
  await expect(kpi('Total Pemasukan')).toContainText('Rp700.000');
  await expect(kpi('Total Pengeluaran')).toContainText('Rp150.000');
  await expect(page.getByRole('columnheader', { name: 'Saldo' })).toBeVisible();
  await expect(page.getByRole('cell', { name: `Sewa bus ${stamp}` })).toBeVisible();
});

test('filter kelas hanya menampilkan pemasukan kelas itu, tanpa pengeluaran dan saldo', async () => {
  await page.goto(`/laporan/keuangan?activityId=${activityId}`);
  // Tanpa tombol Tampilkan: memilih kelas langsung menyaring.
  await expect(page.getByRole('button', { name: 'Tampilkan' })).toHaveCount(0);
  await page.getByLabel('Kelas', { exact: true }).selectOption(KELAS_B);
  await expect(page).toHaveURL(new RegExp(`kelas=${KELAS_B}`));

  await expect(kpi('Total Pemasukan')).toContainText('Rp200.000');
  await expect(page.getByText('LAPORAN PEMASUKAN KEGIATAN')).toBeVisible();
  await expect(page.getByText(`Kelas ${KELAS_B}`)).toBeVisible();

  // Pengeluaran milik kegiatan, bukan milik kelas — tidak boleh ikut.
  await expect(page.getByRole('cell', { name: `Sewa bus ${stamp}` })).toHaveCount(0);
  await expect(page.getByText('Total Pengeluaran', { exact: true })).toHaveCount(0);
  // Saldo satu kelas dikurangi seluruh pengeluaran kegiatan bukan angka yang berarti.
  await expect(page.getByRole('columnheader', { name: 'Saldo' })).toHaveCount(0);
  await expect(page.getByText(/pengeluaran milik kegiatan, bukan milik kelas/)).toBeVisible();

  // Kelas lain tidak ikut.
  await expect(page.getByRole('cell', { name: new RegExp(`Pembayar ${KELAS_A}`) })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: new RegExp(`Pembayar ${KELAS_B}`) })).toBeVisible();
});

test('filter tingkat menjumlah semua kelas di tingkat itu', async () => {
  await page.goto(`/laporan/keuangan?activityId=${activityId}&grade=X`);
  // X-1 (100.000) + X-2 (200.000); XI-1 tidak ikut.
  await expect(kpi('Total Pemasukan')).toContainText('Rp300.000');
  await expect(page.getByRole('cell', { name: new RegExp(`Pembayar ${KELAS_C}`) })).toHaveCount(0);
});

test('mengganti tingkat melepas kelas yang tidak masuk tingkat barunya', async () => {
  await page.goto(`/laporan/keuangan?activityId=${activityId}&kelas=${KELAS_A}`);
  await expect(kpi('Total Pemasukan')).toContainText('Rp100.000');

  await page.getByLabel('Tingkat').selectOption('XI');
  await expect(page).toHaveURL(/grade=XI/);
  // Kelas X-1 dilepas, jadi hasilnya pemasukan tingkat XI — bukan laporan kosong.
  await expect(page).not.toHaveURL(new RegExp(`kelas=${KELAS_A}`));
  await expect(kpi('Total Pemasukan')).toContainText('Rp400.000');
  // Dan kelas tingkat X hilang dari pilihan.
  await expect(page.getByLabel('Kelas', { exact: true }).getByRole('option', { name: KELAS_A })).toHaveCount(0);
});

test('filter jenis dan kategori pengeluaran disembunyikan saat menyaring per kelas', async () => {
  await page.goto(`/laporan/keuangan?activityId=${activityId}&kelas=${KELAS_A}&type=keluar`);
  await expect(page.getByLabel('Jenis')).toHaveCount(0);
  await expect(page.getByLabel('Kategori pengeluaran')).toHaveCount(0);
  // type=keluar di URL tidak ikut berlaku — kalau berlaku, hasilnya pasti kosong.
  await expect(kpi('Total Pemasukan')).toContainText('Rp100.000');
});

test('laporan pembayaran disaring per kelas dan mencetak kelasnya di kop', async () => {
  await page.goto(`/laporan/pembayaran?activityId=${activityId}`);
  await page.getByLabel('Kelas', { exact: true }).selectOption(KELAS_C);
  await expect(page).toHaveURL(new RegExp(`kelas=${KELAS_C}`));

  await expect(page.getByRole('cell', { name: new RegExp(`Pembayar ${KELAS_C}`) })).toBeVisible();
  await expect(page.getByRole('cell', { name: new RegExp(`Pembayar ${KELAS_A}`) })).toHaveCount(0);
  await expect(page.getByText(`Kelas ${KELAS_C}`)).toBeVisible();
  await expect(kpi('Total Dibayar')).toContainText('Rp400.000');
});

test('filter "tanpa kelas" tidak menyeret pengeluaran masuk', async () => {
  // Pengeluaran tidak punya kelas, jadi kelasnya null — persis nilai yang dicari
  // opsi "Tanpa kelas". Tanpa syarat "hanya pemasukan", sewa bus ikut tampil
  // sebagai seolah-olah pembayaran dari siswa tanpa kelas.
  const st = await prisma.student.create({
    data: { nis: `LP${stamp}N`, name: `Tanpa Kelas ${stamp}`, grade: 'X', className: null },
  });
  studentIds.push(st.id);
  const pt = await prisma.participant.create({ data: { activityId, studentId: st.id, billing: 500_000 } });
  await prisma.payment.create({
    data: {
      activityId, participantId: pt.id, amount: 50_000, date: new Date('2087-08-01'),
      method: 'TUNAI', seq: 9, receiptNo: `LP-${P}/0009`, createdById: user.id,
    },
  });

  await page.goto(`/laporan/keuangan?activityId=${activityId}&kelas=-`);
  await expect(page.getByRole('cell', { name: new RegExp(`Tanpa Kelas ${stamp}`) })).toBeVisible();
  await expect(page.getByRole('cell', { name: `Sewa bus ${stamp}` })).toHaveCount(0);
  // Hanya pembayaran siswa tanpa kelas: 50.000, bukan 50.000 + pengeluaran.
  await expect(kpi('Total Pemasukan')).toContainText('Rp50.000');
  await expect(kpi('Transaksi')).toContainText('1');
});
