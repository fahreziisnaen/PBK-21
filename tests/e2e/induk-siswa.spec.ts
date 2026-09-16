import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Data induk siswa: seluruh siswa sekolah, lepas dari kegiatan mana pun.

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const stamp = Date.now().toString(36).toUpperCase();
const KELAS = `I${stamp.slice(-4)}-1`;
const NYASAR = `I${stamp.slice(-4)}X`;

let user: E2eUser;
let page: Page;
const studentIds: string[] = [];

test.beforeAll(async ({ browser }) => {
  user = await createE2eUser({ role: 'BENDAHARA', withTotp: true });
  await prisma.schoolClass.createMany({
    data: [
      { name: KELAS, grade: 'X' },
      { name: NYASAR, grade: 'X' },
    ],
  });

  // Tiga siswa yang TIDAK diikutkan kegiatan apa pun — persis keadaan yang
  // membuat mereka tak terlihat di halaman Data Siswa.
  for (const [n, kelas] of [[1, KELAS], [2, KELAS], [3, NYASAR]] as const) {
    const s = await prisma.student.create({
      data: { nis: `IN${stamp}${n}`, name: `Siswa Induk ${n} ${stamp}`, grade: 'X', className: kelas },
    });
    studentIds.push(s.id);
  }
  // Satu siswa tanpa kelas sama sekali.
  const tanpa = await prisma.student.create({
    data: { nis: `IN${stamp}9`, name: `Siswa Tanpa Kelas ${stamp}`, grade: 'XI', className: null },
  });
  studentIds.push(tanpa.id);

  const context = await browser.newContext();
  page = await context.newPage();
  await loginAsFixture(page, user);
});

test.afterAll(async () => {
  await page.context().close();
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.schoolClass.deleteMany({ where: { name: { in: [KELAS, NYASAR] } } });
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await deleteE2eUser(user.id);
});

test('menampilkan siswa yang tidak ikut kegiatan apa pun', async () => {
  await page.goto('/master/siswa');
  await expect(page.getByRole('row', { name: new RegExp(`Siswa Induk 1 ${stamp}`) })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(`Siswa Tanpa Kelas ${stamp}`) })).toBeVisible();
});

test('filter kelas menemukan siswa di kelas nyasar', async () => {
  // Inti masalahnya: sebelum halaman ini ada, siswa satu-satunya di sebuah
  // kelas salah ketik tidak bisa ditemukan di mana pun.
  await page.goto(`/master/siswa?kelas=${encodeURIComponent(NYASAR)}`);
  const rows = page.getByRole('row').filter({ hasText: new RegExp(`Siswa Induk`) });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(`Siswa Induk 3 ${stamp}`);
});

test('filter "tanpa kelas" menemukan siswa yang kelasnya kosong', async () => {
  await page.goto('/master/siswa?kelas=-');
  await expect(page.getByRole('row', { name: new RegExp(`Siswa Tanpa Kelas ${stamp}`) })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(`Siswa Induk 1 ${stamp}`) })).toHaveCount(0);
});

test('angka siswa di master kelas menaut ke daftar kelas itu', async () => {
  await page.goto('/master/kelas');
  const row = page.getByRole('row', { name: new RegExp(NYASAR) });
  await row.getByRole('link', { name: '1' }).click();

  await expect(page).toHaveURL(new RegExp(`/master/siswa\\?kelas=${NYASAR}`));
  await expect(page.getByRole('row', { name: new RegExp(`Siswa Induk 3 ${stamp}`) })).toBeVisible();
});

test('memindahkan siswa nyasar ke kelas yang benar', async () => {
  await page.goto(`/master/siswa?kelas=${encodeURIComponent(NYASAR)}`);
  await page.getByRole('row', { name: new RegExp(`Siswa Induk 3 ${stamp}`) }).getByRole('button', { name: 'Edit' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit Data Siswa' });
  await dialog.getByLabel('Kelas', { exact: true }).selectOption(KELAS);
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText(/disimpan/)).toBeVisible();

  const moved = await prisma.student.findFirstOrThrow({ where: { nis: `IN${stamp}3` } });
  expect(moved.className).toBe(KELAS);

  // Kelas nyasarnya kini kosong, jadi bisa dihapus dari master.
  await page.goto('/master/kelas');
  const row = page.getByRole('row', { name: new RegExp(NYASAR) });
  await expect(row.getByRole('button', { name: 'Hapus' })).toBeVisible();
});

test('filter menerapkan diri tanpa tombol, dan kelas mengikuti tingkat', async () => {
  // Kelas pembanding di tingkat lain, untuk membuktikan daftarnya menyusut.
  const lain = `I${stamp.slice(-4)}-XII`;
  await prisma.schoolClass.create({ data: { name: lain, grade: 'XII' } });

  await page.goto('/master/siswa');
  // Tidak ada lagi tombol Terapkan.
  await expect(page.getByRole('button', { name: 'Terapkan' })).toHaveCount(0);

  const kelasSelect = page.getByLabel('Kelas', { exact: true });
  await expect(kelasSelect.getByRole('option', { name: lain })).toHaveCount(1);

  // Memilih tingkat langsung menyaring, tanpa menekan apa pun.
  await page.getByLabel('Tingkat').selectOption('X');
  await expect(page).toHaveURL(/grade=X/);
  // Dan kelas tingkat XII hilang dari pilihan.
  await expect(kelasSelect.getByRole('option', { name: lain })).toHaveCount(0);
  await expect(kelasSelect.getByRole('option', { name: KELAS })).toHaveCount(1);

  // Kelas terpilih yang tidak lagi masuk tingkatnya ikut dilepas.
  await kelasSelect.selectOption(KELAS);
  await expect(page).toHaveURL(new RegExp(`kelas=${KELAS}`));
  await page.getByLabel('Tingkat').selectOption('XII');
  await expect(page).toHaveURL(/grade=XII/);
  await expect(page).not.toHaveURL(new RegExp(`kelas=${KELAS}`));

  await prisma.schoolClass.deleteMany({ where: { name: lain } });
});
