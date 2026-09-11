import type { ChallengePurpose } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { MAX_CHALLENGE_ATTEMPTS } from '@/lib/auth-challenge';
import { AUTH_EVENTS } from '@/lib/auth-event-names';

const WINDOW_MINUTES = 15;
const MAX_PER_USERNAME = 5;
const MAX_PER_IP = 20;

export type RateVerdict = { allowed: true } | { allowed: false; retryAfterMinutes: number };

/** Pure, so the thresholds are testable without a database. */
export function evaluateRate(failures: { byUsername: number; byIp: number }): RateVerdict {
  if (failures.byUsername >= MAX_PER_USERNAME || failures.byIp >= MAX_PER_IP) {
    return { allowed: false, retryAfterMinutes: WINDOW_MINUTES };
  }
  return { allowed: true };
}

/**
 * Counts from AuthEvent rather than an in-memory map, so the limit survives
 * a container restart — otherwise restarting the app resets an attacker's
 * budget.
 */
export async function checkLoginRate(username: string, ip: string | null): Promise<RateVerdict> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  // Built once and spread into both counts. The two dimensions must agree on
  // the event name and the window; naming either one twice is what lets them
  // drift apart, and a drift here is silent — the limiter just counts zero.
  const failuresInWindow = {
    event: AUTH_EVENTS.LOGIN_PASSWORD_FAIL,
    createdAt: { gte: since },
  };
  const [byUsername, byIp] = await Promise.all([
    prisma.authEvent.count({ where: { ...failuresInWindow, username } }),
    ip
      ? prisma.authEvent.count({ where: { ...failuresInWindow, ip } })
      : Promise.resolve(0),
  ]);
  return evaluateRate({ byUsername, byIp });
}

/**
 * An existing challenge that is still usable for this user and purpose, or
 * null.
 *
 * Both login and password reset minted a FRESH challenge on every request,
 * which quietly made the 5-attempt cap meaningless: the cap is per row, and
 * rows were free and unlimited. An attacker who knew only a username could
 * request reset codes in a loop and grind down a six-digit space, five
 * guesses at a time, with no password at all.
 *
 * Reusing the live challenge is what turns the cap into a real bound —
 * attempts accumulate on one row for its whole five-minute life. It also
 * avoids punishing a legitimate user for signing in twice, which a plain
 * request-rate limit would.
 */
export async function findUsableChallenge(
  userId: string,
  purpose: ChallengePurpose,
): Promise<{ id: string } | null> {
  return prisma.authChallenge.findFirst({
    where: {
      userId,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MAX_CHALLENGE_ATTEMPTS },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
}
