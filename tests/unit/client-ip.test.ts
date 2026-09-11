import { describe, expect, it } from 'vitest';
import { clientIpFrom } from '@/lib/client-ip';

function headers(value: string | null) {
  return { get: (name: string) => (name === 'x-forwarded-for' ? value : null) };
}

describe('clientIpFrom', () => {
  it('mengambil hop paling kanan, yang ditambahkan proxy kita sendiri', () => {
    // The client sent "1.2.3.4"; Caddy appended the real peer. Reading the
    // leftmost entry would return the attacker's chosen value.
    expect(clientIpFrom(headers('1.2.3.4, 203.0.113.9'))).toBe('203.0.113.9');
  });

  it('menangani satu hop', () => {
    expect(clientIpFrom(headers('203.0.113.9'))).toBe('203.0.113.9');
  });

  it('mengabaikan spasi dan entri kosong', () => {
    expect(clientIpFrom(headers('1.2.3.4 , , 203.0.113.9 '))).toBe('203.0.113.9');
  });

  it('mengembalikan null bila header tidak ada, bukan menebak', () => {
    expect(clientIpFrom(headers(null))).toBeNull();
    expect(clientIpFrom(headers(''))).toBeNull();
  });

  it('tidak pernah mengembalikan nilai yang dipilih klien saat ada proxy', () => {
    const forged = 'evil, evil, evil, 203.0.113.9';
    expect(clientIpFrom(headers(forged))).toBe('203.0.113.9');
  });
});
