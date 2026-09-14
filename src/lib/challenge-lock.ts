import type { AuthChallenge, ChallengePurpose, Prisma, SecondFactor, User } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  CHALLENGE_TTL_MINUTES,
  evaluateChallenge,
  generateOtpCode,
  hashOtp,
  type ChallengeState,
} from '@/lib/auth-challenge';
import {
  checkChallengeBudget,
  countFailedCodesToday,
  findUsableChallenge,
  MAX_FAILED_CODES_PER_DAY,
  type ChallengeBudgetVerdict,
} from '@/lib/rate-limit';

/**
 * Every operation that reads a challenge budget and then acts on it runs
 * through here, holding a PostgreSQL advisory lock on the account and
 * purpose until its transaction commits.
 *
 * Without it, each check was a separate await from the write that followed:
 * a reviewer fired 25 parallel reset requests from a clean state and got 17
 * challenge rows against a cap of 3 — 85 wrong guesses in one five-minute
 * burst, growing with however many connections the attacker opens. No
 * amount of tuning the numbers fixes a check that the write can outrun.
 *
 * The lock is per account AND purpose, so a password reset never waits on
 * a login. `pg_advisory_xact_lock` releases itself when the transaction
 * ends, including on error, so there is nothing to unlock by hand.
 *
 * Never call `redirect()` inside `fn`: it works by throwing, and a throw
 * here rolls the transaction back.
 */
export async function withChallengeLock<T>(
  userId: string,
  purpose: ChallengePurpose,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${purpose}`}))`;
    return fn(tx);
  });
}

export type IssueOutcome =
  | { kind: 'reused'; challengeId: string }
  | { kind: 'created'; challengeId: string; otp: string | null }
  | { kind: 'refused'; verdict: Extract<ChallengeBudgetVerdict, { allowed: false }> };

/**
 * Hands out a challenge: the account's live one if it has any, otherwise a
 * new one if the budget allows. Returns the plaintext OTP only for a newly
 * created WA_OTP challenge, so the caller can send it — it is never stored.
 */
export async function issueChallenge(input: {
  userId: string;
  purpose: ChallengePurpose;
  method: SecondFactor;
}): Promise<IssueOutcome> {
  return withChallengeLock(input.userId, input.purpose, async (tx) => {
    const live = await findUsableChallenge(input.userId, input.purpose, tx);
    if (live) return { kind: 'reused', challengeId: live.id };

    const budget = await checkChallengeBudget(input.userId, input.purpose, tx);
    if (!budget.allowed) return { kind: 'refused', verdict: budget };

    const otp = input.method === 'WA_OTP' ? generateOtpCode() : null;
    const created = await tx.authChallenge.create({
      data: {
        userId: input.userId,
        purpose: input.purpose,
        method: input.method,
        otpHash: otp ? hashOtp(otp) : null,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000),
      },
      select: { id: true },
    });
    return { kind: 'created', challengeId: created.id, otp };
  });
}

export type ChallengeWithUser = AuthChallenge & { user: User };

export type SpendOutcome =
  | { kind: 'accepted'; challenge: ChallengeWithUser }
  | {
      kind: 'rejected';
      reason: Exclude<ChallengeState, 'usable'> | 'missing' | 'daily-limit' | 'wrong';
      challenge: ChallengeWithUser | null;
    };

/**
 * Spends one submission against a challenge: checks it is still usable and
 * that the account has not used up its wrong codes for the day, runs
 * `verify`, then either records the failure or consumes the challenge.
 *
 * The daily limit is enforced HERE, on every guess, and not only when a
 * challenge is issued. Checking at issuance alone metered how many rows an
 * attacker could get, never how many guesses they could make on them. Under
 * the lock, the check and the attempts increment cannot interleave with any
 * other submission for the same account, so the limit is exact.
 *
 * `verify` returning false, or throwing, counts as a wrong code. A throw
 * usually means a corrupted secret or a rotated ENCRYPTION_KEY, and letting
 * it escape would skip both the increment and the caller's audit record.
 */
export async function spendChallenge(input: {
  challengeId: string;
  purpose: ChallengePurpose;
  verify: (challenge: ChallengeWithUser) => boolean;
}): Promise<SpendOutcome> {
  const head = await prisma.authChallenge.findUnique({
    where: { id: input.challengeId },
    select: { userId: true, purpose: true },
  });
  // Purpose is checked before taking the lock as well as after: a challenge
  // of one kind must never be spendable as the other.
  if (!head || head.purpose !== input.purpose) {
    return { kind: 'rejected', reason: 'missing', challenge: null };
  }

  return withChallengeLock(head.userId, input.purpose, async (tx): Promise<SpendOutcome> => {
    // Re-read under the lock: attempts and consumedAt may have changed while
    // this request waited for it.
    const challenge = await tx.authChallenge.findUnique({
      where: { id: input.challengeId },
      include: { user: true },
    });
    if (!challenge || challenge.purpose !== input.purpose) {
      return { kind: 'rejected', reason: 'missing', challenge: null };
    }

    const state = evaluateChallenge(challenge, new Date());
    if (state !== 'usable') return { kind: 'rejected', reason: state, challenge };

    const failedToday = await countFailedCodesToday(challenge.userId, input.purpose, tx);
    if (failedToday >= MAX_FAILED_CODES_PER_DAY) {
      return { kind: 'rejected', reason: 'daily-limit', challenge };
    }

    let ok = false;
    try {
      ok = input.verify(challenge);
    } catch {
      ok = false;
    }

    if (!ok) {
      await tx.authChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      return { kind: 'rejected', reason: 'wrong', challenge };
    }

    // The conditional write stays even under the lock: it is what makes a
    // challenge single-use if this code is ever called without one.
    const { count } = await tx.authChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (count !== 1) return { kind: 'rejected', reason: 'consumed', challenge };

    return { kind: 'accepted', challenge };
  });
}
