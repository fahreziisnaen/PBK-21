import { afterEach, describe, expect, it, vi } from 'vitest';

// Regression net for the one semantic Task 4 exists to protect: a redeploy
// must be a genuine no-op for a user row that already exists. Everything
// else the seed script does is exercised end-to-end against the real
// database (see task-4-report.md); this test exists specifically so that a
// future "helpful sync" edit — e.g. `update: { name: SEED_ADMIN.name }` —
// fails here instead of silently shipping to a live school's server and
// resetting an administrator's changed password on the next deploy.

const userUpsertMock = vi.fn().mockResolvedValue({});
const schoolUpsertMock = vi.fn().mockResolvedValue({});
const activityCategoryUpsertMock = vi.fn().mockResolvedValue({});
const expenseCategoryUpsertMock = vi.fn().mockResolvedValue({});
const findUniqueOrThrowMock = vi.fn().mockResolvedValue({ id: 'cat-out' });
const activityFindFirstMock = vi.fn().mockResolvedValue({ id: 'existing-activity' });
const activityCreateMock = vi.fn().mockResolvedValue({});
const disconnectMock = vi.fn().mockResolvedValue(undefined);

// Mocked at the module boundary — @prisma/client and @prisma/adapter-pg
// never touch a real connection, so this test cannot reach the database.
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: vi.fn() }));
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(function PrismaClientMock() {
    return {
      school: { upsert: schoolUpsertMock },
      activityCategory: { upsert: activityCategoryUpsertMock, findUniqueOrThrow: findUniqueOrThrowMock },
      expenseCategory: { upsert: expenseCategoryUpsertMock },
      user: { upsert: userUpsertMock },
      activity: { findFirst: activityFindFirstMock, create: activityCreateMock },
      $disconnect: disconnectMock,
    };
  }),
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed-for-test') } }));

describe('prisma/seed — redeploy tidak boleh menimpa admin yang sudah ada', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('mengirim update kosong ke user.upsert, sehingga baris admin yang sudah ada tidak pernah berubah', async () => {
    const { main } = await import('../../prisma/seed');
    await main();

    expect(userUpsertMock).toHaveBeenCalledTimes(1);
    const args = userUpsertMock.mock.calls[0][0];
    // The literal check that matters: update must be an empty object, not
    // merely falsy-ish — anything inside it would be written on every deploy.
    expect(args.update).toEqual({});
    expect(Object.keys(args.update)).toHaveLength(0);
    expect(args.where).toEqual({ username: 'admin' });
  });
});
