/**
 * Tipe dan fungsi murni untuk alur masuk dua tahap. Dipisahkan dari berkas
 * `'use server'`-nya karena berkas Server Action hanya boleh mengekspor
 * fungsi async — tipe dan helper sinkron tidak bisa tinggal di sana.
 */

export type LoginStart =
  | { ok: false; message: string }
  | {
      ok: true;
      challengeId: string;
      /** Petunjuk sumber kode; null untuk akun bootstrap yang tak punya faktor kedua. */
      hint: string | null;
      /** Akun tanpa faktor kedua: tidak ada kode untuk diminta, langsung diteruskan. */
      bootstrap: boolean;
    };

export type OtpVerdict =
  | { ok: false; message: string }
  /** Tujuan setelah masuk — gerbang pasca-login menentukan ini, bukan klien. */
  | { ok: true; to: string };

/** Menyisakan empat digit terakhir, supaya nomor lengkapnya tidak bocor ke halaman publik. */
export function maskPhone(phone: string | null): string {
  if (!phone || phone.length < 4) return '••••';
  return `••••${phone.slice(-4)}`;
}

/** Kalimat petunjuk di modal token, sesuai faktor kedua yang dipakai akun. */
export function codeHint(method: 'TOTP' | 'WA_OTP', phone: string | null): string {
  return method === 'TOTP'
    ? 'Masukkan kode dari Google Authenticator.'
    : `Kode telah dikirim ke WhatsApp ${maskPhone(phone)}.`;
}
