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

/** Challenges one account may be issued per window, per purpose. */
const MAX_CHALLENGES_PER_WINDOW = 3;
/** Wrong codes one account may submit per purpose in a trailing day. */
const MAX_FAILED_CODES_PER_DAY = 10;
const FAILURE_WINDOW_MINUTES = 24 * 60;

export type ChallengeBudgetVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'issuance' | 'failures'; retryAfterMinutes: number };

/** Pure, so both bounds are testable without a database. */
export function evaluateChallengeBudget(recent: {
  issued: number;
  failedToday: number;
}): ChallengeBudgetVerdict {
  if (recent.failedToday >= MAX_FAILED_CODES_PER_DAY) {
    return { allowed: false, reason: 'failures', retryAfterMinutes: FAILURE_WINDOW_MINUTES };
  }
  if (recent.issued >= MAX_CHALLENGES_PER_WINDOW) {
    return { allowed: false, reason: 'issuance', retryAfterMinutes: WINDOW_MINUTES };
  }
  return { allowed: true };
}

/**
 * Whether an account may be issued another challenge. Two bounds, because
 * each one alone was shipped and each one alone failed:
 *
 * - Reusing a live challenge (findUsableChallenge) bounds nothing: it skips a
 *   row whose attempts are spent, so the next request minted a fresh row at
 *   zero attempts.
 * - Capping issuance at 3 per 15 minutes still allowed 1,440 guesses a day.
 *   With three TOTP codes valid at any instant, that is a 79% chance of
 *   taking over an account within a year, from a username alone.
 *
 * The bound that matters is wrong codes over a long window: fewer than 10 per
 * account per purpose per trailing day, which brings the same attack under
 * 2% a year. It is measured from the `attempts` already recorded on each
 * challenge row, so a user who types the right code is never counted and
 * never locked out — a plain per-day issuance cap would lock out a treasurer
 * who simply signs in four times.
 *
 * Purposes are counted separately. Someone burning a victim's PASSWORD_RESET
 * budget (possible from a username) cannot touch their LOGIN budget, which
 * requires the password to reach at all.
 */
export async function checkChallengeBudget(
  userId: string,
  purpose: ChallengePurpose,
): Promise<ChallengeBudgetVerdict> {
  const now = Date.now();
  const [issued, failures] = await Promise.all([
    prisma.authChallenge.count({
      where: { userId, purpose, createdAt: { gte: new Date(now - WINDOW_MINUTES * 60_000) } },
    }),
    prisma.authChallenge.aggregate({
      where: {
        userId,
        purpose,
        createdAt: { gte: new Date(now - FAILURE_WINDOW_MINUTES * 60_000) },
      },
      _sum: { attempts: true },
    }),
  ]);
  return evaluateChallengeBudget({ issued, failedToday: failures._sum.attempts ?? 0 });
}
