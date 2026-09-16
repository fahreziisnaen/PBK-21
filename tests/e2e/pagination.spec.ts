import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Halaman berdata banyak dipotong per 50 baris, dan ringkasannya tetap
// menghitung seluruh data — bukan hanya yang tampil.

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

const stamp = Date.now().toString(36).toUpperCase();
const KELAS_A = `P${stamp.slice(-4)}A`;
const KELAS_B = `P${stamp.slice(-4)}B`;
const TOTAL = 60; // dua halaman, dengan sisa yang jelas di halaman kedua

let user: E2eUser;
let page: Page;
let activityId: string;
let categoryId: string;
const studentIds: string[] = [];

test.beforeAll(async ({ browser }) => {
  user = await createE2eUser({ role: 'BENDAHARA', withTotp: true });
  await prisma.schoolClass.createMany({
    data: [
      { name: KELAS_A, grade: 'X' },
      { name: KELAS_B, grade: 'XI' },
    ],
  });
  const category = await prisma.activityCategory.create({ data: { code: `PG${stamp.slice(-6)}`, name: `Kategori Paginasi ${stamp}` } });
  categoryId = category.id;
  const activity = await prisma.activity.create({
    data: {
      name: `Kegiatan Paginasi ${stamp}`, categoryId, year: 2088,
      startDate: new Date('2088-08-01'), endDate: new Date('2088-08-02'), location: 'Uji',
      contribution: 100_000, status: 'AKTIF', receiptPrefix: `PG-${stamp.slice(-4)}`,
    },
  });
  activityId = activity.id;

  for (let n = 0; n < TOTAL; n++) {
    const s = await prisma.student.create({
      data: {
        nis: `PG${stamp}${String(n).padStart(3, '0')}`,
        name: `Siswa Paginasi ${String(n).padStart(3, '0')} ${stamp}`,
        grade: n < 40 ? 'X' : 'XI',
        className: n < 40 ? KELAS_A : KELAS_B,
      },
    });
    studentIds.push(s.id);
  }

  const context = await browser.newContext();
  page = await context.newPage();
  await loginAsFixture(page, user);
  await context.addCookies([{ name: 'pbk_activity', value: activityId, domain: 'localhost', path: '/' }]);
});

test.afterAll(async () => {
  await page.context().close();
  await prisma.participant.deleteMany({ where: { activityId } });
  await prisma.activity.delete({ where: { id: activityId } }).catch(() => {});
  await prisma.activityCategory.delete({ where: { id: categoryId } }).catch(() => {});
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.schoolClass.deleteMany({ where: { name: { in: [KELAS_A, KELAS_B] } } });
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await deleteE2eUser(user.id);
});

test('data siswa dipotong 50 baris per halaman', async () => {
  // Stamp-nya saja: nama tiap siswa berbentuk "Siswa Paginasi 000 <stamp>",
  // jadi frasa dengan nomor di tengahnya bukan substring nama mana pun.
  await page.goto(`/master/siswa?q=${stamp}`);

  await expect(page.getByText(`Menampilkan 1–50 dari ${TOTAL} siswa`)).toBeVisible();
  // Baris ke-51 belum ada di halaman pertama.
  await expect(page.getByRole('row', { name: new RegExp(`Siswa Paginasi 050 ${stamp}`) })).toHaveCount(0);
  await expect(page.getByRole('row', { name: new RegExp(`Siswa Paginasi 000 ${stamp}`) })).toBeVisible();
});

test('berpindah halaman membawa filternya ikut serta', async () => {
  await page.goto(`/master/siswa?q=${stamp}`);
  await page.getByRole('link', { name: 'Berikutnya ›' }).click();

  // Filter pencariannya tidak hilang saat berpindah halaman.
  await expect(page).toHaveURL(new RegExp(`q=${stamp}`));
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(`Menampilkan 51–${TOTAL} dari ${TOTAL} siswa`)).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(`Siswa Paginasi 050 ${stamp}`) })).toBeVisible();

  // Di halaman terakhir, tombol Berikutnya tidak lagi bisa diklik.
  await expect(page.getByRole('link', { name: 'Berikutnya ›' })).toHaveCount(0);
});

test('menyaring tingkat mengubah jumlah halaman, bukan hanya isinya', async () => {
  await page.goto(`/master/siswa?q=${stamp}&grade=XI`);
  // 20 siswa tingkat XI — muat satu halaman.
  await expect(page.getByText('Menampilkan 1–20 dari 20 siswa')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Berikutnya ›' })).toHaveCount(0);
});

test('ringkasan peserta menghitung semua, bukan hanya satu halaman', async () => {
  // Seluruh siswa didaftarkan sebagai peserta kegiatan.
  await prisma.participant.createMany({
    data: studentIds.map((studentId) => ({ activityId, studentId, billing: 100_000 })),
  });

  await page.goto('/siswa');
  await expect(page.getByText(`Menampilkan 1–50 dari ${TOTAL} peserta`)).toBeVisible();

  // 60 × Rp100.000 — angkanya harus utuh meski tabelnya hanya menampilkan 50.
  const kpi = page.getByText('Total Tagihan', { exact: true }).locator('..');
  await expect(kpi).toContainText('Rp6.000.000');
});

test('modal daftarkan siswa bisa dicari dan disaring', async () => {
  // Peserta dikosongkan lagi supaya semuanya muncul di modal pendaftaran.
  await prisma.participant.deleteMany({ where: { activityId } });

  await page.goto('/siswa');
  await page.getByRole('button', { name: 'Daftarkan Siswa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Daftarkan Siswa ke Kegiatan' });

  await dialog.getByLabel('Cari siswa').fill('Paginasi 007');
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);

  await dialog.getByLabel('Cari siswa').fill('');
  await dialog.getByLabel('Tingkat siswa').selectOption('XI');
  await expect(dialog.getByRole('checkbox')).toHaveCount(20);
  // Daftar kelasnya ikut menyesuaikan tingkat.
  await expect(dialog.getByLabel('Kelas siswa').getByRole('option', { name: KELAS_A })).toHaveCount(0);

  // "Pilih yang tampil" hanya memilih yang lolos saringan.
  await dialog.getByRole('button', { name: /Pilih 20 yang tampil/ }).click();
  await expect(dialog.getByText('20 dipilih')).toBeVisible();

  await dialog.getByRole('button', { name: 'Daftarkan Terpilih' }).click();
  await expect(page.getByText('20 siswa didaftarkan')).toBeVisible();
  expect(await prisma.participant.count({ where: { activityId } })).toBe(20);
});

test('mempersempit saringan melepas centang yang tidak lagi tampil', async () => {
  await prisma.participant.deleteMany({ where: { activityId } });
  await page.goto('/siswa');
  await page.getByRole('button', { name: 'Daftarkan Siswa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Daftarkan Siswa ke Kegiatan' });

  await dialog.getByLabel('Tingkat siswa').selectOption('X');
  await dialog.getByRole('button', { name: /Pilih 40 yang tampil/ }).click();
  await expect(dialog.getByText('40 dipilih')).toBeVisible();

  // Berpindah ke tingkat lain: pilihan yang tersembunyi tidak boleh ikut
  // terkirim diam-diam — pengguna tidak akan tahu ia masih memilihnya.
  await dialog.getByLabel('Tingkat siswa').selectOption('XI');
  await expect(dialog.getByText('0 dipilih')).toBeVisible();
});

test('logo mengarah ke dashboard', async () => {
  await page.goto('/pembayaran');
  await page.getByRole('link', { name: 'Ke Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
