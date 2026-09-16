import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Menambah dan mengeluarkan peserta dari kegiatan yang sedang dipilih.

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const stamp = Date.now().toString(36).toUpperCase();
const CLASS = `P${stamp.slice(-4)}`;

let bendahara: E2eUser;
let page: Page;
let activityId: string;
const studentIds: string[] = [];

test.beforeAll(async ({ browser }) => {
  bendahara = await createE2eUser({ role: 'BENDAHARA', withTotp: true });
  const category = await prisma.activityCategory.create({ data: { code: `P${stamp.slice(-7)}`, name: `Kategori Peserta ${stamp}` } });
  await prisma.schoolClass.create({ data: { name: CLASS, grade: 'XI' } });
  const activity = await prisma.activity.create({
    data: {
      name: `Kegiatan Peserta ${stamp}`,
      categoryId: category.id,
      year: 2097,
      startDate: new Date('2097-05-01'),
      endDate: new Date('2097-05-02'),
      location: 'Uji Peserta',
      contribution: 300_000,
      status: 'AKTIF',
      receiptPrefix: `PS-${stamp.slice(-4)}`,
    },
  });
  activityId = activity.id;

  const context = await browser.newContext();
  page = await context.newPage();
  await loginAsFixture(page, bendahara);
  await context.addCookies([{ name: 'pbk_activity', value: activityId, domain: 'localhost', path: '/' }]);
});

test.afterAll(async () => {
  await page.context().close();
  await prisma.payment.deleteMany({ where: { activityId } });
  await prisma.participant.deleteMany({ where: { activityId } });
  await prisma.activity.delete({ where: { id: activityId } }).catch(() => {});
  await prisma.activityCategory.deleteMany({ where: { name: `Kategori Peserta ${stamp}` } });
  await prisma.student.deleteMany({ where: { OR: [{ id: { in: studentIds } }, { className: CLASS }] } });
  await prisma.schoolClass.deleteMany({ where: { name: CLASS } });
  await prisma.auditLog.deleteMany({ where: { userId: bendahara.id } });
  await deleteE2eUser(bendahara.id);
});

test('menambah peserta satu per satu lalu mengeluarkannya lagi', async () => {
  await page.goto('/siswa');
  await page.getByRole('button', { name: '+ Tambah Siswa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tambah Siswa' });
  await dialog.getByLabel('NIS').fill(`PS${stamp}1`);
  await dialog.getByLabel('Nama Siswa').fill(`Siswa Peserta 1 ${stamp}`);
  await dialog.getByLabel('Kelas', { exact: true }).selectOption(CLASS);
  await dialog.getByRole('button', { name: 'Simpan' }).click();

  const row = page.getByRole('row', { name: new RegExp(`Siswa Peserta 1 ${stamp}`) });
  await expect(row).toBeVisible();
  const student = await prisma.student.findFirstOrThrow({ where: { nis: `PS${stamp}1` } });
  studentIds.push(student.id);

  // Belum ada pembayaran, jadi boleh dikeluarkan.
  await row.getByRole('button', { name: 'Keluarkan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keluarkan' }).click();
  await expect(page.getByRole('row', { name: new RegExp(`Siswa Peserta 1 ${stamp}`) })).toBeHidden();

  // Data siswanya tetap ada — yang dihapus hanya keikutsertaannya.
  expect(await prisma.student.findUnique({ where: { id: student.id } })).not.toBeNull();
  expect(await prisma.participant.count({ where: { activityId, studentId: student.id } })).toBe(0);
});

test('mendaftarkan satu tingkat sekaligus', async () => {
  for (const n of [2, 3]) {
    const s = await prisma.student.create({
      data: { nis: `PS${stamp}${n}`, name: `Siswa Peserta ${n} ${stamp}`, grade: 'XI', className: CLASS },
    });
    studentIds.push(s.id);
  }

  await page.goto('/siswa');
  await page.getByRole('button', { name: 'Daftarkan per Tingkat' }).click();
  const dialog = page.getByRole('dialog', { name: 'Daftarkan Seluruh Siswa Satu Tingkat' });
  await dialog.getByLabel('Tingkat').selectOption('XI');
  await dialog.getByRole('button', { name: 'Daftarkan' }).click();

  await expect(page.getByText(/siswa tingkat XI didaftarkan/)).toBeVisible();
  const enrolled = await prisma.participant.findMany({ where: { activityId }, include: { student: true } });
  // Siswa 1 ikut terdaftar lagi: dikeluarkan dari kegiatan tidak menghapus
  // datanya, jadi pendaftaran per tingkat menjangkaunya kembali.
  expect(enrolled.map((p) => p.student.nis).sort()).toEqual([`PS${stamp}1`, `PS${stamp}2`, `PS${stamp}3`]);
  // Tagihan mengikuti kontribusi kegiatan.
  expect(enrolled.every((p) => p.billing === 300_000)).toBe(true);
});

test('peserta yang kuitansinya sudah dibatalkan tetap tidak bisa dikeluarkan', async () => {
  const participant = await prisma.participant.findFirstOrThrow({
    where: { activityId, student: { nis: `PS${stamp}2` } },
    include: { student: true },
  });

  // Satu pembayaran yang lalu dibatalkan: `paid` kembali nol, tetapi baris
  // kuitansinya tetap ada sebagai catatan dan menahan penghapusan peserta.
  await prisma.payment.create({
    data: {
      activityId,
      participantId: participant.id,
      amount: 100_000,
      date: new Date(),
      method: 'TUNAI',
      seq: 1,
      receiptNo: `PS-${stamp.slice(-4)}/0001`,
      createdById: bendahara.id,
      status: 'DIBATALKAN',
      cancelledAt: new Date(),
      cancelledById: bendahara.id,
    },
  });

  await page.goto('/siswa');
  const row = page.getByRole('row', { name: new RegExp(participant.student.name) });
  await expect(row).toContainText('Rp0');
  // Tombolnya disembunyikan, bukan ditampilkan lalu gagal saat diklik.
  await expect(row.getByRole('button', { name: 'Keluarkan' })).toBeHidden();
});
