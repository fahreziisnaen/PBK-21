import { describe, expect, it } from 'vitest';
import { evaluateChallengeBudget, evaluateRate, evaluateResetRequestRate } from '@/lib/rate-limit';
import { AUTH_EVENTS } from '@/lib/auth-event-names';

describe('evaluateRate', () => {
  it('mengizinkan saat kedua hitungan di bawah batas', () => {
    expect(evaluateRate({ byUsername: 4, byIp: 19 })).toEqual({ allowed: true });
  });

  it('menolak saat username mencapai batas', () => {
    expect(evaluateRate({ byUsername: 5, byIp: 0 })).toEqual({ allowed: false, retryAfterMinutes: 15 });
  });

  it('menolak saat IP mencapai batas walau username bersih', () => {
    expect(evaluateRate({ byUsername: 0, byIp: 20 })).toEqual({ allowed: false, retryAfterMinutes: 15 });
  });

  it('mengizinkan saat tidak ada kegagalan sama sekali', () => {
    expect(evaluateRate({ byUsername: 0, byIp: 0 })).toEqual({ allowed: true });
  });
});

describe('AUTH_EVENTS', () => {
  it('memiliki tepat 19 entri sesuai desain spec §3.3', () => {
    const entries = Object.keys(AUTH_EVENTS);
    expect(entries).toHaveLength(19);
  });

  it('LOGIN_PASSWORD_FAIL bernilai login.password_fail untuk memastikan limiter menghitung dengan benar', () => {
    expect(AUTH_EVENTS.LOGIN_PASSWORD_FAIL).toBe('login.password_fail');
  });
});

describe('evaluateChallengeBudget', () => {
  const clean = { issued: 0, failedToday: 0 };

  it('mengizinkan akun yang bersih', () => {
    expect(evaluateChallengeBudget(clean)).toEqual({ allowed: true });
    expect(evaluateChallengeBudget({ issued: 2, failedToday: 9 })).toEqual({ allowed: true });
  });

  it('menolak saat penerbitan mencapai batas 15 menit', () => {
    expect(evaluateChallengeBudget({ ...clean, issued: 3 })).toEqual({
      allowed: false,
      reason: 'issuance',
      retryAfterMinutes: 15,
    });
  });

  it('menolak saat kode salah mencapai batas harian', () => {
    // The bound that actually holds against grinding. Capping issuance alone
    // still allowed 1,440 guesses a day — a 79% chance of breaking a TOTP
    // account within a year, from a username alone.
    expect(evaluateChallengeBudget({ ...clean, failedToday: 10 })).toEqual({
      allowed: false,
      reason: 'failures',
      retryAfterMinutes: 24 * 60,
    });
  });

  it('mendahulukan batas harian, karena itu yang lebih lama ditunggu', () => {
    // Telling someone to retry in 15 minutes when they are really blocked for
    // a day would send them round in circles.
    expect(evaluateChallengeBudget({ issued: 3, failedToday: 10 })).toMatchObject({ reason: 'failures' });
  });

  it('tidak pernah menghitung login yang berhasil', () => {
    // issued stays under the cap and nothing failed: a treasurer signing in
    // many times a day is never refused.
    expect(evaluateChallengeBudget({ issued: 1, failedToday: 0 })).toEqual({ allowed: true });
  });
});

describe('evaluateResetRequestRate', () => {
  // The counts include the request being judged, since the caller records its
  // own event first: five from one username is still allowed, the sixth not.
  it('mengizinkan sampai lima permintaan per username', () => {
    expect(evaluateResetRequestRate({ byUsername: 5, byIp: 5 })).toBe(true);
  });

  it('menolak permintaan keenam dari username yang sama', () => {
    expect(evaluateResetRequestRate({ byUsername: 6, byIp: 6 })).toBe(false);
  });

  it('menolak saat alamat melampaui dua puluh walau tiap username masih bersih', () => {
    // Rotating usernames from one address must not dodge the cap.
    expect(evaluateResetRequestRate({ byUsername: 1, byIp: 21 })).toBe(false);
    expect(evaluateResetRequestRate({ byUsername: 1, byIp: 20 })).toBe(true);
  });
});
