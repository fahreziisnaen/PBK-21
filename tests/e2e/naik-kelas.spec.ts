import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Naik kelas: menaikkan tingkat, meluluskan kelas XII, dan membuka tahun
// pelajaran berikutnya.

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const stamp = Date.now().toString(36).toUpperCase();
const P = stamp.slice(-4);
const KELAS_X = `N${P}-X1`;
const KELAS_XI = `N${P}-XI1`;
const KELAS_XII = `N${P}-XII1`;

let user: E2eUser;
let page: Page;
const studentIds: string[] = [];
let yearId: string;
const createdYearNames: string[] = [];

// Tahun pelajaran jauh di depan supaya tidak bertabrakan dengan data dev.
const START = 2090;
const NAMA_SEKARANG = `${START}/${START + 1}`;
const NAMA_BERIKUT = `${START + 1}/${START + 2}`;

test.beforeAll(async ({ browser }) => {
  user = await createE2eUser({ role: 'BENDAHARA', withTotp: true });

  await prisma.schoolClass.createMany({
    data: [
      { name: KELAS_X, grade: 'X' },
      { name: KELAS_XI, grade: 'XI' },
      { name: KELAS_XII, grade: 'XII' },
    ],
  });

  // Tahun pelajaran lain dinonaktifkan sementara supaya uji ini menentukan
  // sendiri tahun berjalannya, apa pun isi database dev.
  await prisma.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } });
  const year = await prisma.academicYear.create({
    data: { name: NAMA_SEKARANG, startYear: START, isActive: true },
  });
  yearId = year.id;
  createdYearNames.push(NAMA_SEKARANG);

  const rows = [
    { nis: `NK${stamp}1`, name: `Naik X Satu ${stamp}`, grade: 'X' as const, className: KELAS_X },
    { nis: `NK${stamp}2`, name: `Naik X Dua ${stamp}`, grade: 'X' as const, className: KELAS_X },
    { nis: `NK${stamp}3`, name: `Naik XI Satu ${stamp}`, grade: 'XI' as const, className: KELAS_XI },
    { nis: `NK${stamp}4`, name: `Naik XII Satu ${stamp}`, grade: 'XII' as const, className: KELAS_XII },
  ];
  for (const r of rows) studentIds.push((await prisma.student.create({ data: r })).id);

  const context = await browser.newContext();
  page = await context.newPage();
  await loginAsFixture(page, user);
});

test.afterAll(async () => {
  await page.context().close();
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.schoolClass.deleteMany({ where: { name: { in: [KELAS_X, KELAS_XI, KELAS_XII] } } });
  await prisma.academicYear.deleteMany({ where: { name: { in: [...createdYearNames, NAMA_BERIKUT] } } });
  await prisma.academicYear.updateMany({ where: { id: yearId }, data: { isActive: false } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await deleteE2eUser(user.id);
});

test('halaman menunjukkan tahun sekarang dan tahun setelah naik kelas', async () => {
  await page.goto('/master/naik-kelas');
  // Nama tahunnya muncul di beberapa tempat (ringkasan dan daftar konfirmasi);
  // yang dibuktikan di sini keberadaannya, bukan jumlah kemunculannya.
  await expect(page.getByText(NAMA_SEKARANG).first()).toBeVisible();
  await expect(page.getByText(NAMA_BERIKUT).first()).toBeVisible();
  // Kelas XII tidak punya kelas tujuan — ia lulus.
  await expect(page.getByRole('row', { name: new RegExp(KELAS_XII) })).toContainText('Lulus');
});

test('menolak dijalankan tanpa teks konfirmasi yang benar', async () => {
  await page.goto('/master/naik-kelas');
  await page.getByLabel('Ketik NAIK KELAS untuk mengonfirmasi').fill('naik');
  await page.getByRole('button', { name: 'Jalankan Naik Kelas' }).click();

  // Dipersempit ke paragraf galat form: role="alert" juga dipakai route
  // announcer bawaan Next.js, yang selalu ada dan selalu kosong.
  await expect(page.locator('p[role="alert"]')).toContainText('NAIK KELAS');
  // Tidak ada yang berubah.
  const before = await prisma.student.findFirstOrThrow({ where: { nis: `NK${stamp}1` } });
  expect(before.grade).toBe('X');
  expect(await prisma.academicYear.findFirst({ where: { isActive: true } })).toMatchObject({ name: NAMA_SEKARANG });
});

test('menaikkan tingkat, memindahkan kelas, meluluskan XII, dan menyisakan yang tinggal kelas', async () => {
  await page.goto('/master/naik-kelas');

  // X-1 pindah ke XI-1; XI-1 tidak dipetakan, jadi siswanya naik tanpa kelas.
  await page.getByLabel(`Kelas tujuan untuk ${KELAS_X}`).selectOption(KELAS_XI);

  // Satu siswa X tinggal kelas.
  await page.getByRole('checkbox', { name: new RegExp(`Naik X Dua ${stamp}`) }).check();

  await page.getByLabel('Ketik NAIK KELAS untuk mengonfirmasi').fill('NAIK KELAS');
  await page.getByRole('button', { name: 'Jalankan Naik Kelas' }).click();
  await expect(page.getByText(/siswa naik kelas/)).toBeVisible();

  const after = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    orderBy: { nis: 'asc' },
  });
  const byNis = new Map(after.map((s) => [s.nis, s]));

  // Naik dan pindah kelas.
  expect(byNis.get(`NK${stamp}1`)).toMatchObject({ grade: 'XI', className: KELAS_XI, status: 'AKTIF' });
  // Tinggal kelas: tingkat dan kelasnya tidak disentuh sama sekali.
  expect(byNis.get(`NK${stamp}2`)).toMatchObject({ grade: 'X', className: KELAS_X, status: 'AKTIF' });
  // Naik tanpa kelas tujuan: tingkatnya naik, kelasnya dikosongkan.
  expect(byNis.get(`NK${stamp}3`)).toMatchObject({ grade: 'XII', className: null, status: 'AKTIF' });
  // Lulus: tingkatnya tetap XII, statusnya alumni, tahun kelulusannya tercatat.
  expect(byNis.get(`NK${stamp}4`)).toMatchObject({ grade: 'XII', status: 'ALUMNI', graduatedYear: NAMA_SEKARANG });

  // Tahun pelajaran berikutnya dibuat dan jadi berjalan.
  const active = await prisma.academicYear.findFirstOrThrow({ where: { isActive: true } });
  expect(active.name).toBe(NAMA_BERIKUT);
  createdYearNames.push(NAMA_BERIKUT);
});

test('alumni hilang dari daftar siswa aktif tetapi masih bisa dicari', async () => {
  await page.goto('/master/siswa?q=' + encodeURIComponent(`Naik XII Satu ${stamp}`));
  await expect(page.getByRole('row', { name: new RegExp(`Naik XII Satu ${stamp}`) })).toHaveCount(0);

  await page.goto('/master/siswa?status=ALUMNI&q=' + encodeURIComponent(`Naik XII Satu ${stamp}`));
  const row = page.getByRole('row', { name: new RegExp(`Naik XII Satu ${stamp}`) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Alumni');
});

test('siswa yang naik tanpa kelas bisa ditemukan lewat filter tanpa kelas', async () => {
  await page.goto('/master/siswa?kelas=-');
  await expect(page.getByRole('row', { name: new RegExp(`Naik XI Satu ${stamp}`) })).toBeVisible();
});
