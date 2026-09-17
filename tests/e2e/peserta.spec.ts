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

test('data peserta tidak punya jalan membuat atau mengubah data siswa', async () => {
  await page.goto('/siswa');
  // Siswa ditambah dan diimpor di Data Siswa. Di sini hanya mengambil dari sana.
  await expect(page.getByRole('button', { name: '+ Tambah Siswa' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import Excel' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Daftarkan per Tingkat' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Daftarkan Siswa' })).toBeVisible();
});

test('mendaftarkan siswa dari data siswa lalu mengeluarkannya lagi', async () => {
  const student = await prisma.student.create({
    data: { nis: `PS${stamp}1`, name: `Siswa Peserta 1 ${stamp}`, grade: 'XI', className: CLASS },
  });
  studentIds.push(student.id);

  await page.goto('/siswa');
  await page.getByRole('button', { name: 'Daftarkan Siswa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Daftarkan Siswa ke Kegiatan' });
  await dialog.getByLabel('Cari siswa').fill(`PS${stamp}1`);
  await dialog.getByRole('checkbox', { name: new RegExp(`Siswa Peserta 1 ${stamp}`) }).check();
  await dialog.getByRole('button', { name: 'Daftarkan Terpilih' }).click();

  const row = page.getByRole('row', { name: new RegExp(`Siswa Peserta 1 ${stamp}`) });
  await expect(row).toBeVisible();

  // Belum ada pembayaran, jadi boleh dikeluarkan.
  await row.getByRole('button', { name: 'Keluarkan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keluarkan' }).click();
  await expect(page.getByRole('row', { name: new RegExp(`Siswa Peserta 1 ${stamp}`) })).toBeHidden();

  // Data siswanya tetap ada — yang dihapus hanya keikutsertaannya.
  expect(await prisma.student.findUnique({ where: { id: student.id } })).not.toBeNull();
  expect(await prisma.participant.count({ where: { activityId, studentId: student.id } })).toBe(0);
});

test('mendaftarkan satu tingkat sekaligus lewat saringan', async () => {
  for (const n of [2, 3]) {
    const s = await prisma.student.create({
      data: { nis: `PS${stamp}${n}`, name: `Siswa Peserta ${n} ${stamp}`, grade: 'XI', className: CLASS },
    });
    studentIds.push(s.id);
  }

  await page.goto('/siswa');
  await page.getByRole('button', { name: 'Daftarkan Siswa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Daftarkan Siswa ke Kegiatan' });
  // Dipersempit ke kelas uji ini: database dev bisa berisi siswa tingkat XI lain.
  await dialog.getByLabel('Tingkat siswa').selectOption('XI');
  await dialog.getByLabel('Kelas siswa').selectOption(CLASS);
  await dialog.getByRole('button', { name: /Pilih 3 yang tampil/ }).click();
  await dialog.getByRole('button', { name: 'Daftarkan Terpilih' }).click();

  await expect(page.getByText(/3 siswa didaftarkan/)).toBeVisible();
  const enrolled = await prisma.participant.findMany({ where: { activityId }, include: { student: true } });
  // Siswa 1 ikut terdaftar lagi: dikeluarkan dari kegiatan tidak menghapus
  // datanya, jadi ia muncul kembali di pilihan pendaftaran.
  expect(enrolled.map((p) => p.student.nis).sort()).toEqual([`PS${stamp}1`, `PS${stamp}2`, `PS${stamp}3`]);
  // Tagihan mengikuti kontribusi kegiatan.
  expect(enrolled.every((p) => p.billing === 300_000)).toBe(true);
});

test('ubah tagihan peserta tidak menyentuh data siswanya', async () => {
  const participant = await prisma.participant.findFirstOrThrow({
    where: { activityId, student: { nis: `PS${stamp}2` } },
    include: { student: true },
  });
  const before = participant.student;

  await page.goto('/siswa');
  const row = page.getByRole('row', { name: new RegExp(before.name) });
  await row.getByRole('button', { name: 'Ubah Tagihan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ubah Tagihan Peserta' });
  // Modalnya hanya punya kolom tagihan — nama dan kelas tidak bisa diubah dari sini.
  await expect(dialog.getByLabel('Nama Siswa')).toHaveCount(0);
  await expect(dialog.getByLabel('Kelas', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Tagihan (Rp)').fill('325000');
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText(/Tagihan .* diubah menjadi Rp325\.000/)).toBeVisible();

  const after = await prisma.participant.findUniqueOrThrow({ where: { id: participant.id }, include: { student: true } });
  expect(after.billing).toBe(325_000);
  expect(after.student).toMatchObject({ name: before.name, grade: before.grade, className: before.className, phone: before.phone });
  // Dikembalikan supaya uji berikutnya membaca tagihan asal.
  await prisma.participant.update({ where: { id: participant.id }, data: { billing: 300_000 } });
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
