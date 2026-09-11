import { describe, expect, it } from 'vitest';
import { evaluateChallengeBudget, evaluateRate } from '@/lib/rate-limit';
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
  it('mengizinkan di bawah batas', () => {
    expect(evaluateChallengeBudget(0)).toEqual({ allowed: true });
    expect(evaluateChallengeBudget(2)).toEqual({ allowed: true });
  });

  it('menolak saat batas tercapai', () => {
    // Counts challenges ISSUED, not attempts left on them. Reusing a live
    // challenge is not a bound on its own: it skips a row whose attempts are
    // spent, so without this cap the next request minted a fresh row at zero
    // and the five-guess limit meant nothing.
    expect(evaluateChallengeBudget(3)).toEqual({ allowed: false, retryAfterMinutes: 15 });
  });

  it('tetap menolak di atas batas', () => {
    expect(evaluateChallengeBudget(99)).toMatchObject({ allowed: false });
  });
});
