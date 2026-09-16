import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Data dari versi sebelum master kelas ada: kolom kelas siswa diisi bebas,
// sehingga setelah pemutakhiran siswa punya kelas tetapi masternya kosong.

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const stamp = Date.now().toString(36).toUpperCase();
const KELAS_A = `W${stamp.slice(-4)}-1`;
const KELAS_B = `W${stamp.slice(-4)}-2`;

let user: E2eUser;
let page: Page;
let activityId: string;
let categoryId: string;
const studentIds: string[] = [];

test.beforeAll(async ({ browser }) => {
  user = await createE2eUser({ role: 'BENDAHARA', withTotp: true });

  // Ditulis langsung ke tabel siswa, tanpa baris SchoolClass — persis bentuk
  // data yang ditinggalkan versi lama, yang tidak punya master kelas.
  const rows = [
    { nis: `WR${stamp}1`, name: `Siswa Warisan 1 ${stamp}`, grade: 'XI' as const, className: KELAS_A },
    { nis: `WR${stamp}2`, name: `Siswa Warisan 2 ${stamp}`, grade: 'XI' as const, className: KELAS_A },
    // Satu siswa bertingkat beda di kelas yang sama: tingkat kelasnya harus
    // mengikuti yang terbanyak (XI), bukan baris yang kebetulan terbaca lebih dulu.
    { nis: `WR${stamp}3`, name: `Siswa Warisan 3 ${stamp}`, grade: 'X' as const, className: KELAS_A },
    { nis: `WR${stamp}4`, name: `Siswa Warisan 4 ${stamp}`, grade: 'XII' as const, className: KELAS_B },
  ];
  for (const r of rows) studentIds.push((await prisma.student.create({ data: r })).id);

  // Halaman Data Siswa hanya merender formnya bila ada kegiatan aktif, jadi
  // kegiatannya dibuat di sini — bukan menggantungkan uji pada isi database
  // yang kebetulan ada, yang membuat ujinya dilewati diam-diam.
  const category = await prisma.activityCategory.create({ data: { code: `W${stamp.slice(-7)}`, name: `Kategori Warisan ${stamp}` } });
  categoryId = category.id;
  const activity = await prisma.activity.create({
    data: {
      name: `Kegiatan Warisan ${stamp}`,
      categoryId: category.id,
      year: 2094,
      startDate: new Date('2094-08-01'),
      endDate: new Date('2094-08-02'),
      location: 'Uji Warisan',
      contribution: 500_000,
      status: 'AKTIF',
      receiptPrefix: `WR-${stamp.slice(-4)}`,
    },
  });
  activityId = activity.id;

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

test('kelas warisan tidak ada di master, dan itu terlihat di halamannya', async () => {
  expect(await prisma.schoolClass.count({ where: { name: { in: [KELAS_A, KELAS_B] } } })).toBe(0);

  await page.goto('/master/kelas');
  await expect(page.getByRole('button', { name: /Tarik \d+ Kelas dari Data Siswa/ })).toBeVisible();
});

test('menariknya ke master memakai tingkat siswa terbanyak', async () => {
  await page.goto('/master/kelas');
  await page.getByRole('button', { name: /Tarik \d+ Kelas dari Data Siswa/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tarik Sekarang' }).click();
  await expect(page.getByText(/kelas ditarik dari data siswa/)).toBeVisible();

  const created = await prisma.schoolClass.findMany({
    where: { name: { in: [KELAS_A, KELAS_B] } },
    orderBy: { name: 'asc' },
  });
  expect(created.map((c) => c.name)).toEqual([KELAS_A, KELAS_B]);
  // KELAS_A dipakai dua siswa XI dan satu siswa X — yang menang XI.
  expect(created.find((c) => c.name === KELAS_A)?.grade).toBe('XI');
  expect(created.find((c) => c.name === KELAS_B)?.grade).toBe('XII');

  // Data siswanya sendiri tidak disentuh.
  const students = await prisma.student.findMany({ where: { id: { in: studentIds } } });
  expect(students.filter((s) => s.className === KELAS_A)).toHaveLength(3);
});

test('setelah ditarik, kelasnya bisa dipilih untuk siswa baru', async () => {
  await page.goto('/siswa');
  await page.getByRole('button', { name: '+ Tambah Siswa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tambah Siswa' });
  await expect(dialog.getByLabel('Kelas', { exact: true }).getByRole('option', { name: new RegExp(KELAS_A) })).toHaveCount(1);
});

test('menarik dua kali tidak menggandakan apa pun', async () => {
  await page.goto('/master/kelas');
  // Tombolnya hilang karena tidak ada lagi kelas yatim yang tersisa.
  await expect(page.getByRole('button', { name: /Tarik \d+ Kelas dari Data Siswa/ })).toHaveCount(0);
  expect(await prisma.schoolClass.count({ where: { name: { in: [KELAS_A, KELAS_B] } } })).toBe(2);
});
