import { prisma } from '@/lib/prisma';
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
