import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Tampilan cetak keempat laporan: media cetak diemulasi pada lebar area cetak
// A4 (margin @page 12 mm), tanpa membuat PDF. Menjaga perbaikan yang pernah
// rusak: kolom kanan terpangkas, judul layar ikut tercetak, dan tanda tangan
// tercetak sendirian di halaman baru.

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const stamp = Date.now().toString(36).toUpperCase();
const P = stamp.slice(-4);
const KELAS = `C${P}-XII1`;
// Lebar area cetak dalam px CSS (96 dpi): 210 − 24 mm dan 297 − 24 mm.
const A4_TEGAK = 703;
const A4_MELINTANG = 1032;

let user: E2eUser;
let page: Page;
let activityId: string;
let categoryId: string;
let expenseCategoryId: string;
const studentIds: string[] = [];

test.beforeAll(async ({ browser }) => {
  user = await createE2eUser({ role: 'BENDAHARA', withTotp: true });
  await prisma.user.update({ where: { id: user.id }, data: { name: `Bendahara Cetak ${stamp}` } });
  await prisma.schoolClass.create({ data: { name: KELAS, grade: 'XII' } });
  const category = await prisma.activityCategory.create({ data: { code: `CK${P}`, name: `Kategori Cetak ${stamp}` } });
  categoryId = category.id;
  const expCat = await prisma.expenseCategory.create({ data: { code: `CE${P}`, name: `Transportasi ${stamp}` } });
  expenseCategoryId = expCat.id;
  const activity = await prisma.activity.create({
    data: {
      name: `Kegiatan Cetak ${stamp}`, categoryId, year: 2088,
      startDate: new Date('2088-09-10'), endDate: new Date('2088-09-12'), location: 'Uji',
      contribution: 650_000, status: 'AKTIF', receiptPrefix: `CT-${P}`,
    },
  });
  activityId = activity.id;

  // Nama panjang dan nominal jutaan: isi terlebar yang biasa muncul.
  for (let i = 0; i < 4; i++) {
    const st = await prisma.student.create({
      data: { nis: `CT${stamp}${i}`, name: `Muhammad Rizky Firmansyah Ramadhan ${i}`, grade: 'XII', className: KELAS },
    });
    studentIds.push(st.id);
    const pt = await prisma.participant.create({ data: { activityId, studentId: st.id, billing: 12_650_000 } });
    if (i < 3) {
      await prisma.payment.create({
        data: {
          activityId, participantId: pt.id, amount: 11_250_000, date: new Date(Date.UTC(2088, 7, 1 + i)),
          method: i % 2 ? 'TRANSFER' : 'TUNAI', seq: i + 1, receiptNo: `CT-${P}/000${i + 1}`, createdById: user.id,
        },
      });
    }
  }
  await prisma.expense.create({
    data: {
      activityId, categoryId: expenseCategoryId, seq: 1, refNo: `BKK/CT-${P}/001`, date: new Date('2088-08-20'),
      description: 'Sewa bus pariwisata 3 unit (termasuk sopir dan BBM pulang-pergi)', amount: 18_500_000,
      method: 'TUNAI', createdById: user.id,
    },
  });

  const context = await browser.newContext();
  await context.addCookies([{ name: 'pbk_activity', value: activityId, domain: 'localhost', path: '/' }]);
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
  await prisma.schoolClass.deleteMany({ where: { name: KELAS } });
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await deleteE2eUser(user.id);
});

/** Tabel yang melewati tepi kanan area cetak — di kertas, bagian itu terpangkas. */
async function overflowingTables(): Promise<string[]> {
  return page.locator('[data-report] table').evaluateAll((tables) =>
    tables
      .filter((t) => t.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .map((t) => t.querySelector('thead')?.textContent ?? '?'),
  );
}

const reports = [
  { name: 'Laporan Keuangan', url: () => `/laporan/keuangan?activityId=${activityId}`, landscape: true, heading: 'Laporan Keuangan Kegiatan' },
  { name: 'Laporan Pembayaran', url: () => `/laporan/pembayaran?activityId=${activityId}`, landscape: false, heading: 'Laporan Pembayaran Siswa' },
  { name: 'Buku Kas', url: () => '/buku-kas', landscape: true, heading: 'Buku Kas' },
  { name: 'Rekap Pembayaran', url: () => '/rekap', landscape: false, heading: 'Rekap Pembayaran' },
];

for (const r of reports) {
  test(`${r.name} rapi saat dicetak`, async () => {
    const width = r.landscape ? A4_MELINTANG : A4_TEGAK;
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ media: 'print' });
    await page.goto(r.url());

    const report = page.locator('[data-report]');
    await expect(report.getByText(r.heading, { exact: true })).toBeVisible();
    // Judul halaman layar dan tombol cetak tidak ikut ke kertas.
    await expect(page.getByRole('button', { name: /^Cetak/ })).toBeHidden();

    // Semua kolom muat di lebar kertas, termasuk kolom uang di ujung kanan.
    expect(await overflowingTables()).toEqual([]);

    // Laporan berkolom banyak dicetak melintang.
    const pageName = await report.evaluate((el) => getComputedStyle(el).getPropertyValue('page'));
    expect(pageName).toBe(r.landscape ? 'melintang' : 'auto');

    // Tanda tangan dicetak dari footer tabel (menempel pada baris Total), dan
    // blok tanda tangan layar tidak ikut tercetak sebagai salinan kedua.
    const footerSignature = page.locator('tfoot [data-signature-row]');
    await expect(footerSignature).toBeVisible();
    await expect(footerSignature).toContainText(`Bendahara Cetak ${stamp}`);
    await expect(footerSignature.locator('xpath=preceding-sibling::tr').first()).toContainText('Total');
    await expect(report.getByText(`Bendahara Cetak ${stamp}`, { exact: true }).filter({ visible: true })).toHaveCount(1);
  });
}

test('di layar, tanda tangan tampil sebagai blok biasa, bukan di dalam tabel', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ media: 'screen' });
  await page.goto(`/laporan/pembayaran?activityId=${activityId}`);
  await expect(page.locator('tfoot [data-signature-row]')).toBeHidden();
  await expect(
    page.locator('[data-report]').getByText(`Bendahara Cetak ${stamp}`, { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  // Kolom Terkumpul di Rekap rata kanan seperti kolom angka lainnya, termasuk baris Total.
  await page.goto('/rekap');
  const aligns = await page
    .locator('table')
    .last()
    .evaluate((t) => [
      getComputedStyle(t.querySelector('thead th:last-child')!).textAlign,
      getComputedStyle(t.querySelector('tfoot tr:first-child td:last-child')!).textAlign,
    ]);
  expect(aligns).toEqual(['right', 'right']);
});
