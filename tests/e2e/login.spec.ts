// Loads .env into this test-runner process — the Next.js dev server started
// by Playwright's webServer config reads it too, but that is a separate
// process; without this the seed password below is never actually set here.
import 'dotenv/config';
import { expect, test } from '@playwright/test';

// Satu-satunya spec yang memakai baris `admin` sungguhan, bukan fixture, agar
// akun hasil seed benar-benar terbukti bisa masuk. Konsekuensinya: penerbitan
// challenge dibatasi 3 per 15 menit per akun, jadi menjalankan seluruh suite
// lebih dari tiga kali dalam seperempat jam akan membuat uji di bawah gagal
// dengan "Terlalu banyak percobaan". Itu pengamannya yang bekerja, bukan
// regresi — tunggu jendelanya lewat sebelum mencari penyebab lain.
const USERNAME = 'admin';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'pbk-lokal-2026';

test('menolak kredensial salah', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Kata Sandi').fill('sandi-salah');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByText('Username atau kata sandi salah')).toBeVisible();
});

test('kredensial benar menyelesaikan login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Kata Sandi').fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  // The seed account has neither TOTP nor a phone, so it enters through the
  // bootstrap exemption — but Task 11's post-login gate then takes over: a
  // SUPERADMIN with no TOTP is always forced to enrol (nextGate does not
  // depend on WhatsApp for the recovery role), so admin lands on the
  // enrolment page instead of the dashboard.
  await expect(page).toHaveURL(/\/keamanan\/2fa/);
});

test('mengarahkan tamu ke login', async ({ page }) => {
  await page.goto('/pembayaran');
  await expect(page).toHaveURL(/\/login/);
});
