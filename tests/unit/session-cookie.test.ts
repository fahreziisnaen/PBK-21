import { describe, expect, it } from 'vitest';
import { NextResponse } from 'next/server';
import { clearSessionCookies } from '@/lib/session-cookie';

function clearedHeaders(): string[] {
  const res = NextResponse.next();
  clearSessionCookies(res);
  return res.headers.getSetCookie();
}

describe('clearSessionCookies', () => {
  it('mengakhiri kedua nama cookie sesi', () => {
    const headers = clearedHeaders();
    expect(headers).toHaveLength(2);
    expect(headers.join('\n')).toContain('authjs.session-token=;');
    expect(headers.join('\n')).toContain('__Secure-authjs.session-token=;');
  });

  it('menyertakan Secure pada cookie berawalan __Secure-', () => {
    // The whole bug: a browser rejects a Set-Cookie for a __Secure- name that
    // has no Secure attribute, so the clear is discarded and the session
    // survives. cookies.delete() omits it, which is why it is not used.
    const secureCookie = clearedHeaders().find((h) => h.startsWith('__Secure-'));
    expect(secureCookie).toMatch(/;\s*Secure/i);
  });

  it('tidak menandai Secure pada cookie HTTP biasa', () => {
    // Marking the unprefixed cookie Secure would make it unclearable over
    // plain HTTP, which is how local development and the e2e suite run.
    const plain = clearedHeaders().find((h) => h.startsWith('authjs.'));
    expect(plain).not.toMatch(/;\s*Secure/i);
  });

  it('kedaluwarsa segera, bukan sekadar dikosongkan', () => {
    for (const h of clearedHeaders()) expect(h).toMatch(/Max-Age=0/);
  });
});
