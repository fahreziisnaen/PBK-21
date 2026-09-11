'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { clientIpFrom } from '@/lib/client-ip';
import { recordAuthEvent } from '@/lib/auth-event';
import { AUTH_EVENTS } from '@/lib/auth-event-names';
import { checkLoginRate, findUsableChallenge } from '@/lib/rate-limit';
import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_MINUTES,
  generateOtpCode,
  hashOtp,
} from '@/lib/auth-challenge';
import { sendWhatsApp } from '@/lib/wa-gateway';
import { chooseSecondFactor } from '@/lib/actions/choose-second-factor';

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

export async function startLogin(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const parsed = schema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  });
  if (!parsed.success) return GENERIC;

  const username = parsed.data.username.trim().toLowerCase();
  const h = await headers();
  const ip = clientIpFrom(h);
  const userAgent = h.get('user-agent');

  const rate = await checkLoginRate(username, ip);
  if (!rate.allowed) {
    return `Terlalu banyak percobaan. Coba lagi dalam ${rate.retryAfterMinutes} menit.`;
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
    return GENERIC;
  }
  if (!user.isActive) {
    await recordAuthEvent({ event: AUTH_EVENTS.LOGIN_USER_INACTIVE, userId: user.id, username, ip, userAgent });
    return GENERIC;
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

  // Reuse a live challenge rather than issuing another. Each new row reset
  // the 5-attempt counter, so someone who knew the password but not the
  // second factor could re-submit it repeatedly and get unlimited OTP
  // guesses — the cap only bounds anything if the attempts stay on one row.
  const live = await findUsableChallenge(user.id, 'LOGIN');
  if (live) {
    const store = await cookies();
    store.set(CHALLENGE_COOKIE, live.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: CHALLENGE_TTL_MINUTES * 60,
    });
    redirect('/login/verifikasi');
  }

  const otp = method === 'WA_OTP' ? generateOtpCode() : null;

  const challenge = await prisma.authChallenge.create({
    data: {
      userId: user.id,
      purpose: 'LOGIN',
      method: isBootstrap ? 'TOTP' : method,
      otpHash: otp ? hashOtp(otp) : null,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000),
      // Never pre-consumed, not even for bootstrap. A consumed challenge with
      // no otpHash is indistinguishable from a legitimately consumed TOTP one
      // (only WA_OTP challenges ever carry an otpHash), so pre-consuming here
      // would let stage 2 mistake a spent TOTP challenge for a bootstrap and
      // admit it with no second factor at all. Stage 2 identifies a bootstrap
      // from the user's own capability instead, via chooseSecondFactor.
      consumedAt: null,
    },
  });

  const store = await cookies();
  store.set(CHALLENGE_COOKIE, challenge.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CHALLENGE_TTL_MINUTES * 60,
  });

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
        return 'Nomor WhatsApp Anda tidak terdaftar. Hubungi administrator.';
      }
      if (result.reason === 'unavailable') {
        return 'Layanan pengiriman kode sedang tidak tersedia. Hubungi administrator.';
      }
      return 'Kode gagal dikirim. Hubungi administrator.';
    }
    await recordAuthEvent({ event: AUTH_EVENTS.WA_SEND_OK, userId: user.id, username, ip });
  }

  // redirect() throws NEXT_REDIRECT to unwind the render — never wrap this
  // in try/catch, or the throw is swallowed and the user sits on the login
  // page with no feedback.
  redirect('/login/verifikasi');
}
