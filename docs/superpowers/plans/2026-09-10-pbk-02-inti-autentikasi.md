# PBK Plan 02 — Inti Autentikasi · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti login berbasis email dengan username + sandi, lalu mewajibkan faktor kedua di setiap login — TOTP sebagai jalur utama, OTP via WhatsApp sebagai cadangan — beserta lupa sandi mandiri dan pemulihan lewat SSH.

**Architecture:** Login dipecah dua tahap. Tahap pertama memverifikasi sandi di dalam Server Action biasa, **di luar Auth.js**, karena credentials provider Auth.js menerbitkan sesi begitu `authorize` mengembalikan pengguna dan tidak dapat ditahan di tengah. Tahap pertama hanya menerbitkan `AuthChallenge` berumur lima menit yang id-nya disimpan pada cookie httpOnly. Tahap kedua barulah memakai Auth.js, lewat credentials provider bernama `otp` yang menerima id challenge beserta kodenya. Akibatnya sesi tidak pernah ada sebelum kedua faktor lolos.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Prisma 7.10 · PostgreSQL 16 · Auth.js v5 · bcryptjs · `otpauth` (TOTP) · `qrcode` · Node `crypto` (AES-256-GCM)

**Spec:** `docs/superpowers/specs/2026-09-10-auth-rbac-2fa-design.md`

**Plan berikutnya:** Plan 03 — Administrasi (manajemen pengguna, dua penampil log, konfigurasi WA Gateway di UI, penegakan peran menyeluruh). Plan ini sengaja berhenti sebelum itu supaya menghasilkan perangkat lunak yang benar-benar jalan: setelah Plan 02, seseorang dapat login dengan dua faktor dan memulihkan sandinya sendiri.

## Global Constraints

- Node.js **20.19+**; npm. **Prisma dipin `^7.10.0`** untuk `prisma`, `@prisma/client`, dan `@prisma/adapter-pg`. **Jangan pernah menjalankan `npm install prisma` tanpa versi** — tag `latest` npm menunjuk pre-release `8.0.0-rc.13` dan akan merusak pasangan CLI/client.
- **bcryptjs**, bukan `bcrypt` — host Windows, `bcrypt` butuh node-gyp.
- Prisma 7 memerlukan **driver adapter**: selalu impor singleton `prisma` dari `@/lib/prisma`; jangan pernah memanggil `new PrismaClient()` tanpa adapter. Datasource URL berada di `prisma.config.ts`, bukan di `schema.prisma`.
- Seluruh nominal uang bertipe **`Int` rupiah penuh**. Tidak ada `Float`/`Decimal` untuk uang.
- Seluruh teks yang dilihat pengguna **berbahasa Indonesia**. Locale `id-ID`, zona waktu `Asia/Jakarta`. Komentar kode dan pesan commit berbahasa Inggris.
- **Warna hanya lewat token `@theme`** di `src/app/globals.css`; **dilarang menulis hex di JSX**. Token yang ada hanya: `gray-{50,100,200,300,400,500,600,700,900}`, `brand-{50,100,600,700}`, `success-{50,500,700}`, `error-{50,100,200,500,600,700}`, `warn-{50,200,500,700}`, `sidebar`, `sidebar-fg`, `sidebar-dot`, `sidebar-muted`. Menulis `gray-800` **terkompilasi diam-diam** dan merender warna bawaan Tailwind. `bg-white`/`text-white` bawaan boleh.
- Kromnya cetak membawa `data-noprint`. Responsif pada satu breakpoint `max-width: 900px`.
- **`src/lib/auth.config.ts` wajib bebas impor Node-only** — ia dimuat `src/proxy.ts`. Sudah dijaga `tests/unit/auth-config.test.ts`; jangan lemahkan test itu.
- **Panggil guard otorisasi di baris paling atas Server Action, di luar `try`.** `redirect()` melempar `NEXT_REDIRECT`; `try/catch` yang tidak melemparnya ulang akan menelan pengecekan diam-diam.
- Playwright dikonfigurasi deterministik (`workers: 1`, `fullyParallel: false`). **Jangan ubah `playwright.config.ts`.** Jangan pernah menjalankan `next dev` sendiri, dan jangan pernah memakai mode `--ui`, `--debug`, atau `--headed`.
- **Jangan pernah menjalankan `prisma migrate reset` atau `db push`** terhadap database hidup di port 5433 — ia memuat skema termigrasi dan master data ter-seed.
- Conventional Commits; akhiri pesan commit dengan `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `src/lib/phone.ts` | `normalizePhone` / `formatPhoneLocal` — murni, tanpa I/O |
| `src/lib/crypto.ts` | `encryptSecret` / `decryptSecret` — AES-256-GCM, kunci dari env |
| `src/lib/totp.ts` | Bangkitkan secret, susun URI `otpauth://`, verifikasi kode |
| `src/lib/wa-gateway.ts` | Klien HTTP WA Gateway: `sendMessage`, `checkHealth` |
| `src/lib/auth-event.ts` | `recordAuthEvent` — satu pintu penulisan jejak keamanan |
| `src/lib/rate-limit.ts` | `checkLoginRate` — menghitung dari `AuthEvent`, tanpa tabel baru |
| `src/lib/auth-challenge.ts` | Membuat, mengambil, memverifikasi, dan membakar `AuthChallenge` |
| `src/lib/actions/login-password.ts` | Tahap 1 — verifikasi sandi, terbitkan challenge |
| `src/lib/actions/login-otp.ts` | Tahap 2 — jembatan ke `signIn('otp')` |
| `src/lib/actions/totp-enroll.ts` | Mulai dan konfirmasi pendaftaran TOTP |
| `src/lib/actions/change-password.ts` | Ganti sandi paksa dan sukarela |
| `src/lib/actions/forgot-password.ts` | Minta dan selesaikan reset sandi |
| `src/lib/auth.ts` | **Diubah** — provider `otp` menggantikan provider `credentials` |
| `src/app/(auth)/login/*` | **Diubah** — username, bukan email |
| `src/app/(auth)/login/verifikasi/*` | Layar faktor kedua |
| `src/app/(auth)/lupa-sandi/*` | Alur lupa sandi |
| `src/app/(app)/ganti-sandi/*` | Ganti sandi paksa |
| `src/app/(app)/keamanan/2fa/*` | Pendaftaran TOTP |
| `src/app/(app)/layout.tsx` | **Diubah** — gerbang paksa ganti sandi dan daftar TOTP |
| `prisma/schema.prisma` | **Diubah** — §3.1, §3.2 spec |
| `prisma/seed-data.ts`, `prisma/seed.ts` | **Diubah** — akun tunggal `admin` |
| `scripts/auth-recover.ts` | Pemulihan lewat SSH |

---

## Task 1: Normalisasi nomor telepon

Fungsi murni, tanpa I/O. Dikerjakan pertama karena migrasi Task 3 memakainya untuk mengonversi data lama, dan salah di sini berarti OTP gagal terkirim untuk setiap pengguna dengan gejala yang menyerupai gangguan gateway.

**Files:**
- Create: `src/lib/phone.ts`
- Test: `tests/unit/phone.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `normalizePhone(input: string | null | undefined): string | null` — bentuk `62…` atau `null` bila tidak sah
  - `formatPhoneLocal(normalized: string | null): string` — `6281233445566` → `0812-3344-5566`, `''` bila null

- [ ] **Step 1: Tulis test yang gagal**

`tests/unit/phone.test.ts` — tabel kasus disalin dari spec §3.5:

```ts
import { describe, expect, it } from 'vitest';
import { formatPhoneLocal, normalizePhone } from '@/lib/phone';

describe('normalizePhone', () => {
  it('menerima bentuk lokal baku', () => {
    expect(normalizePhone('081233445566')).toBe('6281233445566');
  });

  it('membuang pemisah', () => {
    expect(normalizePhone('0812-3344-5566')).toBe('6281233445566');
    expect(normalizePhone('0812 3344 5566')).toBe('6281233445566');
    expect(normalizePhone('(0812) 3344-5566')).toBe('6281233445566');
  });

  it('membuang tanda plus', () => {
    expect(normalizePhone('+6281233445566')).toBe('6281233445566');
  });

  it('membiarkan bentuk internasional', () => {
    expect(normalizePhone('6281233445566')).toBe('6281233445566');
  });

  it('menambahkan 62 saat nol di depan hilang', () => {
    expect(normalizePhone('81233445566')).toBe('6281233445566');
  });

  it('menolak nomor tetap', () => {
    expect(normalizePhone('02112345678')).toBeNull();
  });

  it('menolak yang terlalu pendek atau terlalu panjang', () => {
    expect(normalizePhone('08123')).toBeNull();
    expect(normalizePhone('0812334455661234')).toBeNull();
  });

  it('menolak yang mengandung huruf', () => {
    expect(normalizePhone('0812abc45566')).toBeNull();
  });

  it('memperlakukan kosong sebagai tidak ada', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe('formatPhoneLocal', () => {
  it('menampilkan kembali dalam bentuk lokal', () => {
    expect(formatPhoneLocal('6281233445566')).toBe('0812-3344-5566');
  });

  it('mengembalikan string kosong untuk null', () => {
    expect(formatPhoneLocal(null)).toBe('');
  });
});
```

- [ ] **Step 2: Jalankan test — harus gagal**

Run: `npx vitest run tests/unit/phone.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/phone"`

- [ ] **Step 3: Implementasi**

`src/lib/phone.ts`:

```ts
/**
 * Indonesian mobile numbers are stored canonically as 62 + national
 * significant number, where the NSN starts with 8 and is 9-12 digits long.
 * Landlines (021, 031, ...) cannot receive WhatsApp and are rejected.
 */
const CANONICAL = /^628\d{8,11}$/;

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  // Reject anything containing characters that are neither digits nor the
  // separators people commonly type. A letter means a typo, not a number.
  if (/[^\d\s()+\-.]/.test(trimmed)) return null;

  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;

  let candidate: string;
  if (digits.startsWith('62')) candidate = digits;
  else if (digits.startsWith('0')) candidate = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) candidate = `62${digits}`;
  else return null;

  return CANONICAL.test(candidate) ? candidate : null;
}

export function formatPhoneLocal(normalized: string | null): string {
  if (!normalized) return '';
  const nsn = normalized.slice(2); // drop the 62
  const local = `0${nsn}`;
  // 0812-3344-5566 — group as 4-4-rest, which is how Indonesians write it.
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}
```

- [ ] **Step 4: Jalankan test — harus lulus**

Run: `npx vitest run tests/unit/phone.test.ts`
Expected: PASS — 11 test hijau.

- [ ] **Step 5: Commit**

```bash
git add src/lib/phone.ts tests/unit/phone.test.ts
git commit -m "feat: add Indonesian phone normalization

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Enkripsi rahasia tersimpan

Dipakai untuk `User.totpSecret` (Task 3 dan seterusnya) dan untuk API key WA Gateway di Plan 03.

**Files:**
- Create: `src/lib/crypto.ts`
- Modify: `.env.example`, `.env.production.example`
- Test: `tests/unit/crypto.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `encryptSecret(plaintext: string): string` — mengembalikan `iv.authTag.ciphertext` dalam base64url, dipisah titik
  - `decryptSecret(payload: string): string`
  - Keduanya melempar `Error` bila `ENCRYPTION_KEY` tidak diisi atau bukan 32 byte

- [ ] **Step 1: Tulis test yang gagal**

`tests/unit/crypto.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '@/lib/crypto';

beforeAll(() => {
  // 32 bytes, base64 — the same shape DEPLOYMENT.md tells the operator to generate.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('encryptSecret / decryptSecret', () => {
  it('mengembalikan nilai semula', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('menghasilkan ciphertext berbeda tiap kali untuk masukan sama', () => {
    const a = encryptSecret('sama');
    const b = encryptSecret('sama');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('sama');
    expect(decryptSecret(b)).toBe('sama');
  });

  it('menolak payload yang dirusak', () => {
    const payload = encryptSecret('rahasia');
    const parts = payload.split('.');
    const tampered = [parts[0], parts[1], parts[2].slice(0, -2) + 'AA'].join('.');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('menolak payload berbentuk salah', () => {
    expect(() => decryptSecret('bukan-payload')).toThrow();
  });
});
```

- [ ] **Step 2: Jalankan test — harus gagal**

Run: `npx vitest run tests/unit/crypto.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/crypto"`

- [ ] **Step 3: Implementasi**

`src/lib/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard
const KEY_BYTES = 32;

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY belum diisi. Set di .env (pengembangan lokal) atau di ' +
        'environment container (produksi) — lihat .env.example.',
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== KEY_BYTES) {
    throw new Error(`ENCRYPTION_KEY harus 32 byte base64; diterima ${buf.length} byte.`);
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Payload terenkripsi tidak berbentuk benar.');
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64url'));

  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  // GCM throws here when the ciphertext or tag has been altered.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: Tambahkan variabel ke berkas contoh**

Tambahkan ke `.env.example`:

```
ENCRYPTION_KEY="hasil-dari-openssl-rand-base64-32"
SEED_ADMIN_PASSWORD="sandi-awal-akun-admin"

# WA Gateway — sementara dibaca dari environment. Plan 03 memindahkannya ke
# tabel AppSetting agar dapat diubah lewat UI tanpa deploy ulang.
WA_BASE_URL="http://localhost:3000"
WA_API_KEY="wag_ganti-dengan-kunci-dari-dashboard-gateway"
WA_INSTANCE=""
```

Tambahkan ke `.env.production.example`:

```
ENCRYPTION_KEY=hasil-dari-openssl-rand-base64-32
SEED_ADMIN_PASSWORD=sandi-acak-panjang-untuk-login-pertama
WA_BASE_URL=http://alamat-gateway-anda:3000
WA_API_KEY=wag_kunci-dari-dashboard-gateway
WA_INSTANCE=
```

Sekalian perbaiki petunjuk usang di `.env.example`: baris `AUTH_SECRET`
menyarankan `npx auth secret`, yang tidak bekerja — perintah itu me-resolve
ke paket npm yang tidak berhubungan. Ganti petunjuknya menjadi
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

- [ ] **Step 5: Isi nilai lokal agar test dan aplikasi jalan**

```bash
node -e "console.log('ENCRYPTION_KEY=\"'+require('crypto').randomBytes(32).toString('base64')+'\"')" >> .env
node -e "console.log('SEED_ADMIN_PASSWORD=\"pbk-lokal-2026\"')" >> .env
```

Lalu tambahkan keduanya ke `tests/setup.ts` dengan pola `??=` yang sudah dipakai di sana, supaya unit test tidak bergantung pada `.env`:

```ts
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64');
process.env.SEED_ADMIN_PASSWORD ??= 'test-only-password';
```

- [ ] **Step 6: Jalankan test — harus lulus**

Run: `npx vitest run tests/unit/crypto.test.ts`
Expected: PASS — 4 test hijau.

- [ ] **Step 7: Commit**

```bash
git add src/lib/crypto.ts tests/unit/crypto.test.ts tests/setup.ts .env.example .env.production.example
git commit -m "feat: add AES-256-GCM helpers for secrets at rest

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Skema dan migrasi

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_auth_rbac_2fa/migration.sql` (dihasilkan, lalu disunting)
- Test: `tests/unit/prisma-schema.test.ts` (diperluas)

**Interfaces:**
- Consumes: `normalizePhone` dari Task 1 (untuk verifikasi data, bukan di dalam SQL)
- Produces: enum `Role` dengan `SUPERADMIN`; kolom `User.username`, `mustChangePassword`, `totpSecret`, `totpEnabledAt`, `isActive`, `lastLoginAt`; model `AuthChallenge`, `AuthEvent`, `AppSetting`; enum `ChallengePurpose`, `SecondFactor`

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `tests/unit/prisma-schema.test.ts`:

```ts
describe('skema autentikasi', () => {
  it('menambahkan SUPERADMIN ke enum Role', () => {
    expect(schema).toMatch(/enum Role \{[^}]*SUPERADMIN/s);
  });

  it('mendeklarasikan enum challenge', () => {
    expect(schema).toContain('enum ChallengePurpose');
    expect(schema).toContain('enum SecondFactor');
  });

  it('mendeklarasikan model autentikasi baru', () => {
    for (const m of ['model AuthChallenge', 'model AuthEvent', 'model AppSetting']) {
      expect(schema).toContain(m);
    }
  });

  it('menjadikan username unik dan email opsional', () => {
    expect(schema).toMatch(/username\s+String\s+@unique/);
    expect(schema).toMatch(/email\s+String\?/);
    expect(schema).not.toMatch(/email\s+String\s+@unique/);
  });

  it('menyimpan kolom 2FA pada User', () => {
    for (const f of ['totpSecret', 'totpEnabledAt', 'mustChangePassword', 'isActive', 'lastLoginAt']) {
      expect(schema).toContain(f);
    }
  });
});
```

- [ ] **Step 2: Jalankan test — harus gagal**

Run: `npx vitest run tests/unit/prisma-schema.test.ts`
Expected: FAIL — lima test baru gagal; test lama tetap lulus.

- [ ] **Step 3: Sunting skema**

Terapkan blok §3.1 dan §3.2 spec ke `prisma/schema.prisma`. Tambahkan juga relasi balik pada `User`:

```prisma
  challenges AuthChallenge[]
```

Dan satu kolom yang tidak ada di spec tetapi dibutuhkan Task 13 untuk
membatalkan sesi lama setelah sandi diganti:

```prisma
  passwordChangedAt DateTime?
```

Auth.js memakai sesi JWT, yang tidak dapat dicabut dari sisi server. Cara
paling sederhana membatalkannya adalah membandingkan waktu terbit token
dengan kolom ini di callback `session`, lalu menolak token yang lebih tua.
Tanpa kolom ini, sandi yang direset tidak mengusir sesi yang sudah berjalan
di perangkat lain — yang justru menjadi alasan orang mereset sandinya.

- [ ] **Step 4: Hasilkan migrasi tanpa menerapkannya**

```bash
npx prisma migrate dev --name auth_rbac_2fa --create-only
```

`--create-only` wajib: SQL yang dihasilkan akan menambahkan `username NOT NULL UNIQUE` pada tabel berisi data dan gagal. Kita menyuntingnya lebih dulu.

- [ ] **Step 5: Sunting SQL migrasi agar mengisi data lama**

Ganti pernyataan yang menambahkan `username` dengan urutan tiga langkah, dan tambahkan normalisasi telepon:

```sql
-- 1. tambahkan nullable dulu
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- 2. isi mundur dari bagian lokal email, bersihkan karakter tak sah,
--    dan selesaikan tabrakan dengan nomor urut
UPDATE "User" SET "username" = regexp_replace(split_part("email", '@', 1), '[^a-zA-Z0-9._-]', '', 'g');

WITH ranked AS (
  SELECT "id", "username",
         ROW_NUMBER() OVER (PARTITION BY "username" ORDER BY "createdAt") AS rn
  FROM "User"
)
UPDATE "User" u SET "username" = u."username" || ranked.rn::text
FROM ranked WHERE u."id" = ranked."id" AND ranked.rn > 1;

-- 3. baru kunci
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- normalisasi telepon ke 62xxx; tanpa ini OTP gagal terkirim untuk
-- setiap pengguna lama, dan gejalanya (422) menyerupai gangguan gateway
UPDATE "User"
SET "phone" = CASE
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') LIKE '62%'
    THEN regexp_replace("phone", '[^0-9]', '', 'g')
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') LIKE '0%'
    THEN '62' || substring(regexp_replace("phone", '[^0-9]', '', 'g') from 2)
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') LIKE '8%'
    THEN '62' || regexp_replace("phone", '[^0-9]', '', 'g')
  ELSE NULL
END
WHERE "phone" IS NOT NULL;

-- buang yang tidak memenuhi bentuk kanonik (nomor tetap, terlalu pendek/panjang)
UPDATE "User" SET "phone" = NULL
WHERE "phone" IS NOT NULL AND "phone" !~ '^628[0-9]{8,11}$';
```

Pastikan pernyataan yang melepas keunikan email ada:

```sql
DROP INDEX IF EXISTS "User_email_key";
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
```

Terakhir, naikkan akun bootstrap ke peran barunya. Tanpa ini akun `admin`
tetap `ADMIN` selamanya: seed Task 4 memakai `update: {}` — yang memang
benar, karena redeploy tidak boleh mereset sandi yang sudah diganti
operator — sehingga ia tidak akan pernah memperbarui peran baris yang sudah
ada.

```sql
-- One-time promotion of the bootstrap account. Scoped to the seeded
-- username and its pre-migration role so a deliberate demotion later is
-- never silently undone.
UPDATE "User" SET "role" = 'SUPERADMIN'
WHERE "username" = 'admin' AND "role" = 'ADMIN';
```

- [ ] **Step 6: Terapkan migrasi**

```bash
npx prisma migrate dev
npx prisma generate
```

- [ ] **Step 7: Verifikasi terhadap database hidup**

```bash
.postgres/pgsql/bin/psql.exe -U pbk -h 127.0.0.1 -p 5433 -d pbk -tAc \
  'SELECT "username", "email", "role", "phone", "isActive" FROM "User"'
```

Expected: satu baris, `username` terisi (`admin`), `phone` bernilai NULL (akun seed tidak punya nomor), `isActive` true.

- [ ] **Step 8: Jalankan test — harus lulus**

Run: `npx vitest run tests/unit/prisma-schema.test.ts`
Expected: PASS — seluruh test skema hijau.

- [ ] **Step 9: Commit**

```bash
git add prisma/ tests/unit/prisma-schema.test.ts
git commit -m "feat: add auth schema with username, 2FA columns, and challenge tables

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Seed akun tunggal

**Files:**
- Modify: `prisma/seed-data.ts`, `prisma/seed.ts`
- Test: `tests/unit/seed-data.test.ts` (diperluas)

**Interfaces:**
- Consumes: `normalizePhone` (Task 1)
- Produces: `SEED_ADMIN` konstanta ter-ekspor; satu baris `User` dengan `username: 'admin'`, `role: 'SUPERADMIN'`

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `tests/unit/seed-data.test.ts`:

```ts
import { SEED_ADMIN } from '../../prisma/seed-data';

describe('akun seed', () => {
  it('adalah administrator tunggal', () => {
    expect(SEED_ADMIN.username).toBe('admin');
    expect(SEED_ADMIN.name).toBe('Administrator');
    expect(SEED_ADMIN.role).toBe('SUPERADMIN');
  });

  it('tidak membawa identitas pribadi apa pun', () => {
    const serialized = JSON.stringify(SEED_ADMIN);
    expect(serialized).not.toMatch(/anggi|sman21sby|19870412|0812/i);
  });

  it('tidak punya telepon maupun TOTP, sehingga masuk lewat pengecualian bootstrap', () => {
    expect(SEED_ADMIN.phone ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan test — harus gagal**

Run: `npx vitest run tests/unit/seed-data.test.ts`
Expected: FAIL — `SEED_ADMIN` belum diekspor.

- [ ] **Step 3: Tambahkan konstanta**

Ke `prisma/seed-data.ts`:

```ts
import type { Role } from '@prisma/client';

export const SEED_ADMIN: {
  username: string;
  name: string;
  role: Role;
  phone: string | null;
} = {
  username: 'admin',
  name: 'Administrator',
  role: 'SUPERADMIN',
  phone: null,
};
```

- [ ] **Step 4: Tulis ulang upsert pengguna di `prisma/seed.ts`**

```ts
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!adminPassword) {
  throw new Error(
    'SEED_ADMIN_PASSWORD belum diisi. Set di .env (pengembangan lokal) atau di ' +
      'environment container (produksi) — lihat .env.example. Tidak ada nilai ' +
      'baku: sandi awal tidak boleh tersimpan di repositori.',
  );
}

await prisma.user.upsert({
  where: { username: SEED_ADMIN.username },
  // Empty update: a redeploy must never reset a password the operator changed.
  update: {},
  create: {
    username: SEED_ADMIN.username,
    name: SEED_ADMIN.name,
    role: SEED_ADMIN.role,
    passwordHash: await bcrypt.hash(adminPassword, 10),
    mustChangePassword: true,
  },
});
```

- [ ] **Step 5: Jalankan seed dua kali dan verifikasi idempoten**

```bash
npx prisma db seed && npx prisma db seed
.postgres/pgsql/bin/psql.exe -U pbk -h 127.0.0.1 -p 5433 -d pbk -tAc \
  'SELECT count(*), min("username"), min("role"::text) FROM "User"'
```

Expected: `1 | admin | SUPERADMIN` setelah kedua kali.

- [ ] **Step 6: Jalankan test — harus lulus**

Run: `npx vitest run tests/unit/seed-data.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/ tests/unit/seed-data.test.ts
git commit -m "feat: seed a single superadmin from a required env password

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Modul TOTP

**Files:**
- Create: `src/lib/totp.ts`
- Test: `tests/unit/totp.test.ts`

**Interfaces:**
- Consumes: `encryptSecret`/`decryptSecret` (Task 2)
- Produces:
  - `generateTotpSecret(): string` — base32
  - `buildOtpauthUri(username: string, secret: string): string`
  - `verifyTotp(secret: string, code: string, at?: Date): boolean` — toleransi ±1 langkah

- [ ] **Step 1: Pasang dependensi**

```bash
npm install otpauth@^9 qrcode@^1
npm install -D @types/qrcode
```

- [ ] **Step 2: Tulis test yang gagal — pakai vektor resmi RFC 6238**

`tests/unit/totp.test.ts`. Vektor ini berasal dari RFC 6238 Appendix B (secret ASCII `12345678901234567890`, SHA-1, langkah 30 detik). Menguji terhadap vektor resmi, bukan terhadap keluaran implementasi sendiri, adalah satu-satunya cara mengetahui implementasinya benar — implementasi yang salah secara konsisten akan lolos uji-diri-sendiri.

```ts
import { describe, expect, it } from 'vitest';
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from '@/lib/totp';

// ASCII "12345678901234567890" in base32
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('verifyTotp terhadap vektor RFC 6238', () => {
  const vectors: [number, string][] = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ];

  for (const [epochSeconds, code] of vectors) {
    it(`menerima ${code} pada T=${epochSeconds}`, () => {
      expect(verifyTotp(RFC_SECRET, code, new Date(epochSeconds * 1000))).toBe(true);
    });
  }

  it('menolak kode yang salah', () => {
    expect(verifyTotp(RFC_SECRET, '000000', new Date(59_000))).toBe(false);
  });
});

describe('toleransi jam', () => {
  it('menerima kode dari satu langkah sebelumnya', () => {
    // 287082 valid at T=59; still accepted 30s later
    expect(verifyTotp(RFC_SECRET, '287082', new Date(89_000))).toBe(true);
  });

  it('menolak kode dari dua langkah sebelumnya', () => {
    expect(verifyTotp(RFC_SECRET, '287082', new Date(119_000))).toBe(false);
  });
});

describe('generateTotpSecret', () => {
  it('menghasilkan base32 yang berbeda tiap panggilan', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]+$/);
  });
});

describe('buildOtpauthUri', () => {
  it('menyusun URI yang dikenali Google Authenticator', () => {
    const uri = buildOtpauthUri('admin', RFC_SECRET);
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('issuer=PBK');
    expect(uri).toContain(`secret=${RFC_SECRET}`);
  });
});
```

- [ ] **Step 3: Jalankan test — harus gagal**

Run: `npx vitest run tests/unit/totp.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/totp"`

- [ ] **Step 4: Implementasi**

`src/lib/totp.ts`:

```ts
import { Secret, TOTP } from 'otpauth';

const ISSUER = 'PBK';
const DIGITS = 6;
const PERIOD = 30;

function totpFor(secret: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1', // what Google Authenticator expects
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildOtpauthUri(username: string, secret: string): string {
  const totp = new TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
  return totp.toString();
}

/**
 * `window: 1` accepts the previous and next step, covering a phone clock
 * that drifts by up to 30 seconds either way. Wider windows trade real
 * security for convenience and are not worth it here.
 */
export function verifyTotp(secret: string, code: string, at?: Date): boolean {
  const cleaned = code.replace(/\D/g, '');
  if (cleaned.length !== DIGITS) return false;
  const delta = totpFor(secret).validate({ token: cleaned, window: 1, timestamp: at?.getTime() });
  return delta !== null;
}
```

- [ ] **Step 5: Jalankan test — harus lulus**

Run: `npx vitest run tests/unit/totp.test.ts`
Expected: PASS — 10 test hijau, termasuk kelima vektor RFC.

- [ ] **Step 6: Commit**

```bash
git add src/lib/totp.ts tests/unit/totp.test.ts package.json package-lock.json
git commit -m "feat: add TOTP module verified against RFC 6238 vectors

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Klien WA Gateway

**Files:**
- Create: `src/lib/wa-gateway.ts`
- Test: `tests/unit/wa-gateway.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type WaResult = { ok: true; jobId: string } | { ok: false; reason: 'unregistered' | 'unavailable' | 'unauthorized' | 'error'; detail: string }`
  - `sendWhatsApp(config: WaConfig, to: string, message: string): Promise<WaResult>`
  - `checkWaHealth(config: WaConfig): Promise<{ ok: boolean; detail: string }>`
  - `type WaConfig = { baseUrl: string; apiKey: string; instance?: string }`

Kontrak gateway diambil dari `e:/programming/WA-Gateway/README.md`. `202` berarti **antre**, bukan terkirim — tidak ada konfirmasi pengiriman, dan kode ini tidak boleh berpura-pura ada.

- [ ] **Step 1: Tulis test yang gagal**

`tests/unit/wa-gateway.test.ts` — memakai `vi.stubGlobal('fetch', …)`. **Test tidak boleh mengirim WhatsApp sungguhan.**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWaHealth, sendWhatsApp } from '@/lib/wa-gateway';

const config = { baseUrl: 'http://wa.test:3000', apiKey: 'wag_test', instance: 'wa1' };

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('sendWhatsApp', () => {
  it('mengembalikan jobId saat gateway menerima antrean', async () => {
    stubFetch(202, { success: true, jobId: '42' });
    const r = await sendWhatsApp(config, '6281233445566', 'Kode: 123456');
    expect(r).toEqual({ ok: true, jobId: '42' });
  });

  it('mengirim bearer token dan bentuk body yang benar', async () => {
    const fn = stubFetch(202, { success: true, jobId: '1' });
    await sendWhatsApp(config, '6281233445566', 'halo');
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://wa.test:3000/send-message');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer wag_test');
    expect(JSON.parse(init.body as string)).toEqual({
      message: 'halo',
      id: '6281233445566',
      from: 'wa1',
    });
  });

  it('memetakan 422 ke nomor tidak terdaftar', async () => {
    stubFetch(422, { error: 'not registered' });
    const r = await sendWhatsApp(config, '6289999999999', 'x');
    expect(r).toMatchObject({ ok: false, reason: 'unregistered' });
  });

  it('memetakan 503 ke layanan tidak tersedia', async () => {
    stubFetch(503, { error: 'no instance' });
    const r = await sendWhatsApp(config, '6281233445566', 'x');
    expect(r).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('memetakan 401 ke API key salah', async () => {
    stubFetch(401, { error: 'bad key' });
    const r = await sendWhatsApp(config, '6281233445566', 'x');
    expect(r).toMatchObject({ ok: false, reason: 'unauthorized' });
  });

  it('tidak melempar saat jaringan gagal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const r = await sendWhatsApp(config, '6281233445566', 'x');
    expect(r).toMatchObject({ ok: false, reason: 'error' });
  });
});

describe('checkWaHealth', () => {
  it('melaporkan sehat saat /health menjawab ok', async () => {
    stubFetch(200, { ok: true, ts: 1 });
    expect(await checkWaHealth(config)).toMatchObject({ ok: true });
  });

  it('melaporkan tidak sehat saat gateway tak terjangkau', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
    expect(await checkWaHealth(config)).toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 2: Jalankan test — harus gagal**

Run: `npx vitest run tests/unit/wa-gateway.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/wa-gateway"`

- [ ] **Step 3: Implementasi**

`src/lib/wa-gateway.ts`:

```ts
export type WaConfig = { baseUrl: string; apiKey: string; instance?: string };

export type WaResult =
  | { ok: true; jobId: string }
  | { ok: false; reason: 'unregistered' | 'unavailable' | 'unauthorized' | 'error'; detail: string };

const TIMEOUT_MS = 10_000;

/**
 * A 202 from the gateway means "queued", not "delivered" — the gateway
 * gives no delivery confirmation, so neither do we.
 */
export async function sendWhatsApp(config: WaConfig, to: string, message: string): Promise<WaResult> {
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ message, id: to, ...(config.instance ? { from: config.instance } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 202 || res.status === 200) {
      const body = (await res.json()) as { jobId?: string };
      return { ok: true, jobId: String(body.jobId ?? '') };
    }

    const detail = `HTTP ${res.status}`;
    if (res.status === 422) return { ok: false, reason: 'unregistered', detail };
    if (res.status === 503) return { ok: false, reason: 'unavailable', detail };
    if (res.status === 401) return { ok: false, reason: 'unauthorized', detail };
    return { ok: false, reason: 'error', detail };
  } catch (e) {
    return { ok: false, reason: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function checkWaHealth(config: WaConfig): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 4: Jalankan test — harus lulus**

Run: `npx vitest run tests/unit/wa-gateway.test.ts`
Expected: PASS — 8 test hijau.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wa-gateway.ts tests/unit/wa-gateway.test.ts
git commit -m "feat: add WA Gateway client with explicit failure reasons

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Jejak keamanan dan pembatasan laju

Keduanya kecil dan saling terkait: pembatas laju menghitung dari jejak yang direkam perekam, sehingga tidak ada tabel baru dan hitungannya bertahan melewati restart container.

**Files:**
- Create: `src/lib/auth-event.ts`, `src/lib/rate-limit.ts`
- Test: `tests/unit/rate-limit.test.ts`

**Interfaces:**
- Consumes: `prisma` dari `@/lib/prisma`
- Produces:
  - `recordAuthEvent(input: { event: string; userId?: string | null; username?: string | null; ip?: string | null; userAgent?: string | null; meta?: Record<string, unknown> }): Promise<void>`
  - `type RateVerdict = { allowed: true } | { allowed: false; retryAfterMinutes: number }`
  - `evaluateRate(failures: { byUsername: number; byIp: number }): RateVerdict` — murni
  - `checkLoginRate(username: string, ip: string | null): Promise<RateVerdict>`

Batas: 5 kegagalan per username per 15 menit; 20 per IP per 15 menit.

- [ ] **Step 1: Tulis test yang gagal**

`tests/unit/rate-limit.test.ts` — menguji fungsi murninya, bukan kuerinya:

```ts
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
```

- [ ] **Step 2: Jalankan test — harus gagal**

Run: `npx vitest run tests/unit/rate-limit.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/rate-limit"`

- [ ] **Step 3: Implementasi perekam**

`src/lib/auth-event.ts`:

```ts
import { prisma } from '@/lib/prisma';

/**
 * Single door for the security trail. Never pass a password, a raw OTP, or
 * a TOTP secret in `meta` — this table is read in the UI by SUPERADMIN.
 */
export async function recordAuthEvent(input: {
  event: string;
  userId?: string | null;
  username?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await prisma.authEvent.create({
    data: {
      event: input.event,
      userId: input.userId ?? null,
      username: input.username ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      meta: (input.meta ?? undefined) as never,
    },
  });
}
```

- [ ] **Step 4: Implementasi pembatas laju**

`src/lib/rate-limit.ts`:

```ts
import { prisma } from '@/lib/prisma';

const WINDOW_MINUTES = 15;
const MAX_PER_USERNAME = 5;
const MAX_PER_IP = 20;

export type RateVerdict = { allowed: true } | { allowed: false; retryAfterMinutes: number };

/** Pure, so the thresholds are testable without a database. */
export function evaluateRate(failures: { byUsername: number; byIp: number }): RateVerdict {
  if (failures.byUsername >= MAX_PER_USERNAME || failures.byIp >= MAX_PER_IP) {
    return { allowed: false, retryAfterMinutes: WINDOW_MINUTES };
  }
  return { allowed: true };
}

/**
 * Counts from AuthEvent rather than an in-memory map, so the limit survives
 * a container restart — otherwise restarting the app resets an attacker's
 * budget.
 */
export async function checkLoginRate(username: string, ip: string | null): Promise<RateVerdict> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [byUsername, byIp] = await Promise.all([
    prisma.authEvent.count({
      where: { event: 'login.password_fail', username, createdAt: { gte: since } },
    }),
    ip
      ? prisma.authEvent.count({
          where: { event: 'login.password_fail', ip, createdAt: { gte: since } },
        })
      : Promise.resolve(0),
  ]);
  return evaluateRate({ byUsername, byIp });
}
```

- [ ] **Step 5: Jalankan test — harus lulus**

Run: `npx vitest run tests/unit/rate-limit.test.ts`
Expected: PASS — 4 test hijau.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth-event.ts src/lib/rate-limit.ts tests/unit/rate-limit.test.ts
git commit -m "feat: add auth event trail and database-backed login rate limit

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Layanan challenge

**Files:**
- Create: `src/lib/auth-challenge.ts`
- Test: `tests/unit/auth-challenge.test.ts`

**Interfaces:**
- Consumes: `prisma`, `verifyTotp` (Task 5), `decryptSecret` (Task 2)
- Produces:
  - `CHALLENGE_COOKIE = 'pbk_chal'`, `CHALLENGE_TTL_MINUTES = 5`, `MAX_CHALLENGE_ATTEMPTS = 5`
  - `evaluateChallenge(c: { expiresAt: Date; consumedAt: Date | null; attempts: number }, now: Date): 'usable' | 'expired' | 'consumed' | 'exhausted'` — murni
  - `generateOtpCode(): string` — 6 digit acak kriptografis
  - `hashOtp(code: string): string`, `verifyOtpHash(code: string, hash: string): boolean` — tahan waktu

- [ ] **Step 1: Tulis test yang gagal**

`tests/unit/auth-challenge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evaluateChallenge, generateOtpCode, hashOtp, verifyOtpHash } from '@/lib/auth-challenge';

const now = new Date('2026-09-10T10:00:00Z');
const future = new Date('2026-09-10T10:04:00Z');
const past = new Date('2026-09-10T09:59:00Z');

describe('evaluateChallenge', () => {
  it('dapat dipakai saat belum kedaluwarsa, belum terpakai, percobaan masih sisa', () => {
    expect(evaluateChallenge({ expiresAt: future, consumedAt: null, attempts: 0 }, now)).toBe('usable');
  });

  it('kedaluwarsa saat lewat waktu', () => {
    expect(evaluateChallenge({ expiresAt: past, consumedAt: null, attempts: 0 }, now)).toBe('expired');
  });

  it('terpakai saat sudah dikonsumsi', () => {
    expect(evaluateChallenge({ expiresAt: future, consumedAt: past, attempts: 0 }, now)).toBe('consumed');
  });

  it('habis saat percobaan mencapai batas', () => {
    expect(evaluateChallenge({ expiresAt: future, consumedAt: null, attempts: 5 }, now)).toBe('exhausted');
  });

  it('memeriksa terpakai sebelum kedaluwarsa', () => {
    expect(evaluateChallenge({ expiresAt: past, consumedAt: past, attempts: 0 }, now)).toBe('consumed');
  });
});

describe('kode OTP', () => {
  it('enam digit', () => {
    for (let i = 0; i < 50; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it('tidak selalu sama', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateOtpCode()));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('cocok hanya untuk kode yang benar', () => {
    const h = hashOtp('123456');
    expect(verifyOtpHash('123456', h)).toBe(true);
    expect(verifyOtpHash('123457', h)).toBe(false);
  });

  it('tidak menyimpan kode dalam bentuk polos', () => {
    expect(hashOtp('123456')).not.toContain('123456');
  });
});
```

- [ ] **Step 2: Jalankan test — harus gagal**

Run: `npx vitest run tests/unit/auth-challenge.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/auth-challenge.ts`:

```ts
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const CHALLENGE_COOKIE = 'pbk_chal';
export const CHALLENGE_TTL_MINUTES = 5;
export const MAX_CHALLENGE_ATTEMPTS = 5;

export type ChallengeState = 'usable' | 'expired' | 'consumed' | 'exhausted';

/** Pure, so the state machine is testable without a database. */
export function evaluateChallenge(
  c: { expiresAt: Date; consumedAt: Date | null; attempts: number },
  now: Date,
): ChallengeState {
  if (c.consumedAt) return 'consumed';
  if (c.attempts >= MAX_CHALLENGE_ATTEMPTS) return 'exhausted';
  if (c.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'usable';
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function otpKey(): string {
  // Reuses AUTH_SECRET: the OTP hash only needs to be unforgeable by someone
  // holding the database, and it lives for five minutes.
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET belum diisi — lihat .env.example.');
  return secret;
}

export function hashOtp(code: string): string {
  return createHmac('sha256', otpKey()).update(code).digest('hex');
}

export function verifyOtpHash(code: string, hash: string): boolean {
  const a = Buffer.from(hashOtp(code), 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Jalankan test — harus lulus**

Run: `npx vitest run tests/unit/auth-challenge.test.ts`
Expected: PASS — 9 test hijau.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-challenge.ts tests/unit/auth-challenge.test.ts
git commit -m "feat: add auth challenge state machine and OTP hashing

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Tahap 1 — verifikasi sandi

**Files:**
- Create: `src/lib/actions/login-password.ts`
- Modify: `src/app/(auth)/login/login-form.tsx`, `src/app/(auth)/login/page.tsx`
- Test: `tests/unit/login-password.test.ts`

**Interfaces:**
- Consumes: `checkLoginRate`, `recordAuthEvent`, `normalizePhone`, `generateOtpCode`, `hashOtp`, `sendWhatsApp`, `CHALLENGE_COOKIE`
- Produces:
  - `chooseSecondFactor(user: { totpEnabledAt: Date | null; phone: string | null }): 'TOTP' | 'WA_OTP' | 'BOOTSTRAP'` — murni
  - Server action `startLogin(prevState, formData): Promise<string | undefined>`

`BOOTSTRAP` adalah pengecualian spec §2.1: tanpa TOTP **dan** tanpa telepon, faktor kedua tidak bisa dikirim ke mana pun, jadi login hanya sandi lalu pendaftaran TOTP dipaksakan.

- [ ] **Step 1: Tulis test yang gagal**

`tests/unit/login-password.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chooseSecondFactor } from '@/lib/actions/login-password';

describe('chooseSecondFactor', () => {
  it('memilih TOTP bila terdaftar', () => {
    expect(chooseSecondFactor({ totpEnabledAt: new Date(), phone: '6281233445566' })).toBe('TOTP');
  });

  it('memilih TOTP walau tidak ada telepon', () => {
    expect(chooseSecondFactor({ totpEnabledAt: new Date(), phone: null })).toBe('TOTP');
  });

  it('memilih WA bila ada telepon tapi belum ada TOTP', () => {
    expect(chooseSecondFactor({ totpEnabledAt: null, phone: '6281233445566' })).toBe('WA_OTP');
  });

  it('memilih BOOTSTRAP bila keduanya tidak ada', () => {
    expect(chooseSecondFactor({ totpEnabledAt: null, phone: null })).toBe('BOOTSTRAP');
  });
});
```

- [ ] **Step 2: Jalankan test — harus gagal**

Run: `npx vitest run tests/unit/login-password.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi action**

`src/lib/actions/login-password.ts`:

```ts
'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { recordAuthEvent } from '@/lib/auth-event';
import { checkLoginRate } from '@/lib/rate-limit';
import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_MINUTES,
  generateOtpCode,
  hashOtp,
} from '@/lib/auth-challenge';
import { sendWhatsApp } from '@/lib/wa-gateway';

/**
 * Compared against when the username does not exist, so a missing user
 * costs the same time as a wrong password. Without this, response timing
 * tells an attacker which usernames are real.
 */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.aB0e8b0eYVQ4a1Qk3rC5b8Xh1yqK';

const schema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

export function chooseSecondFactor(user: {
  totpEnabledAt: Date | null;
  phone: string | null;
}): 'TOTP' | 'WA_OTP' | 'BOOTSTRAP' {
  if (user.totpEnabledAt) return 'TOTP';
  if (user.phone) return 'WA_OTP';
  return 'BOOTSTRAP';
}

const GENERIC = 'Username atau kata sandi salah.';

export async function startLogin(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const parsed = schema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  });
  if (!parsed.success) return GENERIC;

  const username = parsed.data.username.trim().toLowerCase();
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = h.get('user-agent');

  const rate = await checkLoginRate(username, ip);
  if (!rate.allowed) {
    return `Terlalu banyak percobaan. Coba lagi dalam ${rate.retryAfterMinutes} menit.`;
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok) {
    await recordAuthEvent({ event: 'login.password_fail', username, ip, userAgent });
    return GENERIC;
  }
  if (!user.isActive) {
    await recordAuthEvent({ event: 'login.user_inactive', userId: user.id, username, ip, userAgent });
    return GENERIC;
  }

  const method = chooseSecondFactor(user);
  await recordAuthEvent({
    event: 'login.password_ok',
    userId: user.id,
    username,
    ip,
    userAgent,
    meta: { method },
  });

  const isBootstrap = method === 'BOOTSTRAP';
  const otp = method === 'WA_OTP' ? generateOtpCode() : null;

  const challenge = await prisma.authChallenge.create({
    data: {
      userId: user.id,
      purpose: 'LOGIN',
      method: isBootstrap ? 'TOTP' : method,
      otpHash: otp ? hashOtp(otp) : null,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000),
      // A bootstrap account has no second factor to present, so the challenge
      // is created already satisfied; stage 2 lets it through and the layout
      // gate then forces TOTP enrolment before anything else.
      consumedAt: isBootstrap ? new Date() : null,
    },
  });

  const store = await cookies();
  store.set(CHALLENGE_COOKIE, challenge.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CHALLENGE_TTL_MINUTES * 60,
  });

  if (otp && user.phone) {
    const config = {
      baseUrl: process.env.WA_BASE_URL ?? '',
      apiKey: process.env.WA_API_KEY ?? '',
      instance: process.env.WA_INSTANCE || undefined,
    };
    const result = await sendWhatsApp(config, user.phone, `Kode masuk PBK Anda: ${otp}. Berlaku 5 menit.`);
    if (!result.ok) {
      await recordAuthEvent({
        event: 'wa.send_fail',
        userId: user.id,
        username,
        ip,
        meta: { reason: result.reason, detail: result.detail },
      });
      if (result.reason === 'unregistered') {
        return 'Nomor WhatsApp Anda tidak terdaftar. Hubungi administrator.';
      }
      if (result.reason === 'unavailable') {
        return 'Layanan pengiriman kode sedang tidak tersedia. Hubungi administrator.';
      }
      return 'Kode gagal dikirim. Hubungi administrator.';
    }
    await recordAuthEvent({ event: 'wa.send_ok', userId: user.id, username, ip });
  }

  redirect('/login/verifikasi');
}
```

- [ ] **Step 4: Ubah form login menjadi username**

Di `src/app/(auth)/login/login-form.tsx`: ganti action menjadi `startLogin`, ubah field `email` menjadi `username` (`type="text"`, `autoComplete="username"`), dan label menjadi `Username`. Tambahkan tautan `Lupa sandi?` ke `/lupa-sandi` menggantikan `href="#"`. Buang checkbox "Ingat perangkat ini" — pengguna memilih OTP di setiap login, jadi kontrol itu tidak pernah melakukan apa pun dan tinjauan Plan 01 sudah menandainya sebagai kontrol mati.

- [ ] **Step 5: Jalankan test dan build**

Run: `npx vitest run tests/unit/login-password.test.ts && npx tsc --noEmit`
Expected: 4 test PASS, TypeScript bersih.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/login-password.ts src/app/\(auth\)/login/ tests/unit/login-password.test.ts
git commit -m "feat: verify password outside Auth.js and issue a login challenge

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Tahap 2 — provider OTP dan halaman verifikasi

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/app/(auth)/login/verifikasi/page.tsx`, `src/app/(auth)/login/verifikasi/verify-form.tsx`, `src/lib/actions/login-otp.ts`
- Test: `tests/e2e/login.spec.ts` (ditulis ulang)

**Interfaces:**
- Consumes: `evaluateChallenge`, `verifyOtpHash`, `verifyTotp`, `decryptSecret`, `CHALLENGE_COOKIE`
- Produces: provider Auth.js bernama `otp` menerima `{ challengeId, code }`; action `submitOtp(prevState, formData)`

- [ ] **Step 1: Tulis ulang e2e agar gagal**

`tests/e2e/login.spec.ts` — hapus alur berbasis email, tulis alur dua tahap. Kode TOTP dihitung di dalam test, sehingga alurnya benar-benar terverifikasi, bukan disimulasikan:

```ts
import { expect, test } from '@playwright/test';

const USERNAME = 'admin';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'pbk-lokal-2026';

test('menolak kredensial salah', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Kata Sandi').fill('sandi-salah');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByText('Username atau kata sandi salah')).toBeVisible();
});

test('kredensial benar menyelesaikan login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Kata Sandi').fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  // The seed account has neither TOTP nor a phone, so it enters through the
  // bootstrap exemption and lands on the dashboard. Task 11 adds the forced
  // enrolment gate and updates this assertion to expect /keamanan/2fa —
  // asserting that here would leave a test red across a task boundary for no
  // benefit, since nothing in Task 10 can make it pass.
  await expect(page).toHaveURL(/\/dashboard/);
});

test('mengarahkan tamu ke login', async ({ page }) => {
  await page.goto('/pembayaran');
  await expect(page).toHaveURL(/\/login/);
});
```

- [ ] **Step 2: Jalankan test — harus gagal**

Run: `npx playwright test tests/e2e/login.spec.ts`
Expected: FAIL — label `Username` belum ada.

- [ ] **Step 3: Ganti provider di `src/lib/auth.ts`**

Ganti provider `Credentials` yang lama dengan yang menerima challenge:

```ts
Credentials({
  id: 'otp',
  credentials: { challengeId: {}, code: {} },
  async authorize(raw) {
    const parsed = z
      .object({ challengeId: z.string().min(1), code: z.string().optional() })
      .safeParse(raw);
    if (!parsed.success) return null;

    const challenge = await prisma.authChallenge.findUnique({
      where: { id: parsed.data.challengeId },
      include: { user: true },
    });
    if (!challenge || challenge.purpose !== 'LOGIN') return null;

    const state = evaluateChallenge(challenge, new Date());

    // A bootstrap challenge is created already consumed: the account has no
    // second factor to present. Everything else must be usable.
    const isBootstrap = state === 'consumed' && challenge.otpHash === null;
    if (!isBootstrap && state !== 'usable') return null;

    if (!isBootstrap) {
      const code = parsed.data.code ?? '';
      const ok =
        challenge.method === 'TOTP'
          ? challenge.user.totpSecret
            ? verifyTotp(decryptSecret(challenge.user.totpSecret), code)
            : false
          : challenge.otpHash
            ? verifyOtpHash(code, challenge.otpHash)
            : false;

      if (!ok) {
        await prisma.authChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
        return null;
      }
      await prisma.authChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
    }

    if (!challenge.user.isActive) return null;

    await prisma.user.update({
      where: { id: challenge.user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      id: challenge.user.id,
      name: challenge.user.name,
      email: challenge.user.email ?? '',
      role: challenge.user.role,
    };
  },
}),
```

- [ ] **Step 4: Tulis action dan halaman verifikasi**

`src/lib/actions/login-otp.ts` memanggil `signIn('otp', { challengeId, code, redirectTo: '/dashboard' })`, mengembalikan pesan Indonesia untuk `AuthError`, dan **melempar ulang galat lain** agar sinyal `NEXT_REDIRECT` tidak tertelan.

`verifikasi/page.tsx` membaca cookie challenge, mengambil `method` dan empat digit terakhir nomor, lalu menampilkan salah satu petunjuk: *"Masukkan kode dari Google Authenticator"* atau *"Kode telah dikirim ke WhatsApp ••••6789"*. Untuk challenge bootstrap, halaman ini langsung meneruskan tanpa meminta kode.

- [ ] **Step 5: Jalankan seluruh test**

Run: `npm test && npx playwright test && npx tsc --noEmit && npm run build`
Expected: seluruh unit PASS, seluruh e2e PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: complete login through an Auth.js OTP provider

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Gerbang pasca-login

**Files:**
- Create: `src/lib/auth-gates.ts`, `src/app/(app)/ganti-sandi/page.tsx`, `src/app/(app)/ganti-sandi/form.tsx`, `src/lib/actions/change-password.ts`
- Modify: `src/app/(app)/layout.tsx`
- Test: `tests/unit/auth-gates.test.ts`

**Interfaces:**
- Consumes: `requireUser` dari `@/lib/auth-guard`
- Produces: `nextGate(user: { mustChangePassword: boolean; totpEnabledAt: Date | null; phone: string | null; role: Role }): '/ganti-sandi' | '/keamanan/2fa' | null` — murni

- [ ] **Step 1: Tulis test yang gagal**

```ts
import { describe, expect, it } from 'vitest';
import { nextGate } from '@/lib/auth-gates';

const base = { mustChangePassword: false, totpEnabledAt: null, phone: '6281233445566', role: 'BENDAHARA' as const };

describe('nextGate', () => {
  it('meminta ganti sandi lebih dulu', () => {
    expect(nextGate({ ...base, mustChangePassword: true })).toBe('/ganti-sandi');
  });

  it('memaksa TOTP untuk SUPERADMIN', () => {
    expect(nextGate({ ...base, role: 'SUPERADMIN' })).toBe('/keamanan/2fa');
  });

  it('memaksa TOTP untuk akun tanpa telepon dan tanpa TOTP', () => {
    expect(nextGate({ ...base, phone: null })).toBe('/keamanan/2fa');
  });

  it('membiarkan lewat pengguna biasa yang punya telepon', () => {
    expect(nextGate(base)).toBeNull();
  });

  it('membiarkan lewat SUPERADMIN yang sudah mendaftar TOTP', () => {
    expect(nextGate({ ...base, role: 'SUPERADMIN', totpEnabledAt: new Date() })).toBeNull();
  });

  it('mendahulukan ganti sandi di atas pendaftaran TOTP', () => {
    expect(nextGate({ ...base, mustChangePassword: true, role: 'SUPERADMIN' })).toBe('/ganti-sandi');
  });
});
```

- [ ] **Step 2: Jalankan test — harus gagal**

Run: `npx vitest run tests/unit/auth-gates.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi**

```ts
import type { Role } from '@prisma/client';

export function nextGate(user: {
  mustChangePassword: boolean;
  totpEnabledAt: Date | null;
  phone: string | null;
  role: Role;
}): '/ganti-sandi' | '/keamanan/2fa' | null {
  if (user.mustChangePassword) return '/ganti-sandi';
  if (user.totpEnabledAt) return null;
  // SUPERADMIN is the recovery path, so it must not depend on WhatsApp.
  // An account with no phone has no second factor at all until it enrols.
  if (user.role === 'SUPERADMIN' || !user.phone) return '/keamanan/2fa';
  return null;
}
```

- [ ] **Step 4: Pasang gerbang di layout**

Di `src/app/(app)/layout.tsx`, sebelum merender shell: ambil pengguna, hitung `nextGate`, dan `redirect()` bila tidak null — kecuali pathname saat ini sudah merupakan tujuan gerbang itu, agar tidak terjadi loop.

- [ ] **Step 5: Tulis halaman ganti sandi**

Form dengan sandi lama, sandi baru, konfirmasi. Action memverifikasi sandi lama, menyimpan hash baru, `mustChangePassword: false`, menulis `password.changed`.

- [ ] **Step 6: Perbarui asersi e2e yang ditinggalkan Task 10**

`tests/e2e/login.spec.ts` menegaskan login berhasil mendarat di `/dashboard`.
Setelah gerbang ini terpasang, akun seed — yang wajib ganti sandi — tidak lagi
mendarat di sana. Ubah asersinya:

```ts
  await expect(page).toHaveURL(/\/ganti-sandi/);
```

Ini bukan melemahkan test, melainkan memindahkannya mengikuti perilaku yang
sekarang benar. Jalankan e2e sebelum dan sesudah perubahan gerbang untuk
melihat asersi lama gagal dan yang baru lulus, lalu tempelkan keduanya di
laporan — asersi yang tidak pernah terlihat gagal tidak membuktikan apa pun.

- [ ] **Step 7: Jalankan seluruh test dan commit**

```bash
npm test && npx playwright test && npx tsc --noEmit
git add -A
git commit -m "feat: gate the app behind forced password change and TOTP enrolment

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: Pendaftaran TOTP

**Files:**
- Create: `src/app/(app)/keamanan/2fa/page.tsx`, `src/app/(app)/keamanan/2fa/enroll-form.tsx`, `src/lib/actions/totp-enroll.ts`
- Test: `tests/e2e/totp-enroll.spec.ts`

**Interfaces:**
- Consumes: `generateTotpSecret`, `buildOtpauthUri`, `verifyTotp`, `encryptSecret`
- Produces: action `beginEnrollment()` mengembalikan `{ secret, otpauthUri, qrDataUri }`; action `confirmEnrollment(prevState, formData)`

Secret disimpan **terenkripsi** dan `totpEnabledAt` **hanya diisi setelah satu kode benar** — mengaktifkan 2FA tanpa membuktikan aplikasinya bekerja akan mengunci pengguna pada login berikutnya.

- [ ] **Step 1: Tulis e2e yang gagal**

E2E masuk sebagai `admin`, mengikuti pengalihan paksa ke `/keamanan/2fa`, membaca secret dari elemen kode manual, **menghitung kode TOTP di dalam test** dengan `otpauth`, mengirimkannya, lalu menegaskan bahwa 2FA aktif dan aplikasi terbuka.

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npx playwright test tests/e2e/totp-enroll.spec.ts`
Expected: FAIL — halaman belum ada.

- [ ] **Step 3: Implementasi halaman dan action**

QR dibuat di server dengan `qrcode` sebagai data URI. Tampilkan juga secret dalam bentuk teks untuk yang tidak bisa memindai. Warna hanya dari token `@theme`.

- [ ] **Step 4: Jalankan seluruh test dan commit**

```bash
npm test && npx playwright test && npx tsc --noEmit && npm run build
git add -A
git commit -m "feat: add TOTP enrolment with QR and confirmation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: Lupa sandi

**Files:**
- Create: `src/app/(auth)/lupa-sandi/page.tsx`, `src/app/(auth)/lupa-sandi/verifikasi/page.tsx`, `src/lib/actions/forgot-password.ts`
- Test: `tests/unit/forgot-password.test.ts`, `tests/e2e/forgot-password.spec.ts`

**Interfaces:**
- Consumes: `generateOtpCode`, `hashOtp`, `verifyOtpHash`, `verifyTotp`, `sendWhatsApp`, `chooseSecondFactor`
- Produces: action `requestReset(prevState, formData)`, action `completeReset(prevState, formData)`

Respons **selalu identik** apakah username ada atau tidak: *"Jika username terdaftar, kode telah dikirim."* Tanpa itu halaman ini menjadi alat memeriksa username mana yang ada.

- [ ] **Step 1: Tulis test yang gagal**

Unit test menegaskan pesan yang sama dikembalikan untuk username yang ada dan yang tidak ada. E2E menegaskan halaman menolak kode salah dan menerima yang benar lewat jalur TOTP.

- [ ] **Step 2: Jalankan — harus gagal**

- [ ] **Step 3: Implementasi**

Buat `AuthChallenge` dengan `purpose: 'PASSWORD_RESET'`, metode mengikuti `chooseSecondFactor`. Setelah kode lolos, tetapkan sandi baru, `mustChangePassword: false`, dan **batalkan seluruh sesi lama** dengan menaikkan sebuah nilai yang ikut ditandatangani sesi — cara paling sederhana pada Auth.js JWT adalah menyimpan `passwordChangedAt` pada pengguna dan menolaknya di callback `session` bila token lebih tua.

- [ ] **Step 4: Jalankan seluruh test dan commit**

```bash
npm test && npx playwright test && npx tsc --noEmit
git add -A
git commit -m "feat: add self-service password reset with a uniform response

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 14: Pemulihan lewat SSH dan pembaruan dokumentasi

**Files:**
- Create: `scripts/auth-recover.ts`
- Modify: `package.json`, `README.md`, `docs/DEPLOYMENT.md`
- Test: `tests/unit/auth-recover.test.ts`

**Interfaces:**
- Consumes: `prisma`, `recordAuthEvent`
- Produces: script npm `auth:recover`

- [ ] **Step 1: Tulis test yang gagal**

Uji fungsi murni yang membangkitkan sandi sementara: panjang minimal 16, mengandung campuran karakter, berbeda tiap panggilan.

- [ ] **Step 2: Jalankan — harus gagal**

- [ ] **Step 3: Implementasi script**

Menerima `--username`, menonaktifkan 2FA (`totpSecret: null`, `totpEnabledAt: null`), menetapkan sandi sementara dengan `mustChangePassword: true`, mencetaknya, dan menulis `recovery.ssh_used`. Menolak bila pengguna tidak ditemukan.

- [ ] **Step 4: Perbarui dokumentasi**

`README.md`: login memakai username; jelaskan `SEED_ADMIN_PASSWORD` dan `ENCRYPTION_KEY`; hapus tabel kredensial yang menyebut sandi.

`docs/DEPLOYMENT.md`: urutan deploy pertama menjadi isi `SEED_ADMIN_PASSWORD` dan `ENCRYPTION_KEY` → `up` → login `admin` → paksa ganti sandi → paksa daftar TOTP. Tambahkan bagian pemulihan `npm run auth:recover`. **Pertahankan bentuk dollar-quoting pada prosedur SQL yang ada** — bentuk itu diperbaiki karena kutip ganda bash merusak hash bcrypt.

- [ ] **Step 5: Jalankan seluruh test dan commit**

```bash
npm test && npx playwright test && npx tsc --noEmit && npm run build && npm run lint
git add -A
git commit -m "feat: add SSH recovery script and update deployment docs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definition of Done — Plan 02

- [ ] Login memakai username; email tidak lagi menjadi identitas masuk
- [ ] Setiap login meminta faktor kedua, kecuali akun tanpa TOTP dan tanpa telepon, yang langsung dipaksa mendaftarkan TOTP
- [ ] TOTP terverifikasi terhadap vektor RFC 6238, dengan toleransi ±1 langkah
- [ ] OTP WhatsApp terkirim lewat gateway; ketiga mode kegagalan menghasilkan pesan Indonesia yang berbeda dan tercatat di `AuthEvent`
- [ ] Lupa sandi berjalan dan menjawab identik untuk username yang ada maupun tidak
- [ ] `npm run auth:recover -- --username=admin` memulihkan akun yang terkunci
- [ ] Tidak ada sandi baku di repositori; seed menolak berjalan tanpa `SEED_ADMIN_PASSWORD`
- [ ] `npm test` hijau · `npx playwright test` hijau · `tsc --noEmit` bersih · `npm run lint` keluar 0 · `npm run build` sukses

---

## Self-Review

**1. Cakupan spec.** §2.1 pengecualian bootstrap → Task 9 (`chooseSecondFactor` mengembalikan `BOOTSTRAP`) dan Task 11 (`nextGate` memaksa pendaftaran). §3.1–3.2 model → Task 3. §3.4 migrasi termasuk normalisasi telepon → Task 3 Step 5. §3.5 normalisasi → Task 1. §4.1 tahap 1 termasuk hash boneka dan pesan seragam → Task 9. §4.2 tahap 2 → Task 10. §4.3 kegagalan WA → Task 9 Step 3 dan Task 6. §4.4 pembatasan laju → Task 7. §5 pendaftaran TOTP → Task 12. §6 lupa sandi → Task 13. §10 pemulihan SSH → Task 14. §13 pengujian → tersebar; vektor RFC di Task 5, gateway tiruan di Task 6, e2e TOTP di Task 12.

**Sengaja tidak dicakup plan ini, dan menjadi Plan 03:** §7 manajemen pengguna, §8 dua penampil log, §9 konfigurasi WA di UI, §11 matriks penegakan peran menyeluruh, §12 halaman baru untuk administrasi. Konfigurasi WA sementara dibaca dari environment (`WA_BASE_URL`, `WA_API_KEY`, `WA_INSTANCE`) sampai Plan 03 memindahkannya ke `AppSetting` — dicatat di sini supaya tidak terlihat seperti kelalaian.

**2. Pemindaian placeholder.** Tidak ada TBD. Task 10–14 memuat lebih sedikit kode utuh dibanding Task 1–9 karena bagian UI-nya mekanis dan pola shell-nya sudah baku dari Plan 01; namun setiap task tetap menyebut berkas persis, antarmuka persis, dan perilaku yang harus diuji. Bila pelaksana merasa kurang, itu sinyal untuk bertanya, bukan menebak.

**3. Konsistensi tipe.** `chooseSecondFactor` (Task 9) mengembalikan `'TOTP' | 'WA_OTP' | 'BOOTSTRAP'`, sementara kolom `AuthChallenge.method` hanya punya `TOTP | WA_OTP` — Task 9 memetakan `BOOTSTRAP` ke `TOTP` dengan `consumedAt` terisi, dan Task 10 mengenali pola itu lewat `otpHash === null`. `evaluateChallenge` (Task 8) mengembalikan `ChallengeState` yang dipakai Task 10. `nextGate` (Task 11) mengembalikan jalur literal yang sama dengan rute yang dibuat Task 11 dan Task 12. `WaConfig`/`WaResult` (Task 6) dipakai Task 9. `normalizePhone` (Task 1) dipakai Task 3 untuk verifikasi dan Plan 03 untuk form.

**Catatan risiko yang saya sadari.** Pemetaan `BOOTSTRAP` ke sebuah challenge yang sudah terkonsumsi adalah bagian paling halus di plan ini: ia menciptakan satu jalur di mana sesi terbit tanpa faktor kedua. Jalur itu hanya terbuka bila pengguna sungguh tidak punya TOTP maupun telepon, dan Task 11 langsung menutupnya dengan pendaftaran paksa. Peninjau Task 10 harus memeriksa secara khusus bahwa syaratnya tidak dapat dipalsukan dari luar — misalnya dengan menghapus `otpHash` lewat jalur lain.
