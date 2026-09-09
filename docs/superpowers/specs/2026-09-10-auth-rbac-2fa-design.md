# PBK — Autentikasi, RBAC, dan 2FA · Desain

**Versi:** 1.0 · 10 September 2026
**Status:** disetujui pengguna, siap diturunkan menjadi implementation plan
**Mengamandemen:** `docs/spec/PBK-spec.md` §2 (peran) dan §5 (peta halaman)
**Membangun di atas:** Plan 01 — Fondasi (selesai, 30 commit, `docs/superpowers/plans/2026-09-08-pbk-01-fondasi.md`)

---

## 1. Ruang lingkup

Dokumen ini merancang penggantian lapisan autentikasi PBK dan penambahan otorisasi berbasis peran yang benar-benar ditegakkan.

**Termasuk:**

- Login dengan **username + sandi** (menggantikan email)
- Faktor kedua **wajib di setiap login** — TOTP (Google Authenticator) sebagai jalur utama, OTP via WhatsApp sebagai cadangan
- Peran **SUPERADMIN** dengan manajemen pengguna dan penetapan peran
- Penegakan peran pada seluruh operasi tulis
- Lupa sandi mandiri
- Dua penampil log: keamanan (SUPERADMIN saja) dan aktivitas bisnis (keempat peran — lihat §8)
- Konfigurasi WA Gateway lewat UI
- Prosedur pemulihan lewat SSH

**Tidak termasuk, dengan alasan:**

- **Halaman laporan baru.** Spec §5 sudah memuat Laporan Keuangan dan Laporan Pembayaran; pengguna mengonfirmasi keduanya cukup. Keduanya dibangun setelah transaksi ada.
- **RBAC dinamis** (peran dan izin buatan pengguna). Ditolak sadar: jabatan di sekolah tidak berubah sesering itu, dan peran tetap mempertahankan pengecekan tipe saat kompilasi tepat di tempat keputusan otorisasi diambil.
- **Perangkat dipercaya / "ingat saya".** Pengguna memilih OTP di setiap login tanpa pengecualian, sehingga tabel perangkat akan jadi kode mati.
- **Pengiriman sandi awal lewat WhatsApp.** Sandi yang tersimpan di riwayat chat adalah sandi yang bocor.

---

## 2. Keputusan yang diambil

Lima pertanyaan dijawab pengguna selama brainstorming. Dicatat di sini karena alasannya menentukan bentuk kodenya.

| Keputusan | Pilihan | Konsekuensi |
|---|---|---|
| Kegagalan kirim faktor kedua | Login diblokir; pemulihan lewat SUPERADMIN | Butuh jalur pemulihan untuk SUPERADMIN itu sendiri |
| Pemulihan SUPERADMIN | Perintah di server via SSH | Akses SSH adalah faktor kedua yang sah dan tidak bisa dieksploitasi dari internet |
| Model peran | Empat peran tetap di kode | `Role` tetap enum Prisma; TypeScript menolak salah ketik |
| Identitas login | Username; email jadi kontak opsional | Migrasi mengubah `email` dari unik+wajib menjadi opsional |
| Frekuensi OTP | Setiap login, tanpa pengecualian | WA Gateway jadi ketergantungan harian — diredam dengan mendorong TOTP |

**Peredam yang lahir dari keputusan terakhir:** TOTP bekerja tanpa jaringan. Desain ini menempatkan TOTP sebagai jalur utama dan WA sebagai jaring pengaman bagi yang belum mendaftar — bukan sebaliknya. **SUPERADMIN wajib mendaftar TOTP**, karena dialah jalur pemulihan dan tidak boleh bergantung pada komponen yang sedang rusak.

### 2.1 Pengecualian bootstrap

Keputusan "OTP di setiap login" berbenturan dengan keadaan awal sistem. Deploy baru hanya berisi akun `admin`: belum ada TOTP, belum ada nomor telepon. Faktor keduanya tidak bisa dikirim ke mana pun, sehingga **login pertama menjadi mustahil** dan pemulihan SSH tidak menolong — ia mereset 2FA yang memang belum ada.

Aturannya:

> Akun yang **tidak punya TOTP terdaftar maupun nomor telepon sah** tidak dapat menerima faktor kedua. Login untuk akun demikian hanya memerlukan sandi, lalu pengguna **langsung dipaksa mendaftarkan TOTP sebelum dapat membuka halaman mana pun**.

Pengecualian ini menutup dirinya sendiri: begitu TOTP terdaftar, syaratnya tidak pernah terpenuhi lagi untuk akun itu. Ia juga tidak dapat disalahgunakan dengan menghapus nomor telepon, karena syaratnya menuntut **keduanya** kosong, dan TOTP hanya bisa dinonaktifkan oleh SUPERADMIN atau lewat SSH — keduanya tercatat di `AuthEvent`.

**Tidak ada sandi baku di repositori.** Seed membaca `SEED_ADMIN_PASSWORD` dari environment; wajib diisi, tanpa nilai default. `DEPLOYMENT.md` menyuruh operator mengisinya dengan `openssl rand`. Ini sekaligus menutup temuan review Plan 01 tentang sandi yang tertulis di README.

Urutan deploy pertama menjadi: isi `SEED_ADMIN_PASSWORD` → `docker compose up` → login `admin` → paksa ganti sandi → paksa daftar TOTP → baru dapat membuat pengguna lain.

---

## 3. Model data

### 3.1 Perubahan `User`

```prisma
enum Role {
  SUPERADMIN
  ADMIN
  BENDAHARA
  KEPALA_SEKOLAH
}

model User {
  id                 String    @id @default(cuid())
  username           String    @unique          // BARU — identitas login
  name               String
  email              String?                    // was @unique + wajib
  nip                String?
  phone              String?                    // ternormalisasi 62xxx; lihat §3.5
  role               Role      @default(BENDAHARA)
  passwordHash       String
  mustChangePassword Boolean   @default(false)  // BARU
  totpSecret         String?                    // BARU — terenkripsi saat disimpan
  totpEnabledAt      DateTime?                  // BARU — null = belum mendaftar
  isActive           Boolean   @default(true)   // BARU
  lastLoginAt        DateTime?                  // BARU
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}
```

**Mengapa `isActive`, bukan penghapusan.** `Payment.createdById`, `Expense.createdById`, dan `AuditLog.userId` menunjuk ke `User`. Menghapus pengguna memutus jejak "siapa mencatat transaksi ini" — tidak boleh terjadi pada sistem keuangan. Ini konsisten dengan kebijakan spec §4.4: batalkan, jangan hapus.

**Mengapa `totpSecret` dienkripsi.** Secret TOTP dalam bentuk polos berarti siapa pun yang memperoleh salinan database bisa membuat kode yang sah selamanya. Enkripsi memakai kunci dari environment (`ENCRYPTION_KEY`), bukan dari kolom lain di database yang sama.

### 3.2 Tabel baru

```prisma
enum ChallengePurpose { LOGIN  PASSWORD_RESET }
enum SecondFactor     { TOTP  WA_OTP }

model AuthChallenge {
  id         String           @id @default(cuid())
  userId     String
  user       User             @relation(fields: [userId], references: [id])
  purpose    ChallengePurpose
  method     SecondFactor
  otpHash    String?          // null bila method = TOTP; kode WA tidak pernah disimpan polos
  expiresAt  DateTime         // dibuat + 5 menit
  attempts   Int              @default(0)
  consumedAt DateTime?        // sekali pakai
  createdAt  DateTime         @default(now())

  @@index([userId, purpose, createdAt])
}

model AuthEvent {
  id        String   @id @default(cuid())
  userId    String?           // null bila username tidak dikenal
  username  String?           // dicatat apa adanya, termasuk untuk percobaan gagal
  event     String            // lihat §3.3
  ip        String?
  userAgent String?
  meta      Json?
  createdAt DateTime @default(now())

  @@index([createdAt])
  @@index([userId, createdAt])
}

model AppSetting {
  key       String   @id      // 'wa.baseUrl' | 'wa.apiKey' | 'wa.instance'
  value     String            // nilai rahasia disimpan terenkripsi
  isSecret  Boolean  @default(false)
  updatedAt DateTime @updatedAt
  updatedBy String?
}
```

`AuthEvent` sengaja **terpisah** dari `AuditLog` bisnis. Ia mencatat percobaan dengan username yang tidak ada — yang tidak punya `userId` untuk direlasikan — dan mencampurnya akan mengotori laporan aktivitas yang dibaca bendahara.

### 3.3 Jenis `AuthEvent`

`login.password_ok` · `login.password_fail` · `login.user_inactive` · `login.otp_ok` · `login.otp_fail` · `login.otp_exhausted` · `login.challenge_expired` · `wa.send_ok` · `wa.send_fail` · `totp.enrolled` · `totp.disabled` · `password.reset_requested` · `password.reset_ok` · `password.changed` · `user.created` · `user.updated` · `user.role_changed` · `user.deactivated` · `recovery.ssh_used`

### 3.4 Migrasi

Database produksi mungkin sudah berisi pengguna. Migrasi harus:

1. Menambah `username` sebagai nullable
2. Mengisi mundur dari bagian lokal email (`anggi.prawita@…` → `anggi.prawita`), menyelesaikan tabrakan dengan sufiks angka
3. Menjadikannya `NOT NULL UNIQUE`
4. Melepas keunikan dan kewajiban `email`
5. Menormalisasi `phone` ke `628xxx` — data seed sekarang `0812-3344-5566` dan **tidak akan bisa dipakai mengirim WhatsApp apa adanya**

Langkah 5 wajib. Tanpa itu, OTP gagal terkirim untuk setiap pengguna lama, dan gejalanya (`422`) terlihat seperti gangguan gateway.

### 3.5 Normalisasi nomor telepon

Pengguna mengetik nomor dalam format Indonesia yang biasa (`081233445566`). Aplikasi yang mengubahnya ke format yang dituntut WA Gateway (`6281233445566`).

**Aturan penyimpanan:** disimpan **ternormalisasi** sebagai `62…`. Satu bentuk kanonik di database membuat pencarian dan pengecekan duplikat dapat diandalkan; kalau disimpan apa adanya, `0812-3344-5566` dan `081233445566` menjadi dua nomor berbeda bagi database padahal orangnya sama.

**Aturan tampilan:** ditampilkan kembali dalam format lokal (`0812-3344-5566`). Pengguna tidak perlu melihat bentuk internal.

**Fungsi murni `normalizePhone(input: string): string | null`** — mengembalikan bentuk `62…` atau `null` bila tidak valid. Karena murni, ia diuji langsung dengan tabel kasus:

| Masukan | Hasil | Alasan |
|---|---|---|
| `081233445566` | `6281233445566` | bentuk baku yang disebut pengguna |
| `0812-3344-5566` | `6281233445566` | pemisah dibuang — ini format data seed sekarang |
| `0812 3344 5566` | `6281233445566` | spasi dibuang |
| `(0812) 3344-5566` | `6281233445566` | tanda kurung dibuang |
| `+6281233445566` | `6281233445566` | `+` dibuang |
| `6281233445566` | `6281233445566` | sudah internasional, dibiarkan |
| `81233445566` | `6281233445566` | `0` di depan hilang, `62` ditambahkan |
| `02112345678` | `null` | nomor tetap, tidak bisa menerima WhatsApp |
| `08123` | `null` | terlalu pendek |
| `0812334455661234` | `null` | terlalu panjang |
| `0812abc45566` | `null` | mengandung huruf |
| `` (kosong) | `null` | telepon opsional; kosong berarti tidak ada jalur WA |

Bentuk yang diterima: `62` diikuti nomor nasional yang diawali `8`, panjang total 11–14 digit.

**Konsekuensi bila `null`:** nomor ditolak di form dengan pesan jelas, bukan disimpan diam-diam. Pengguna tanpa nomor telepon yang sah **tidak bisa memakai jalur WA OTP sama sekali** — bagi mereka, TOTP wajib, dan UI manajemen pengguna harus menampilkannya sebagai peringatan, bukan membiarkan superadmin menemukannya saat orangnya gagal login.

---

## 4. Alur login

### 4.1 Tahap 1 — sandi (di luar Auth.js)

Credentials provider Auth.js menerbitkan sesi begitu `authorize` mengembalikan pengguna; tidak ada cara menahannya di tengah. Karena itu verifikasi sandi berupa Server Action biasa.

1. Terima `username` + `password`
2. **Selalu jalankan bcrypt**, termasuk saat pengguna tidak ditemukan, memakai hash boneka tetap. Tanpa ini, selisih waktu respons membocorkan username mana yang valid.
3. Tolak bila `isActive = false`
4. Tentukan metode: `totpEnabledAt != null` → `TOTP`, selain itu → `WA_OTP`
5. Buat `AuthChallenge` (kedaluwarsa 5 menit); simpan `id`-nya pada cookie `pbk_chal` — `httpOnly`, `sameSite=lax`, `secure` di produksi
6. Bila `WA_OTP`: bangkitkan 6 digit acak kriptografis, simpan **hash**-nya, kirim lewat WA Gateway
7. Arahkan ke `/login/verifikasi`

Setiap kegagalan tahap ini menghasilkan pesan identik: **"Username atau kata sandi salah."**

### 4.2 Tahap 2 — faktor kedua (Auth.js)

Credentials provider bernama `otp` menerima `challengeId` + `code`, memverifikasi, lalu mengembalikan pengguna.

- **TOTP** diverifikasi dengan toleransi ±1 langkah (±30 detik), mengakomodasi jam ponsel yang meleset
- **WA OTP** dibandingkan terhadap `otpHash` memakai perbandingan tahan-waktu
- `attempts` dinaikkan tiap percobaan; **maksimal 5**, lalu challenge dibakar dan pengguna kembali ke `/login`
- Challenge kedaluwarsa atau sudah terpakai ditolak dengan pesan yang sama

Sukses: `consumedAt` diisi, Auth.js menerbitkan sesi, `lastLoginAt` diperbarui, `AuthEvent` ditulis. Bila `mustChangePassword` menyala, pengguna diarahkan ke `/ganti-sandi` sebelum bisa ke mana pun.

**Properti yang dijamin:** sesi tidak pernah ada sebelum kedua faktor lolos. Tidak ada representasi "setengah login".

### 4.3 Saat pengiriman WA gagal

| Kode gateway | Pesan ke pengguna |
|---|---|
| `422` | "Nomor WhatsApp Anda tidak terdaftar. Hubungi administrator." |
| `503` | "Layanan pengiriman kode sedang tidak tersedia. Hubungi administrator." |
| lain / timeout | "Kode gagal dikirim. Hubungi administrator." |

Ketiganya menulis `wa.send_fail` beserta galat aslinya, sehingga superadmin melihat penyebabnya di Log Keamanan alih-alih menebak dari keluhan lisan.

### 4.4 Pembatasan laju

Pada tahap 1, per-username **dan** per-IP. Tanpa ini, endpoint login menjadi tombol untuk membanjiri nomor WhatsApp orang lain dan menghabiskan kuota 100 permintaan/menit gateway. Batas awal: 5 percobaan per username per 15 menit, 20 per IP per 15 menit.

---

## 5. Pendaftaran TOTP

Di `/profil`: server membangkitkan secret, menampilkan QR `otpauth://totp/PBK:<username>?secret=…&issuer=PBK` beserta kode manual untuk yang tidak bisa memindai.

**`totpEnabledAt` hanya diisi setelah pengguna memasukkan satu kode yang benar.** Mengaktifkan 2FA tanpa membuktikan aplikasinya bekerja akan mengunci pengguna pada login berikutnya.

**Pendaftaran dipaksakan sebelum akses**, bukan ditawarkan. Dua golongan pengguna diarahkan ke halaman ini dan tidak dapat ke mana pun sebelum selesai:

1. **SUPERADMIN**, selalu — dialah jalur pemulihan, jadi tidak boleh bergantung pada WA Gateway yang mungkin sedang rusak
2. **Siapa pun yang masuk lewat pengecualian bootstrap §2.1** — tanpa TOTP dan tanpa nomor telepon, akun itu tidak punya faktor kedua sama sekali sampai pendaftaran selesai

Bagi pengguna lain yang punya nomor telepon sah, TOTP dianjurkan tetapi tidak dipaksakan; mereka sudah terlindungi faktor kedua lewat WA. UI mendorongnya dengan menjelaskan bahwa TOTP tetap bekerja saat WhatsApp bermasalah.

---

## 6. Lupa sandi

`/lupa-sandi` menerima username dan **selalu** menjawab: *"Jika username terdaftar, kode telah dikirim."* Tanpa keseragaman ini, halaman tersebut menjadi alat memeriksa username mana yang ada.

Metode mengikuti aturan yang sama dengan login — TOTP bila terdaftar, WA bila tidak. Pemilik TOTP karenanya tidak bergantung pada gateway untuk memulihkan sandinya.

Setelah kode lolos, pengguna menetapkan sandi baru; seluruh sesi lamanya dibatalkan.

Bila keduanya tidak tersedia (ponsel hilang, nomor berganti), jalurnya adalah SUPERADMIN, atau §9 untuk SUPERADMIN itu sendiri.

---

## 7. Manajemen pengguna (SUPERADMIN)

Daftar menampilkan username, nama, peran, status 2FA, aktif, login terakhir.

**Membuat pengguna** menghasilkan sandi sementara yang ditampilkan **sekali di layar**, dengan `mustChangePassword` menyala. Tidak dikirim lewat WhatsApp.

**Tindakan:** ubah data, ubah peran, reset sandi, nonaktifkan 2FA (jalur pemulihan pilihan pengguna), aktif/nonaktifkan.

SUPERADMIN dapat menetapkan peran apa pun, **termasuk SUPERADMIN**, kepada pengguna lain. Membuat SUPERADMIN kedua adalah cara yang disarankan untuk menghindari ketergantungan pada §10 — tetapi tidak dipaksakan, karena memaksa dua akun pada sekolah dengan satu petugas IT biasanya menghasilkan dua akun milik orang yang sama.

**Tiga pagar wajib** — tanpa ini sistem bisa terkunci dari dalam:

1. SUPERADMIN tidak dapat menurunkan peran atau menonaktifkan dirinya sendiri
2. Sistem menolak menyisakan **nol** SUPERADMIN aktif
3. Pengguna tidak dapat dihapus, hanya dinonaktifkan

---

## 8. Penampil log

| Halaman | Akses | Sumber | Isi |
|---|---|---|---|
| `/log/keamanan` | SUPERADMIN saja | `AuthEvent` | Login gagal, OTP gagal, galat gateway, perubahan 2FA dan peran |
| `/log/aktivitas` | SUPERADMIN, ADMIN, BENDAHARA, KEPALA_SEKOLAH | `AuditLog` | Pembatalan, penonaktifan kategori, pengarsipan |

Aksesnya disebut per peran, bukan "BENDAHARA ke atas". Keempat peran itu bukan hierarki lurus — KEPALA_SEKOLAH tidak berada "di atas" BENDAHARA, ia jalur pengawasan hanya-baca — sehingga frasa berjenjang akan ditafsirkan dua cara berbeda oleh penulis kodenya.

Keduanya berfilter (jenis peristiwa, pengguna, rentang tanggal) dan berpaginasi. `AuditLog` akan kosong sampai plan transaksi menulis ke sana — itu diharapkan, bukan cacat.

---

## 9. Integrasi WA Gateway

Kontrak nyata, dibaca dari `e:/programming/WA-Gateway/README.md`:

```http
POST {baseUrl}/send-message
Authorization: Bearer {apiKey}
Content-Type: application/json

{ "message": "...", "id": "628123456789", "from": "wa1" }
```

Respons `202` berarti **antre**, bukan terkirim. Tidak ada konfirmasi pengiriman — desain ini tidak boleh berpura-pura ada.

Galat: `400` permintaan tidak valid · `401` API key salah · `404` instance tidak ada · `422` nomor tidak terdaftar di WhatsApp · `503` tidak ada instance terhubung. Batas laju gateway: 100/menit per IP.

`GET /health` dan `GET /status` tidak butuh autentikasi.

**Konfigurasi di `/pengaturan/whatsapp`** (SUPERADMIN): `baseUrl`, `apiKey`, `instance`. API key **tulis-saja** — UI menampilkan `••••1234`. Disimpan terenkripsi, karena `pg_dump` harian yang dijadwalkan `DEPLOYMENT.md` akan memuat isi tabel ini.

Tombol **"Tes koneksi"** memanggil `/health` dan `/status`. Ini memberi tahu superadmin bahwa pengiriman OTP rusak **sebelum** ada yang gagal login.

---

## 10. Pemulihan lewat SSH

```bash
npm run auth:recover -- --username=<username>
```

Menonaktifkan 2FA, menghapus `totpSecret`, menerbitkan sandi sementara dengan `mustChangePassword`, mencetaknya ke terminal, dan menulis `recovery.ssh_used`.

Hanya bisa dijalankan di server. Didokumentasikan di `DEPLOYMENT.md` bersama prosedur ganti sandi yang sudah ada.

---

## 11. Penegakan otorisasi

`requireUser()` dan `requireRole(...roles)` sudah ada di `src/lib/auth-guard.ts` dari Plan 01, teruji, dan **belum dipakai di mana pun**. Plan ini adalah konsumen pertamanya.

Aturan pemakaian yang wajib: **panggil di baris paling atas setiap Server Action, di luar `try`.** `redirect()` melempar `NEXT_REDIRECT`; `try/catch` yang tidak melemparnya ulang akan menelan pengecekan otorisasi diam-diam dan eksekusi berlanjut.

Matriks peran (mengamandemen spec §2):

| Kemampuan | SUPERADMIN | ADMIN | BENDAHARA | KEPALA_SEKOLAH |
|---|---|---|---|---|
| Kelola pengguna & peran | ✓ | — | — | — |
| Konfigurasi WA Gateway | ✓ | — | — | — |
| Log keamanan | ✓ | — | — | — |
| Master data, arsipkan kegiatan | ✓ | ✓ | — | — |
| Transaksi (tulis, batalkan) | ✓ | ✓ | ✓ | — |
| Log aktivitas, laporan, buku kas | ✓ | ✓ | ✓ | ✓ (baca) |

---

## 12. Halaman baru (mengamandemen spec §5)

`/login/verifikasi` · `/lupa-sandi` · `/lupa-sandi/verifikasi` · `/ganti-sandi` · `/pengguna` · `/pengguna/[id]` · `/log/keamanan` · `/log/aktivitas` · `/pengaturan/whatsapp`

Ditambahkan ke `src/lib/routes.ts` dan `src/lib/nav.ts`. Item nav difilter peran — pengguna tidak melihat tautan yang akan menolaknya.

---

## 13. Pengujian

- **TOTP diverifikasi terhadap vektor uji resmi RFC 6238**, bukan terhadap keluaran implementasi sendiri. Implementasi yang salah dan konsisten akan lolos uji-diri-sendiri.
- Klien WA diuji terhadap gateway tiruan. **Test tidak boleh mengirim WhatsApp sungguhan.**
- Perbandingan OTP tahan-waktu, dengan test yang memastikannya.
- E2E menjalankan login dua tahap penuh lewat jalur TOTP — kodenya dapat dihitung di dalam test, sehingga alurnya benar-benar terverifikasi.
- Test khusus untuk tiap pagar §7: menurunkan peran sendiri ditolak, menyisakan nol SUPERADMIN ditolak.
- Test bahwa `login.password_fail` **tidak** mencatat sandi yang dikirim.

---

## 14. Pertanyaan terbuka

| Pertanyaan | Status |
|---|---|
| Apakah ADMIN boleh melihat Log Keamanan? | **Dijawab:** tidak. Hanya SUPERADMIN. |
| Akun seed | **Dijawab:** hanya satu — `admin`, peran SUPERADMIN. Identitas `anggi.prawita` dihapus; pengguna lain dibuat sendiri lewat UI. |
| Instance WA (`from`) mana yang dipakai? | Terbuka — dikosongkan, gateway memakai instance terhubung pertama |
| Panjang dan masa berlaku OTP | Terbuka — 6 digit, 5 menit |

### 14.1 Akun seed

Satu akun, dibuat oleh seed dan tidak pernah lebih:

| Field | Nilai |
|---|---|
| `username` | `admin` |
| `name` | `Administrator` |
| `role` | `SUPERADMIN` |
| `passwordHash` | dari `SEED_ADMIN_PASSWORD` (wajib, tanpa default) |
| `mustChangePassword` | `true` |
| `phone`, `email`, `nip`, `totpSecret` | kosong |

Identitas `anggi.prawita@sman21sby.sch.id` beserta nama, NIP, dan nomor teleponnya **dihapus dari seed**. Data itu berasal dari prototipe demo dan memuat alamat pada domain sekolah yang nyata beserta angka berformat NIP — tidak layak diterbitkan ke repositori publik, terlebih berpasangan dengan sandi yang terdokumentasi.

Karena `phone` kosong dan TOTP belum ada, akun ini masuk lewat pengecualian bootstrap §2.1 pada login pertamanya, lalu langsung dipaksa mendaftarkan TOTP.

---

## 15. Dampak pada urutan plan

Roadmap spec §9 bergeser satu langkah:

| Semula | Menjadi |
|---|---|
| Plan 02 — Transaksi inti | **Plan 02 — Autentikasi, RBAC, 2FA** (dokumen ini) |
| Plan 03 — Master data & rekap | Plan 03 — Transaksi inti |
| Plan 04 — Laporan & akun | Plan 04 — Master data & rekap |
| — | Plan 05 — Laporan & akun |

Plan transaksi menjadi konsumen pertama `requireRole` pada operasi yang mengubah uang, dan penulis pertama ke `AuditLog`.
