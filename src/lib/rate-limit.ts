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
  const [byUsername, byIp] = await Promise.all([
    prisma.authEvent.count({
      where: { event: AUTH_EVENTS.LOGIN_PASSWORD_FAIL, username, createdAt: { gte: since } },
    }),
    ip
      ? prisma.authEvent.count({
          where: { event: 'login.password_fail', ip, createdAt: { gte: since } },
        })
      : Promise.resolve(0),
  ]);
  return evaluateRate({ byUsername, byIp });
}
