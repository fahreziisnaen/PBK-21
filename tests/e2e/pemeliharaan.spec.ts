import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createE2eUser, deleteE2eUser, loginAsFixture, prisma, type E2eUser } from './support/e2e-users';

// Backup → factory reset → restore lewat UI sungguhan, lalu memastikan data
// kembali persis seperti sebelum reset. Destruktif terhadap database uji,
// karena itu dijalankan serial dan selalu diakhiri dengan restore.

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const MARKER = `E2E-BACKUP-${Date.now().toString(36).toUpperCase()}`;
let superadmin: E2eUser;

test.afterAll(async () => {
  await prisma.schoolClass.deleteMany({ where: { name: MARKER } });
  if (superadmin) {
    await prisma.auditLog.deleteMany({ where: { userId: superadmin.id } });
    await deleteE2eUser(superadmin.id);
  }
});

async function snapshot() {
  return {
    activityCategories: await prisma.activityCategory.count(),
    expenseCategories: await prisma.expenseCategory.count(),
    classes: await prisma.schoolClass.count(),
    activities: await prisma.activity.count(),
    students: await prisma.student.count(),
    payments: await prisma.payment.count(),
    users: await prisma.user.count(),
  };
}

test('backup, factory reset, lalu restore mengembalikan data utuh', async ({ page }) => {
  superadmin = await createE2eUser({ role: 'SUPERADMIN', withTotp: true });
  await prisma.schoolClass.create({ data: { name: MARKER, grade: 'XI' } });
  const before = await snapshot();
  expect(before.classes).toBeGreaterThan(0);

  await loginAsFixture(page, superadmin);
  await page.goto('/pemeliharaan');

  // --- Backup ---
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Unduh Backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^pbk-backup-.*\.json$/);
  const backupPath = await download.path();
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  expect(backup.app).toBe('PBK');
  expect(backup.tables.SchoolClass.map((c: { name: string }) => c.name)).toContain(MARKER);
  expect(backup.tables.User.map((u: { id: string }) => u.id)).toContain(superadmin.id);

  // --- Konfirmasi salah ditolak ---
  await page.getByLabel('Ketik RESET untuk mengonfirmasi').fill('reset');
  await page.getByRole('button', { name: 'Jalankan Factory Reset' }).click();
  await expect(page.getByText('Ketik RESET (huruf besar) untuk mengonfirmasi.')).toBeVisible();
  expect((await snapshot()).classes).toBe(before.classes);

  // --- Factory reset ---
  await page.getByLabel('Ketik RESET untuk mengonfirmasi').fill('RESET');
  await page.getByRole('button', { name: 'Jalankan Factory Reset' }).click();
  await expect(page.getByText(/Factory reset selesai/)).toBeVisible();
  const afterReset = await snapshot();
  expect(afterReset).toMatchObject({ activityCategories: 0, expenseCategories: 0, classes: 0, activities: 0, students: 0, payments: 0 });
  expect(afterReset.users).toBe(before.users); // pengguna dipertahankan

  // --- Restore ---
  await page.goto('/pemeliharaan');
  await page.getByLabel('File backup (.json)').setInputFiles(backupPath);
  await page.getByLabel('Ketik PULIHKAN untuk mengonfirmasi').fill('PULIHKAN');
  await page.getByRole('button', { name: 'Pulihkan Data' }).click();
  await expect(page.getByText(/Data dipulihkan dari/)).toBeVisible({ timeout: 60_000 });

  expect(await snapshot()).toEqual(before);
  expect(await prisma.schoolClass.findUnique({ where: { name: MARKER } })).not.toBeNull();

  // Sesi tetap berlaku setelah restore: akunnya ada di backup dengan data yang sama.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
});

test('file yang bukan backup PBK ditolak tanpa mengubah data', async ({ page }) => {
  const before = await snapshot();
  await loginAsFixture(page, superadmin);
  await page.goto('/pemeliharaan');
  await page.getByLabel('File backup (.json)').setInputFiles({
    name: 'bukan-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await page.getByLabel('Ketik PULIHKAN untuk mengonfirmasi').fill('PULIHKAN');
  await page.getByRole('button', { name: 'Pulihkan Data' }).click();
  await expect(page.getByText('File ini bukan backup PBK.')).toBeVisible();
  expect(await snapshot()).toEqual(before);
});
