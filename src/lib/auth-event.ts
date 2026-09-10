import { prisma } from '@/lib/prisma';
import { type AuthEventName } from '@/lib/auth-event-names';

/**
 * Single door for the security trail. Never pass a password, a raw OTP, or
 * a TOTP secret in `meta` — this table is read in the UI by SUPERADMIN.
 */
export async function recordAuthEvent(input: {
  event: AuthEventName;
  userId?: string | null;
  username?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, any>;
}): Promise<void> {
  await prisma.authEvent.create({
    data: {
      event: input.event,
      userId: input.userId ?? null,
      username: input.username ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      meta: input.meta ?? undefined,
    },
  });
}
