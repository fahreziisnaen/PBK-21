'use server';

import { cookies } from 'next/headers';
import { CHALLENGE_COOKIE } from '@/lib/auth-challenge';

/**
 * Menutup tahap kode dari sisi pengguna: cookie challenge-nya dibuang, supaya
 * memuat ulang halaman tidak membuka lagi modal yang barusan dibatalkan.
 *
 * Baris challenge-nya sendiri sengaja dibiarkan hidup. Ia tetap dihitung oleh
 * batas penerbitan — jadi membatalkan berulang kali tidak bisa dipakai untuk
 * memanen challenge baru — dan saat pengguna memasukkan sandinya lagi,
 * `issueChallenge` memakai ulang baris yang sama, bukan menerbitkan yang baru.
 */
export async function cancelLoginChallenge(): Promise<void> {
  const store = await cookies();
  store.set(CHALLENGE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });
}
