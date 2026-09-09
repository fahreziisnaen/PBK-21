# PBK — Pencatatan Buku Kas · Spesifikasi Produk

**Versi:** 1.0 · 8 September 2026
**Sumber kebenaran visual & perilaku:** `design/PBK.dc.html` + `design/support.js`
(export Claude Design, project `a6037c20-5e16-49db-bfd5-7ba494ca07c8`)

Prototipe itu **berfungsi penuh** — bukan mockup. Setiap angka, warna, salinan teks, dan aturan bisnis di dokumen ini disalin verbatim dari sana. Kalau spec dan prototipe berbeda, prototipe yang menang; perbaiki spec.

**Satu pengecualian:** kesetiaan pada prototipe tidak menang atas kendala global bahasa. Prototipe tidak konsisten di satu titik — route `/profil` diberi judul Inggris `User Profile` dengan breadcrumb `Akun / Profile`, sementara 17 route lainnya berbahasa Indonesia. Itu kekhilafan hulu, bukan keputusan desain, dan sudah dikoreksi menjadi `Profil Pengguna` / `Akun / Profil`. Kesetiaan pada desain adalah sarana untuk menghasilkan produk yang benar bagi bendahara sekolah yang memakainya, bukan alasan untuk mereproduksi kesalahan.

---

## 1. Ringkasan

PBK adalah sistem administrasi keuangan sekolah untuk mencatat **kontribusi siswa** dan **belanja kegiatan** (outing class, study tour, HUT sekolah, pentas seni), lalu menghasilkan **buku kas**, **kuitansi siap cetak**, dan **laporan** per kegiatan.

Pengguna utama: **Bendahara sekolah**. Konteks pilot: SMAN 21 Surabaya, tahun anggaran 2026.

Konsep sentral: seluruh aplikasi beroperasi dalam **konteks satu Kegiatan aktif** yang dipilih lewat context-switcher di header. Dashboard, tabel, buku kas, dan laporan semuanya ter-scope ke kegiatan tersebut.

---

## 2. Peran & akses

Prototipe hanya punya satu user (Bendahara). Spec ini menaikkannya ke tiga peran karena scope produksi menuntut pemisahan wewenang pada data keuangan.

| Peran | Wewenang |
|---|---|
| `BENDAHARA` | Semua CRUD transaksi, siswa, kegiatan; cetak kuitansi & laporan |
| `ADMIN` | Semua wewenang Bendahara + kelola user, master data, arsipkan kegiatan |
| `KEPALA_SEKOLAH` | Hanya-baca: dashboard, buku kas, laporan. Tidak bisa input/ubah/batalkan |

**Asumsi terbuka (butuh konfirmasi):** pemetaan peran di atas belum dikonfirmasi user. Kalau ternyata cukup satu peran, hapus `KEPALA_SEKOLAH` dan gabungkan `ADMIN` ke `BENDAHARA`.

---

## 3. Model data

Prisma + PostgreSQL. Nominal disimpan sebagai `Int` (rupiah penuh, tanpa desimal) — sesuai prototipe yang tidak pernah memakai pecahan rupiah.

### 3.1 Penyimpangan yang disengaja dari prototipe

Prototipe menyimpan siswa **per kegiatan** (`students` di-generate ulang tiap `activity`). Karena user memilih **input siswa manual**, menduplikasi entri siswa untuk tiap kegiatan akan menyiksa. Karena itu model dinormalisasi:

- `Student` — master siswa sekolah (NIS unik), diinput sekali
- `Participant` — pendaftaran satu siswa pada satu kegiatan, memikul `billing` (tagihan)

Semua perhitungan yang di prototipe membaca `student.tagihan` / `student.dibayar` kini membaca `Participant.billing` dan agregat `Payment`.

### 3.2 Model

```prisma
enum Role              { BENDAHARA ADMIN KEPALA_SEKOLAH }
enum ActivityStatus    { DRAFT AKTIF SELESAI ARSIP }
enum CategoryStatus    { AKTIF NONAKTIF }
enum PaymentMethod     { TUNAI TRANSFER }
enum PaymentStatus     { SAH DIBATALKAN }
enum ExpenseStatus     { AKTIF DIBATALKAN }
enum Grade             { X XI XII }
enum NotifKind         { OK WARN INFO }

model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  nip          String?
  phone        String?
  role         Role     @default(BENDAHARA)
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model School {                       // satu baris; identitas untuk kop & kuitansi
  id         String   @id @default("default")
  name       String   @default("SMAN 21 Surabaya")
  address    String?
  npsn       String?
  logoPath   String?
  fiscalYear Int      @default(2026)
  updatedAt  DateTime @updatedAt
}

model ActivityCategory {             // KATEGORI — mis. Outclass, Study Tour
  id          String         @id @default(cuid())
  code        String         @unique   // 'OUT', 'ST', 'KGT', 'LMB'
  name        String
  description String?
  status      CategoryStatus @default(AKTIF)
  activities  Activity[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

model ExpenseCategory {              // EXPCAT — mis. Transportasi, Konsumsi
  id          String         @id @default(cuid())
  code        String         @unique   // 'TRP', 'KNS', 'TKT', ...
  name        String
  description String?
  status      CategoryStatus @default(AKTIF)
  expenses    Expense[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

model Activity {
  id                String           @id @default(cuid())
  name              String
  categoryId        String
  category          ActivityCategory @relation(fields: [categoryId], references: [id])
  year              Int
  startDate         DateTime         @db.Date
  endDate           DateTime         @db.Date
  location          String
  description       String?
  contribution      Int                        // tagihan per siswa, rupiah
  participantTarget Int              @default(0)
  chairperson       String?
  status            ActivityStatus   @default(DRAFT)
  receiptPrefix     String                     // 'OC-X' -> kuitansi 'OC-X/0001'
  participants      Participant[]
  payments          Payment[]
  expenses          Expense[]
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
}

model Student {
  id             String        @id @default(cuid())
  nis            String        @unique
  name           String
  grade          Grade
  className      String?                       // opsional, mis. 'X-3'
  phone          String?
  participations Participant[]
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
}

model Participant {
  id         String    @id @default(cuid())
  activityId String
  activity   Activity  @relation(fields: [activityId], references: [id], onDelete: Cascade)
  studentId  String
  student    Student   @relation(fields: [studentId], references: [id])
  billing    Int                           // default: activity.contribution
  payments   Payment[]
  createdAt  DateTime  @default(now())

  @@unique([activityId, studentId])
}

model Payment {
  id            String        @id @default(cuid())
  activityId    String
  activity      Activity      @relation(fields: [activityId], references: [id])
  participantId String
  participant   Participant   @relation(fields: [participantId], references: [id])
  seq           Int                        // urut per kegiatan, dasar nomor kuitansi
  receiptNo     String                     // 'OC-X/0001'
  amount        Int
  method        PaymentMethod
  date          DateTime      @db.Date
  status        PaymentStatus @default(SAH)
  note          String?
  createdById   String
  createdAt     DateTime      @default(now())
  cancelledById String?
  cancelledAt   DateTime?
  cancelReason  String?

  @@unique([activityId, receiptNo])
  @@index([activityId, date])
}

model Expense {
  id          String          @id @default(cuid())
  activityId  String
  activity    Activity        @relation(fields: [activityId], references: [id])
  categoryId  String
  category    ExpenseCategory @relation(fields: [categoryId], references: [id])
  seq         Int
  refNo       String                       // 'BKK/OC-X/001'
  date        DateTime        @db.Date
  description String
  amount      Int
  method      PaymentMethod
  status      ExpenseStatus   @default(AKTIF)
  note        String?
  createdById String
  createdAt   DateTime        @default(now())

  @@unique([activityId, refNo])
  @@index([activityId, date])
}

model Notification {
  id        String    @id @default(cuid())
  userId    String
  title     String
  body      String
  kind      NotifKind @default(INFO)
  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId, createdAt])
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  action    String                          // 'payment.cancel', 'activity.archive', ...
  entity    String
  entityId  String
  meta      Json?
  createdAt DateTime @default(now())

  @@index([entity, entityId])
}
```

---

## 4. Aturan bisnis

Disalin dari `PBK.dc.html` (getter `fin`, `actFin`, `ledger`, `gen`).

### 4.1 Agregat keuangan per kegiatan

```
income      = Σ payment.amount  WHERE status = SAH
expense     = Σ expense.amount  WHERE status = AKTIF
balance     = income - expense
billing     = Σ participant.billing
outstanding = billing - income
target      = activity.contribution × activity.participantTarget
```

### 4.2 Status pelunasan siswa

Untuk tiap `Participant`, dengan `paid = Σ payment.amount WHERE status = SAH`:

```
sisa = billing - paid
paid == 0    -> "Belum Bayar"
sisa <= 0    -> "Lunas"
selain itu   -> "Belum Lunas"
```

### 4.3 Buku Kas (ledger)

Gabungan `Payment(SAH)` sebagai kolom **masuk** dan `Expense(AKTIF)` sebagai kolom **keluar**, diurutkan `date` menaik lalu `seq` menaik (pembayaran memakai `seq`, pengeluaran memakai `1000 + seq` sehingga pengeluaran selalu di bawah pembayaran pada tanggal yang sama). Saldo berjalan diakumulasi baris demi baris.

### 4.4 Pembatalan — tidak pernah menghapus

Membatalkan pembayaran/pengeluaran **hanya** mengubah status. Baris tetap tampil di riwayat dan jejak audit, tapi keluar dari seluruh agregat dan dari buku kas. Salinan teks konfirmasi (verbatim dari prototipe):

> - Transaksi tetap tersimpan dalam riwayat dan jejak audit — tidak ada catatan keuangan yang dihapus.
> - Nominal tidak lagi dihitung dalam total pemasukan, saldo kas, maupun status pelunasan siswa.
> - Kuitansi yang sudah dicetak menjadi tidak berlaku dan ditandai "Dibatalkan".

Hal sama berlaku untuk **nonaktifkan kategori** (bukan hapus) dan **arsipkan kegiatan** (jadi hanya-baca, transaksi baru ditolak, laporan tetap bisa dicetak).

### 4.5 Penomoran

- Kuitansi: `{activity.receiptPrefix}/{seq dipad 4}` → `OC-X/0088`
- Pengeluaran: `BKK/{activity.receiptPrefix}/{seq dipad 3}` → `BKK/OC-X/007`
- `seq` dialokasikan per kegiatan, **monoton dan tidak pernah dipakai ulang** — termasuk oleh transaksi yang dibatalkan. Alokasi harus dalam transaksi DB.

### 4.6 Format Indonesia

- Rupiah: `Rp250.000` (`Intl.NumberFormat('id-ID')`, tanpa desimal)
- Ringkas: `≥1 jt` → `Rp7,0 jt` (1 desimal, koma; 0 desimal bila ≥10 jt); `≥1 rb` → `Rp250 rb`
- Tanggal pendek: `19 Sep 2026` · panjang: `19 September 2026`
- Bulan: `Jan Feb Mar Apr Mei Jun Jul Agu Sep Okt Nov Des`
- **`terbilang(n)`** — angka → kata untuk kuitansi, mis. `250000` → `"Dua ratus lima puluh ribu rupiah"`. Algoritma lengkap ada di `PBK.dc.html` (kaidah `sebelas`, `se-puluh`, `seratus`, `seribu`). **Port persis, jangan tulis ulang.**

---

## 5. Peta halaman (18 route)

Judul, subjudul, dan breadcrumb disalin verbatim dari `ROUTES` di `PBK.dc.html`.

| Grup nav | Route | Judul | Subjudul |
|---|---|---|---|
| DASHBOARD | `/dashboard` | Dashboard | Ringkasan keuangan kegiatan terpilih |
| KEUANGAN | `/pembayaran` | Pembayaran | Seluruh transaksi penerimaan kontribusi siswa |
| | `/pembayaran/[id]` | Detail Pembayaran | Rincian satu transaksi pembayaran |
| | `/pengeluaran` | Pengeluaran | Belanja kegiatan menurut kategori master |
| | `/buku-kas` | Buku Kas | Mutasi kas kronologis kegiatan aktif |
| DATA | `/siswa` | Data Siswa | Peserta dan tagihan pada kegiatan aktif |
| | `/siswa/[id]` | Detail Siswa | Riwayat tagihan dan pembayaran |
| | `/rekap` | Rekap Pembayaran | Rekapitulasi per tingkat dan status |
| MASTER DATA | `/master/kategori-kegiatan` | Kategori Kegiatan | Master kategori untuk pengelompokan kegiatan |
| | `/master/kategori-pengeluaran` | Kategori Pengeluaran | Master kategori belanja kegiatan |
| | `/master/kegiatan` | Kegiatan | Seluruh kegiatan sekolah yang dikelola PBK |
| LAPORAN | `/laporan/keuangan` | Laporan Keuangan | Laporan pemasukan, pengeluaran, dan saldo |
| | `/laporan/pembayaran` | Laporan Pembayaran | Laporan tagihan dan pelunasan siswa |
| ADMINISTRASI | `/kuitansi` | Kuitansi | Pratinjau kuitansi siap cetak |
| | `/pengaturan` | Pengaturan Kegiatan | Konfigurasi kegiatan dan format kuitansi |
| AKUN | `/profil` | Profil Pengguna | Akun dan preferensi pengguna |
| | `/notifikasi` | Pusat Notifikasi | Semua peristiwa keuangan dan kegiatan |
| SISTEM | `/states` | Status & Komponen | Empty state, error state, dan dialog konfirmasi |

Plus `/login` (di luar shell).

### Shell aplikasi (dipakai semua route kecuali login)

- **Sidebar** 242px, `#0f1b33`, sticky, 7 grup berlabel; item aktif: bg `#1857b8`, teks putih, bold 700; item non-aktif: teks `#b6c6e2`, dot `#40567f`
- **Header**: context-switcher kegiatan, pencarian global, lonceng notifikasi, menu user
- **Page head**: breadcrumb + judul + subjudul + tombol aksi kontekstual
- **Overlay**: modal (bayar, keluar, siswa, kegiatan, bukti), dialog konfirmasi destruktif, toast

Berpindah kegiatan me-reset paginasi, filter, dan seleksi; kalau sedang di halaman detail, lempar balik ke `/dashboard`.

---

## 6. Design tokens

Palet Untitled UI. Diekstrak dari frekuensi penggunaan di prototipe.

```css
--brand-700: #12428c;  /* hover */
--brand-600: #1857b8;  /* primary */
--brand-100: #eaf0fb;  /* soft fill */
--brand-50:  #f5f8ff;  /* tint */

--sidebar:       #0f1b33;
--sidebar-fg:    #b6c6e2;
--sidebar-dot:   #40567f;
--sidebar-muted: #8fa4cc;

--gray-900: #101828;  --gray-700: #344054;  --gray-600: #475467;
--gray-500: #667085;  --gray-400: #98a2b3;  --gray-300: #d0d5dd;
--gray-200: #e4e7ec;  --gray-100: #f2f4f7;  --gray-50:  #f9fafb;
--body-bg:  #f7f8fa;

--success-700: #067647;  --success-500: #12b76a;  --success-50: #ecfdf3;
--error-700:   #912018;  --error-600:   #b42318;  --error-500:  #f04438;
--error-200:   #fecdca;  --error-100:   #fda29b;  --error-50:   #fef3f2;
--warn-700:    #b54708;  --warn-500:    #f0b429;  --warn-200:   #fedf89;
--warn-50:     #fffaeb;
```

**Tipografi:** `Plus Jakarta Sans` (400/500/600/700/800) untuk UI; `IBM Plex Mono` (400/500/600) untuk **semua nominal, kode, dan nomor referensi** — kolom angka rata kanan, `white-space: nowrap`.

**Warna badge status** (`statusChipColor`): Lunas/Aktif/Sah → hijau · Belum Lunas/Draft → kuning · Belum Bayar/Dibatalkan/Nonaktif → merah · Arsip/Selesai → abu.

**Bentuk:** radius 8px (input, tombol), 9px (kartu brand), tinggi kontrol 42–44px, fokus `box-shadow: 0 0 0 3px rgba(24,87,184,.14)`.

**Animasi:** `@keyframes pbkin` — `opacity 0→1` + `translateY(6px)→0`.

---

## 7. Non-fungsional

- **Responsif:** breakpoint tunggal `max-width: 900px` — sidebar jadi statis full-width, grid dua kolom jadi satu kolom, tabel `min-width: 640px` + scroll horizontal.
- **Cetak:** `@media print` — background putih, elemen `data-noprint` (sidebar, header, tombol aksi) disembunyikan. Wajib untuk Kuitansi, Buku Kas, dan kedua Laporan.
- **Lokal:** seluruh UI berbahasa Indonesia. Locale `id-ID`. Zona waktu `Asia/Jakarta`.
- **Uang:** integer rupiah. Tidak ada float pada nominal, di mana pun.
- **Audit:** setiap pembatalan, penonaktifan, dan pengarsipan menulis `AuditLog`.

---

## 8. Pertanyaan terbuka

Belum dikonfirmasi user; setiap plan memakai default di kolom kanan sampai dijawab.

| Pertanyaan | Default sementara |
|---|---|
| Logo sekolah — pakai `e:\programming\cropped-sman21surabaya.png`? | Placeholder kotak "PBK" seperti prototipe |
| Ukuran kertas kuitansi & laporan | A4 potret; kuitansi 2 per halaman |
| Kop surat + tanda tangan (bendahara/kepsek) di cetakan | Kop nama sekolah + 1 blok tanda tangan bendahara |
| Format nomor kuitansi resmi sekolah | Ikut prototipe: `OC-X/0088` |
| Tiga peran, atau cukup satu? | Tiga peran seperti §2 |
| Multi tahun anggaran? | Ya — `Activity.year` + filter, `School.fiscalYear` |

---

## 9. Roadmap plan

Spec ini mencakup beberapa subsistem independen, jadi dipecah menjadi empat plan berurutan. Tiap plan menghasilkan software yang jalan dan bisa diuji sendiri.

| Plan | Cakupan | Hasil akhir |
|---|---|---|
| **01 — Fondasi** | Scaffold, Prisma+Postgres, auth, login, shell, context-switcher, primitif toast/dialog | Bisa login, navigasi 18 route, ganti kegiatan aktif |
| **02 — Transaksi inti** | Siswa & peserta, Pembayaran, Pengeluaran, Buku Kas, Kuitansi cetak | Bendahara bisa menjalankan satu kegiatan penuh |
| **03 — Master data & rekap** | Kategori kegiatan, kategori pengeluaran, kegiatan, rekap, dashboard KPI+grafik | Setup mandiri tanpa seed |
| **04 — Laporan & akun** | Laporan keuangan, laporan pembayaran, pengaturan, profil, notifikasi, states | Fitur lengkap sesuai prototipe |
