import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Kuitansi dipusatkan dengan `mx-auto`, yang menjadi margin kiri nyata. Bila
// margin itu ikut tersalin ke gambar, hasilnya tergeser ke kanan dan sisi
// kanannya terpotong — persis seperti yang terjadi sebelum perbaikan ini.

test.setTimeout(180_000);

const stamp = Date.now().toString(36).toUpperCase();
let user: E2eUser;
let paymentId: string;
const cleanup: (() => Promise<unknown>)[] = [];

test.beforeAll(async () => {
  user = await createE2eUser({ role: 'BENDAHARA', withTotp: true });
  const cat = await prisma.activityCategory.create({ data: { code: `Q${stamp.slice(-6)}`, name: `Kategori JPG ${stamp}` } });
  const cls = await prisma.schoolClass.create({ data: { name: `Q${stamp.slice(-4)}`, grade: 'XII' } });
  const act = await prisma.activity.create({
    data: {
      name: `Kegiatan JPG ${stamp}`, categoryId: cat.id, year: 2086,
      startDate: new Date('2086-09-01'), endDate: new Date('2086-09-02'), location: 'Uji JPG',
      contribution: 650_000, status: 'AKTIF', receiptPrefix: `QJ-${stamp.slice(-4)}`,
    },
  });
  const st = await prisma.student.create({ data: { nis: `QJ${stamp}`, name: `Siswa JPG ${stamp}`, grade: 'XII', className: cls.name } });
  const pt = await prisma.participant.create({ data: { activityId: act.id, studentId: st.id, billing: 650_000 } });
  const pay = await prisma.payment.create({
    data: {
      activityId: act.id, participantId: pt.id, amount: 650_000, date: new Date(),
      method: 'TRANSFER', seq: 1, receiptNo: `QJ-${stamp.slice(-4)}/0001`, createdById: user.id,
    },
  });
  paymentId = pay.id;

  cleanup.push(
    () => prisma.payment.delete({ where: { id: pay.id } }),
    () => prisma.participant.delete({ where: { id: pt.id } }),
    () => prisma.activity.delete({ where: { id: act.id } }),
    () => prisma.activityCategory.delete({ where: { id: cat.id } }),
    () => prisma.student.delete({ where: { id: st.id } }),
    () => prisma.schoolClass.delete({ where: { id: cls.id } }),
  );
});

test.afterAll(async () => {
  for (const step of cleanup) await step().catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await deleteE2eUser(user.id);
});

test('kuitansi JPG utuh: tidak tergeser dan tidak terpotong', async ({ page, context }) => {
  await loginAsFixture(page, user);
  await context.addCookies([{ name: 'pbk_activity', value: 'x', domain: 'localhost', path: '/' }]);
  await page.goto(`/kuitansi?id=${paymentId}`);
  await page.waitForLoadState('networkidle');

  const size = await page.locator('#kuitansi').evaluate((n: HTMLElement) => ({
    w: n.offsetWidth,
    h: n.offsetHeight,
    marginLeft: parseFloat(getComputedStyle(n).marginLeft),
  }));
  // Prasyarat ujinya: kuitansinya memang dipusatkan, jadi ada margin untuk
  // dikacaukan. Tanpa ini, uji di bawah lolos karena alasan yang salah.
  expect(size.marginLeft).toBeGreaterThan(20);

  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Unduh JPG' }).click();
  const download = await dl;
  await expect(page.getByText('Gagal membuat gambar')).toHaveCount(0);

  const bytes = await readFile(await download.path());
  const dataUrl = `data:image/jpeg;base64,${bytes.toString('base64')}`;

  // Gambarnya digambar ulang di kanvas untuk diperiksa pikselnya: berapa jauh
  // dari tepi kiri isi pertama muncul, dan apakah ada isi di dekat tepi kanan.
  const probe = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const inked = (x: number) => {
      for (let y = 0; y < canvas.height; y += 2) {
        const i = (y * canvas.width + x) * 4;
        // Ambang longgar: JPEG tidak menyimpan putih sebagai 255 persis.
        if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) return true;
      }
      return false;
    };

    let firstInk = -1;
    for (let x = 0; x < canvas.width; x++) {
      if (inked(x)) {
        firstInk = x;
        break;
      }
    }
    let lastInk = -1;
    for (let x = canvas.width - 1; x >= 0; x--) {
      if (inked(x)) {
        lastInk = x;
        break;
      }
    }
    return { width: canvas.width, height: canvas.height, firstInk, lastInk };
  }, dataUrl);

  // Ukuran kanvas mengikuti ukuran elemennya (pixelRatio 2).
  expect(probe.width).toBe(size.w * 2);
  expect(probe.height).toBe(size.h * 2);

  // Isi kuitansi dimulai di dekat tepi kiri. Sebelum perbaikan, sekitar 390
  // piksel pertama kosong karena margin `mx-auto` ikut tersalin.
  expect(probe.firstInk).toBeGreaterThanOrEqual(0);
  expect(probe.firstInk).toBeLessThan(20);

  // Dan berakhir di dekat tepi kanan — bukan terpotong di tengah.
  expect(probe.lastInk).toBeGreaterThan(probe.width - 20);
});
