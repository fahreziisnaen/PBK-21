// Loads .env before @/lib/prisma is evaluated — it refuses to start without
// DATABASE_URL.
import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { issueChallenge, spendChallenge } from '@/lib/challenge-lock';
import { createE2eUser, deleteE2eUser, prisma, type E2eUser } from './support/e2e-users';

// No browser here. These drive the challenge code directly against the real
// PostgreSQL, because what they prove — that concurrent requests for one
// account are serialized — is exactly what a mocked database cannot show.
// Before the advisory lock, a reviewer fired 25 parallel reset requests at a
// clean account and got 17 challenge rows against a cap of 3.

const BURST = 25;

let user: E2eUser;

test.beforeEach(async () => {
  user = await createE2eUser({ withTotp: true });
});

test.afterEach(async () => {
  await deleteE2eUser(user.id);
});

function liveChallenge(attempts = 0) {
  return prisma.authChallenge.create({
    data: {
      userId: user.id,
      purpose: 'PASSWORD_RESET',
      method: 'TOTP',
      attempts,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });
}

test('permintaan serentak tidak bisa menerbitkan challenge melebihi satu yang masih hidup', async () => {
  const outcomes = await Promise.all(
    Array.from({ length: BURST }, () =>
      issueChallenge({ userId: user.id, purpose: 'PASSWORD_RESET', method: 'TOTP' }),
    ),
  );

  // Serialized, the first request creates a row and every later one finds it
  // live and reuses it. Unserialized, many see "no live row" at once.
  const rows = await prisma.authChallenge.count({ where: { userId: user.id } });
  expect(rows).toBe(1);
  expect(outcomes.filter((o) => o.kind === 'created')).toHaveLength(1);
});

test('tebakan salah serentak tidak bisa melampaui lima percobaan pada satu challenge', async () => {
  const target = await liveChallenge();

  await Promise.all(
    Array.from({ length: BURST }, () =>
      spendChallenge({ challengeId: target.id, purpose: 'PASSWORD_RESET', verify: () => false }),
    ),
  );

  // Without the lock every guess reads attempts < 5 before any increment
  // lands, and all 25 are counted.
  const after = await prisma.authChallenge.findUniqueOrThrow({ where: { id: target.id } });
  expect(after.attempts).toBe(5);
});

test('tebakan salah serentak tidak bisa melampaui batas harian lintas challenge', async () => {
  // Four wrong codes already spent today, leaving six under the limit of ten.
  await liveChallenge(4);
  // Three fresh targets with five attempts each: fifteen per-row slots, more
  // than the six the daily limit allows, so only the daily limit can stop
  // the burst. That is the attack the limit exists for — guesses spread
  // across rows that were issued in parallel.
  //
  // The remaining budget is deliberately larger than one. An earlier version
  // started one wrong code short of the limit, which a single committed
  // increment flips for every later reader; in practice the first
  // transaction finished before the rest read anything, so that test passed
  // even with the lock removed and proved nothing.
  const targets = [await liveChallenge(), await liveChallenge(), await liveChallenge()];

  const outcomes = await Promise.all(
    Array.from({ length: BURST }, (_, i) =>
      spendChallenge({
        challengeId: targets[i % targets.length]!.id,
        purpose: 'PASSWORD_RESET',
        verify: () => false,
      }),
    ),
  );

  const sum = await prisma.authChallenge.aggregate({
    where: { userId: user.id, purpose: 'PASSWORD_RESET' },
    _sum: { attempts: true },
  });
  expect(sum._sum.attempts).toBe(10);
  expect(outcomes.filter((o) => o.kind === 'rejected' && o.reason === 'wrong')).toHaveLength(6);
});

test('kode yang benar tetap diterima sekali saja walau dikirim serentak', async () => {
  const target = await liveChallenge();

  const outcomes = await Promise.all(
    Array.from({ length: BURST }, () =>
      spendChallenge({ challengeId: target.id, purpose: 'PASSWORD_RESET', verify: () => true }),
    ),
  );

  expect(outcomes.filter((o) => o.kind === 'accepted')).toHaveLength(1);
});
