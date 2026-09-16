import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Checkbox untuk aksi massal, pemilih kegiatan yang langsung berpindah, dan
// judul halaman yang menyebut kegiatan mana yang sedang dibuka.

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const stamp = Date.now().toString(36).toUpperCase();
const CLASS = `S${stamp.slice(-4)}`;
const SATU = `Kegiatan Satu ${stamp}`;
const DUA = `Kegiatan Dua ${stamp}`;

let bendahara: E2eUser;
let page: Page;
let satuId: string;
let duaId: string;
const studentIds: string[] = [];

test.beforeAll(async ({ browser }) => {
  bendahara = await createE2eUser({ role: 'BENDAHARA', withTotp: true });
  const category = await prisma.activityCategory.create({ data: { code: `S${stamp.slice(-7)}`, name: `Kategori Seleksi ${stamp}` } });
  await prisma.schoolClass.create({ data: { name: CLASS, grade: 'X' } });

  const base = {
    categoryId: category.id,
    year: 2096,
    startDate: new Date('2096-06-01'),
    endDate: new Date('2096-06-02'),
    location: 'Uji Seleksi',
    contribution: 400_000,
    status: 'AKTIF' as const,
  };
  satuId = (await prisma.activity.create({ data: { ...base, name: SATU, receiptPrefix: `S1-${stamp.slice(-4)}` } })).id;
  duaId = (await prisma.activity.create({ data: { ...base, name: DUA, receiptPrefix: `S2-${stamp.slice(-4)}` } })).id;

  // Lima siswa, semuanya belum terdaftar di kegiatan mana pun.
  for (const n of [1, 2, 3, 4, 5]) {
    const s = await prisma.student.create({
      data: { nis: `SL${stamp}${n}`, name: `Siswa Seleksi ${n} ${stamp}`, grade: 'X', className: CLASS },
    });
    studentIds.push(s.id);
  }

  const context = await browser.newContext();
  page = await context.newPage();
  await loginAsFixture(page, bendahara);
  await context.addCookies([{ name: 'pbk_activity', value: satuId, domain: 'localhost', path: '/' }]);
});

test.afterAll(async () => {
  await page.context().close();
  await prisma.payment.deleteMany({ where: { activityId: { in: [satuId, duaId] } } });
  await prisma.participant.deleteMany({ where: { activityId: { in: [satuId, duaId] } } });
  await prisma.activity.deleteMany({ where: { id: { in: [satuId, duaId] } } });
  await prisma.activityCategory.deleteMany({ where: { name: `Kategori Seleksi ${stamp}` } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.schoolClass.deleteMany({ where: { name: CLASS } });
  await prisma.auditLog.deleteMany({ where: { userId: bendahara.id } });
  await deleteE2eUser(bendahara.id);
});

test('mendaftarkan beberapa siswa sekaligus lewat centang', async () => {
  await page.goto('/siswa');
  await page.getByRole('button', { name: 'Daftarkan Siswa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Daftarkan Siswa ke Kegiatan' });

  for (const n of [1, 2, 3]) {
    await dialog.getByRole('checkbox', { name: new RegExp(`Siswa Seleksi ${n} ${stamp}`) }).check();
  }
  await dialog.getByRole('button', { name: 'Daftarkan Terpilih' }).click();
  await expect(page.getByText('3 siswa didaftarkan')).toBeVisible();

  const enrolled = await prisma.participant.findMany({ where: { activityId: satuId }, include: { student: true } });
  expect(enrolled.map((p) => p.student.nis).sort()).toEqual([`SL${stamp}1`, `SL${stamp}2`, `SL${stamp}3`]);
  expect(enrolled.every((p) => p.billing === 400_000)).toBe(true);
});

test('mengeluarkan beberapa peserta sekaligus, dan yang sudah bayar dilewati', async () => {
  // Siswa 1 sudah punya kuitansi, jadi harus dilewati saat dikeluarkan massal.
  const sudahBayar = await prisma.participant.findFirstOrThrow({ where: { activityId: satuId, student: { nis: `SL${stamp}1` } } });
  await prisma.payment.create({
    data: {
      activityId: satuId,
      participantId: sudahBayar.id,
      amount: 150_000,
      date: new Date(),
      method: 'TUNAI',
      seq: 1,
      receiptNo: `S1-${stamp.slice(-4)}/0001`,
      createdById: bendahara.id,
    },
  });

  await page.goto('/siswa');
  await page.getByRole('checkbox', { name: 'Pilih semua' }).check();
  await expect(page.getByText('3 siswa dipilih')).toBeVisible();

  await page.getByRole('button', { name: 'Keluarkan Terpilih' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keluarkan Terpilih' }).click();

  await expect(page.getByText(/2 siswa dikeluarkan/)).toBeVisible();
  const left = await prisma.participant.findMany({ where: { activityId: satuId }, include: { student: true } });
  expect(left.map((p) => p.student.nis)).toEqual([`SL${stamp}1`]);
});

test('memilih kegiatan langsung berpindah tanpa tombol Ganti', async () => {
  await page.goto('/siswa');
  await expect(page.getByRole('button', { name: 'Ganti' })).toHaveCount(0);

  // Judul menyebut kegiatan yang sedang dibuka.
  await expect(page.getByText(SATU, { exact: true })).toBeVisible();

  await page.getByLabel('KEGIATAN').selectOption(duaId);

  // Berpindah sendiri: judulnya berganti tanpa klik apa pun lagi.
  await expect(page.getByText(DUA, { exact: true })).toBeVisible();
  await expect(page.getByText(SATU, { exact: true })).toHaveCount(0);

  // Dan pilihannya bertahan saat pindah halaman.
  await page.goto('/pembayaran');
  await expect(page.getByText(DUA, { exact: true })).toBeVisible();
});
