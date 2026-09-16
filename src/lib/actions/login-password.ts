'use server';

import { cookies, headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { clientIpFrom } from '@/lib/client-ip';
import { recordAuthEvent } from '@/lib/auth-event';
import { AUTH_EVENTS } from '@/lib/auth-event-names';
import { checkLoginRate } from '@/lib/rate-limit';
import { issueChallenge } from '@/lib/challenge-lock';
import { CHALLENGE_COOKIE, CHALLENGE_TTL_MINUTES } from '@/lib/auth-challenge';
import { sendWhatsApp } from '@/lib/wa-gateway';
import { chooseSecondFactor } from '@/lib/actions/choose-second-factor';
import { codeHint, type LoginStart } from '@/lib/auth-flow';

/**
 * Compared against when the username does not exist, so a missing user
 * costs the same time as a wrong password. Without this, response timing
 * tells an attacker which usernames are real.
 */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.aB0e8b0eYVQ4a1Qk3rC5b8Xh1yqK';

const schema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

const GENERIC = 'Username atau kata sandi salah.';

export async function startLogin(_prev: LoginStart | undefined, formData: FormData): Promise<LoginStart> {
  const parsed = schema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { ok: false, message: GENERIC };

  const username = parsed.data.username.trim().toLowerCase();
  const h = await headers();
  const ip = clientIpFrom(h);
  const userAgent = h.get('user-agent');

  const rate = await checkLoginRate(username, ip);
  if (!rate.allowed) {
    return { ok: false, message: `Terlalu banyak percobaan. Coba lagi dalam ${rate.retryAfterMinutes} menit.` };
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok) {
    // Deliberately not wrapped in try/catch: if this write fails, propagate
    // and abort the login rather than swallow it. The next step writes an
    // AuthChallenge row to the same database, so a database that can't
    // accept this write can't complete login anyway. And checkLoginRate
    // above counts exactly these rows — silently swallowing a failed write
    // here would let an attacker who can break writes rack up unlogged
    // attempts against a limiter that counts zero.
    await recordAuthEvent({ event: AUTH_EVENTS.LOGIN_PASSWORD_FAIL, username, ip, userAgent });
    return { ok: false, message: GENERIC };
  }
  if (!user.isActive) {
    await recordAuthEvent({ event: AUTH_EVENTS.LOGIN_USER_INACTIVE, userId: user.id, username, ip, userAgent });
    return { ok: false, message: GENERIC };
  }

  const method = chooseSecondFactor(user);
  await recordAuthEvent({
    event: AUTH_EVENTS.LOGIN_PASSWORD_OK,
    userId: user.id,
    username,
    ip,
    userAgent,
    meta: { method },
  });

  const isBootstrap = method === 'BOOTSTRAP';

  // Reuse, the issuance cap and the daily wrong-code cap all run under one
  // per-account lock. checkLoginRate above counts only failed PASSWORDS, so
  // without this a caller who knows the password could re-submit it and
  // collect fresh OTP guesses; and without the lock, a burst of parallel
  // submissions could issue rows faster than the budget check could see.
  const issued = await issueChallenge({
    userId: user.id,
    purpose: 'LOGIN',
    // A bootstrap account has no factor; SecondFactor has no BOOTSTRAP member,
    // so its challenge is recorded as TOTP. It is NEVER pre-consumed: a
    // consumed challenge with no otpHash is indistinguishable from a spent
    // TOTP one, so pre-consuming would let stage 2 admit a replayed TOTP
    // challenge with no second factor. Stage 2 identifies bootstrap from the
    // user's own capability instead, via chooseSecondFactor.
    method: isBootstrap ? 'TOTP' : method,
  });
  if (issued.kind === 'refused') {
    return {
      ok: false,
      message:
        issued.verdict.reason === 'failures'
          ? 'Terlalu banyak kode verifikasi salah hari ini. Coba lagi besok, atau hubungi administrator.'
          : `Terlalu banyak percobaan. Coba lagi dalam ${issued.verdict.retryAfterMinutes} menit.`,
    };
  }

  const store = await cookies();
  store.set(CHALLENGE_COOKIE, issued.challengeId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CHALLENGE_TTL_MINUTES * 60,
  });

  // Only a newly created WA_OTP challenge carries a code to send. A reused
  // challenge sends nothing: its code was sent when it was created, and a
  // new code would need a new row, which would reset the attempts count.
  const otp = issued.kind === 'created' ? issued.otp : null;

  if (otp && user.phone) {
    const config = {
      baseUrl: process.env.WA_BASE_URL ?? '',
      apiKey: process.env.WA_API_KEY ?? '',
      instance: process.env.WA_INSTANCE || undefined,
    };
    const result = await sendWhatsApp(config, user.phone, `Kode masuk PBK Anda: ${otp}. Berlaku 5 menit.`);
    if (!result.ok) {
      await recordAuthEvent({
        event: AUTH_EVENTS.WA_SEND_FAIL,
        userId: user.id,
        username,
        ip,
        meta: { reason: result.reason, detail: result.detail },
      });
      if (result.reason === 'unregistered') {
        return { ok: false, message: 'Nomor WhatsApp Anda tidak terdaftar. Hubungi administrator.' };
      }
      if (result.reason === 'unavailable') {
        return { ok: false, message: 'Layanan pengiriman kode sedang tidak tersedia. Hubungi administrator.' };
      }
      return { ok: false, message: 'Kode gagal dikirim. Hubungi administrator.' };
    }
    await recordAuthEvent({ event: AUTH_EVENTS.WA_SEND_OK, userId: user.id, username, ip });
  }

  // Tidak lagi redirect ke halaman terpisah: tahap kode dikerjakan di modal
  // pada halaman yang sama. Cookie challenge tetap ditulis di atas, jadi
  // memuat ulang halaman tetap menemukan tahap yang sedang berjalan.
  return {
    ok: true,
    challengeId: issued.challengeId,
    bootstrap: isBootstrap,
    hint: isBootstrap ? null : codeHint(method === 'WA_OTP' ? 'WA_OTP' : 'TOTP', user.phone),
  };
}
