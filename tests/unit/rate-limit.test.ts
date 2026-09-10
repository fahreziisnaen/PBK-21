import { describe, expect, it } from 'vitest';
import { evaluateRate } from '@/lib/rate-limit';

describe('evaluateRate', () => {
  it('mengizinkan saat kedua hitungan di bawah batas', () => {
    expect(evaluateRate({ byUsername: 4, byIp: 19 })).toEqual({ allowed: true });
  });

  it('menolak saat username mencapai batas', () => {
    expect(evaluateRate({ byUsername: 5, byIp: 0 })).toMatchObject({ allowed: false });
  });

  it('menolak saat IP mencapai batas walau username bersih', () => {
    expect(evaluateRate({ byUsername: 0, byIp: 20 })).toMatchObject({ allowed: false });
  });

  it('mengizinkan saat tidak ada kegagalan sama sekali', () => {
    expect(evaluateRate({ byUsername: 0, byIp: 0 })).toEqual({ allowed: true });
  });
});
