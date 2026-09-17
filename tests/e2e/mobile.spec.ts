import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Setiap halaman harus terbaca di layar ponsel: tidak ada geser ke samping,
// dan isi halaman tidak terdorong jauh ke bawah oleh navigasi.

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const SHOT_DIR = process.env.PBK_SHOT_DIR;
const stamp = Date.now().toString(36).toUpperCase();
const CLASS = `M${stamp.slice(-4)}`;

let user: E2eUser;
let page: Page;
let activityId: string;
const studentIds: string[] = [];

const ROUTES = [
  '/dashboard',
  '/pembayaran',
  '/pengeluaran',
  '/buku-kas',
  '/siswa',
  '/master/siswa',
  '/rekap',
  '/master/kegiatan',
  '/master/kelas',
  '/laporan/keuangan',
  '/laporan/pembayaran',
  '/kuitansi',
  '/pengguna',
  '/pengaturan',
  '/profil',
  '/pemeliharaan',
];

const PHONE = { width: 390, height: 844 } as const;

test.beforeAll(async ({ browser }) => {
  user = await createE2eUser({ role: 'SUPERADMIN', withTotp: true });
  const category = await prisma.activityCategory.create({ data: { code: `M${stamp.slice(-7)}`, name: `Kategori Mobile ${stamp}` } });
  const cls = await prisma.schoolClass.create({ data: { name: CLASS, grade: 'XII' } });
  const activity = await prisma.activity.create({
    data: {
      name: `Studi Lapangan Angkatan ${stamp}`,
      categoryId: category.id,
      year: 2099,
      startDate: new Date('2099-04-01'),
      endDate: new Date('2099-04-03'),
      location: 'Uji Mobile',
      contribution: 1_750_000,
      status: 'AKTIF',
      receiptPrefix: `MB-${stamp.slice(-4)}`,
    },
  });
  activityId = activity.id;
  for (const n of [1, 2, 3]) {
    const student = await prisma.student.create({
      data: { nis: `MB${stamp}${n}`, name: `Siswa Mobile ${n} ${stamp}`, grade: 'XII', className: cls.name },
    });
    studentIds.push(student.id);
    const participant = await prisma.participant.create({ data: { activityId, studentId: student.id, billing: 1_750_000 } });
    if (n === 1) {
      await prisma.payment.create({
        data: {
          activityId,
          participantId: participant.id,
          amount: 750_000,
          date: new Date(),
          method: 'TRANSFER',
          seq: 1,
          receiptNo: `MB-${stamp.slice(-4)}/0001`,
          createdById: user.id,
        },
      });
    }
  }

  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  page = await context.newPage();
  await loginAsFixture(page, user);
  await context.addCookies([{ name: 'pbk_activity', value: activityId, domain: 'localhost', path: '/' }]);
});

test.afterAll(async () => {
  await page.context().close();
  await prisma.payment.deleteMany({ where: { activityId } });
  await prisma.participant.deleteMany({ where: { activityId } });
  await prisma.activity.delete({ where: { id: activityId } }).catch(() => {});
  await prisma.activityCategory.deleteMany({ where: { name: `Kategori Mobile ${stamp}` } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.schoolClass.deleteMany({ where: { name: CLASS } });
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await deleteE2eUser(user.id);
});

test('tidak ada halaman yang menggeser ke samping di layar ponsel', async () => {
  const report: string[] = [];
  const overflowing: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => {
      const main = document.querySelector('main');
      return {
        docScroll: document.documentElement.scrollWidth,
        docClient: document.documentElement.clientWidth,
        // Seberapa jauh isi halaman terdorong ke bawah oleh navigasi.
        mainTop: main ? Math.round(main.getBoundingClientRect().top + window.scrollY) : -1,
        docHeight: document.documentElement.scrollHeight,
      };
    });
    report.push(`${route.padEnd(24)} lebar ${m.docScroll}/${m.docClient}  isi mulai di ${m.mainTop}px  tinggi ${m.docHeight}px`);
    // Toleransi 1px untuk pembulatan sub-piksel.
    if (m.docScroll > m.docClient + 1) overflowing.push(`${route} (${m.docScroll} > ${m.docClient})`);
    if (SHOT_DIR) {
      const culprits = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.right <= w + 1) continue;
          // Hanya elemen terdalam yang melebar — induknya ikut melebar karenanya.
          if (Array.from(el.children).some((c) => c.getBoundingClientRect().right > w + 1)) continue;
          out.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').slice(0, 3).join('.')} → ${Math.round(r.right)}px`);
        }
        return out.slice(0, 6);
      });
      if (culprits.length) console.log(`  ${route}: ${culprits.join(' | ')}`);
      await page.screenshot({ path: `${SHOT_DIR}/${route.replace(/\//g, '_') || 'root'}.png` });
    }
  }
  console.log('\n' + report.join('\n') + '\n');
  expect(overflowing, `halaman menggeser ke samping: ${overflowing.join(', ')}`).toEqual([]);
});

test('laci menu bisa dibuka, membawa ke halaman lain, lalu menutup sendiri', async () => {
  await page.goto('/dashboard');

  // Tertutup: tautan nav tidak bisa diklik sampai menunya dibuka.
  const dataSiswa = page.getByRole('link', { name: 'Data Peserta' });
  await expect(dataSiswa).toBeHidden();

  await page.getByRole('button', { name: 'Buka menu' }).click();
  await expect(dataSiswa).toBeVisible();
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/_laci-terbuka.png` });

  await dataSiswa.click();
  await page.waitForURL(/\/siswa$/);
  // Menutup sendiri setelah pindah halaman, bukan menutupi isi halaman baru.
  await expect(page.getByRole('link', { name: 'Rekap Pembayaran' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Data Peserta' })).toBeVisible();
});

test('kuitansi dan halaman login muat di layar ponsel', async ({ browser }) => {
  const payment = await prisma.payment.findFirstOrThrow({ where: { activityId } });
  await page.goto(`/kuitansi?id=${payment.id}`);
  // Judul halaman "Kuitansi" dan judul dokumennya "KUITANSI" — yang dicari yang kedua.
  await expect(page.getByRole('heading', { name: 'KUITANSI', exact: true })).toBeVisible();
  const receipt = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(receipt.scroll).toBeLessThanOrEqual(receipt.client + 1);

  // Kartu kuitansi memakai overflow-hidden, jadi isi yang terlalu lebar
  // terpangkas tanpa menimbulkan gulir — halaman tetap 390px tapi tanggal dan
  // nama bendahara hilang. Diperiksa terhadap tepi kartunya, bukan tepi layar.
  const clipped = await page.evaluate(() => {
    const cardRight = document.getElementById('kuitansi')!.getBoundingClientRect().right;
    return Array.from(document.querySelectorAll('#kuitansi *'))
      .filter((el) => el.getBoundingClientRect().right > cardRight + 1)
      .map((el) => `${el.tagName.toLowerCase()}: ${(el.textContent ?? '').trim().slice(0, 40)}`);
  });
  expect(clipped, `isi kuitansi terpotong: ${clipped.join(' | ')}`).toEqual([]);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/_kuitansi-detail.png` });

  const guest = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const guestPage = await guest.newPage();
  await guestPage.goto('/login');
  await expect(guestPage.getByLabel('Username')).toBeVisible();
  const login = await guestPage.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(login.scroll).toBeLessThanOrEqual(login.client + 1);
  if (SHOT_DIR) await guestPage.screenshot({ path: `${SHOT_DIR}/_login.png` });
  await guest.close();
});

/** Kotak batas sebuah isian; gagal jelas bila isiannya tidak dirender. */
async function box(locator: import('@playwright/test').Locator) {
  await expect(locator).toBeVisible();
  const b = await locator.boundingBox();
  if (!b) throw new Error('isian tidak punya kotak batas');
  return b;
}

/** Dua isian berbagi satu baris dan masing-masing kira-kira separuh lebarnya. */
async function expectSideBySide(a: import('@playwright/test').Locator, b: import('@playwright/test').Locator, rowWidth: number) {
  const [ba, bb] = [await box(a), await box(b)];
  expect(Math.abs(ba.y - bb.y), 'tidak sebaris').toBeLessThan(2);
  expect(ba.width).toBeGreaterThan(rowWidth * 0.4);
  expect(bb.width).toBeGreaterThan(rowWidth * 0.4);
}

test('penyaring tersusun dua kolom yang rapi di layar ponsel', async () => {
  // Pembayaran: kotak cari selebar baris, metode dan status berdampingan,
  // pasangan tanggal sebaris — dan tidak ada tombol Terapkan lagi.
  await page.goto('/pembayaran');
  const search = await box(page.getByLabel('Cari pembayaran'));
  await expectSideBySide(page.getByLabel('Metode'), page.getByLabel('Status'), search.width);
  await expectSideBySide(page.getByLabel('Dari tanggal'), page.getByLabel('Sampai tanggal'), search.width * 0.9);
  expect(search.width).toBeGreaterThan(PHONE.width - 60);
  await expect(page.getByRole('button', { name: 'Terapkan' })).toHaveCount(0);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/_filter-pembayaran.png` });

  // Data Siswa.
  await page.goto('/master/siswa');
  const cari = await box(page.getByLabel('Cari', { exact: true }));
  expect(cari.width).toBeGreaterThan(PHONE.width - 60);
  await expectSideBySide(page.getByLabel('Tingkat', { exact: true }), page.getByLabel('Kelas', { exact: true }), cari.width);

  // Laporan Keuangan: tujuh penyaring dulu satu kolom setinggi hampir satu layar.
  await page.goto('/laporan/keuangan');
  const kegiatan = await box(page.getByLabel('Kegiatan', { exact: true }));
  await expectSideBySide(page.getByLabel('Tingkat', { exact: true }), page.getByLabel('Kelas', { exact: true }), kegiatan.width);
  const form = await box(page.locator('form[aria-busy]').first());
  expect(form.height, 'panel penyaring laporan terlalu tinggi').toBeLessThan(320);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/_filter-laporan.png` });
});

test('pemilih siswa di catat pembayaran nyaman dipakai di ponsel', async () => {
  await page.goto('/pembayaran');
  await page.getByRole('button', { name: '+ Catat Pembayaran' }).click();
  const dialog = page.getByRole('dialog', { name: 'Catat Pembayaran' });

  const cari = await box(dialog.getByLabel('Cari siswa'));
  await expectSideBySide(dialog.getByLabel('Tingkat siswa'), dialog.getByLabel('Kelas siswa'), cari.width);
  await dialog.getByLabel('Cari siswa').fill(`Siswa Mobile 2 ${stamp}`);
  const choice = dialog.getByRole('radio', { name: new RegExp(`Siswa Mobile 2 ${stamp}`) });
  await choice.check();
  await expect(dialog.getByText(`Dipilih: Siswa Mobile 2 ${stamp}`)).toBeVisible();

  const overflow = await dialog.evaluate((d) => d.scrollWidth - d.clientWidth);
  expect(overflow, 'modal menggeser ke samping').toBeLessThanOrEqual(1);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/_pemilih-pembayaran.png` });
});
