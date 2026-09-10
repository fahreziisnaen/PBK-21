// Loads .env into this test-runner process — the Next.js dev server started
// by Playwright's webServer config reads it too, but that is a separate
// process; DATABASE_URL and ENCRYPTION_KEY below are never set here without it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Secret, TOTP } from 'otpauth';
import type { Page } from '@playwright/test';
import { generateTotpSecret } from '@/lib/totp';
import { encryptSecret } from '@/lib/crypto';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });

let seq = 0;

export type E2eUser = {
  id: string;
  username: string;
  password: string;
  /** Plaintext base32 secret, kept only in memory so a test can compute a real code — never stored anywhere but encrypted. */
  totpSecret: string | null;
};

/**
 * Disposable fixture user for e2e specs. NEVER touches the `admin` row —
 * see the Task 11/12 dispatch: enrolling TOTP on `admin` would lock out
 * local dev with no recovery until Task 14 ships the SSH script, and a
 * second `npx playwright test` run would then fail because `admin` would
 * demand a code the login helper cannot produce.
 *
 * Every fixture user has `phone: null`. WA_OTP cannot be driven from a
 * test — WA_BASE_URL is not even configured in this environment (see
 * wa-gateway.ts, which fails fast on an empty base URL), and sending a real
 * WhatsApp message from a test is forbidden regardless. TOTP is the only
 * second factor a test can complete deterministically, so `withTotp`
 * (default true) pre-enrols one directly via Prisma — the encrypted secret
 * and `totpEnabledAt` are written exactly as `confirmEnrollment` itself
 * would write them, and the plaintext secret is handed back so the test can
 * compute a real code with `otpauth`, the same technique the enrolment spec
 * uses to confirm a fresh enrolment.
 */
export async function createE2eUser(
  opts: { role?: Role; withTotp?: boolean; mustChangePassword?: boolean } = {},
): Promise<E2eUser> {
  const withTotp = opts.withTotp ?? true;
  const username = `e2e-${Date.now().toString(36)}-${seq++}`;
  const password = 'E2e!Test-Passw0rd';
  const totpSecret = withTotp ? generateTotpSecret() : null;

  const user = await prisma.user.create({
    data: {
      username,
      name: `E2E ${username}`,
      role: opts.role ?? 'BENDAHARA',
      passwordHash: await bcrypt.hash(password, 10), // cost 10, matching prisma/seed.ts
      mustChangePassword: opts.mustChangePassword ?? false,
      phone: null,
      totpSecret: totpSecret ? encryptSecret(totpSecret) : null,
      totpEnabledAt: totpSecret ? new Date() : null,
    },
  });

  return { id: user.id, username, password, totpSecret };
}

/** AuthChallenge rows FK to User — deleted first, or the user delete violates the foreign key. */
export async function deleteE2eUser(id: string): Promise<void> {
  await prisma.authChallenge.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } }).catch(() => {});
}

/** Computes a real, currently-valid TOTP code from a plaintext base32 secret — mirrors src/lib/totp.ts's own construction. */
export function computeTotpCode(secretBase32: string, at: Date = new Date()): string {
  const totp = new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secretBase32) });
  return totp.generate({ timestamp: at.getTime() });
}

/**
 * Drives the password stage and, for a `withTotp` fixture, the TOTP code
 * stage, ending on /dashboard. Only for fixtures that PASS the post-login
 * gate (nextGate returns null once totpEnabledAt is set — see
 * src/lib/auth-gates.ts) — a `withTotp: false` fixture has no code to
 * submit and is forced to /keamanan/2fa instead, so specs exercising that
 * path drive their own login rather than call this helper.
 */
export async function loginAsFixture(page: Page, user: E2eUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Kata Sandi').fill(user.password);
  await page.getByRole('button', { name: 'Masuk' }).click();

  if (user.totpSecret) {
    await page.waitForURL(/\/login\/verifikasi/);
    await page.getByLabel('Kode Verifikasi').fill(computeTotpCode(user.totpSecret));
    await page.getByRole('button', { name: 'Verifikasi' }).click();
  }

  await page.waitForURL(/\/dashboard/);
}
