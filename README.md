# PBK — Pencatatan Buku Kas

Sistem administrasi keuangan sekolah: mencatat kontribusi siswa dan belanja
kegiatan, lalu menghasilkan buku kas, kuitansi siap cetak, dan laporan.

## Dokumentasi

- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — pasang di VPS dengan Docker Compose
- **[docs/spec/PBK-spec.md](docs/spec/PBK-spec.md)** — spesifikasi produk: model data, aturan bisnis, peta halaman
- `design/PBK.dc.html` — prototipe desain asal (buka di browser, butuh internet)

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Prisma 7 · PostgreSQL 16 · Auth.js v5

## Menjalankan secara lokal

Butuh **Node.js 20.19 atau lebih baru** dan PostgreSQL 16.

### 1. Nyalakan PostgreSQL

Pilih salah satu — keduanya berjalan di `localhost:5433`, sesuai `.env.example`:

**A. Tanpa Docker**, memakai binari PostgreSQL portabel yang sudah ada di repo:

```bash
scripts/db.sh setup   # sekali saja: initdb cluster baru ke .pgdata/
scripts/db.sh start
.postgres/pgsql/bin/createdb.exe -U pbk -h 127.0.0.1 -p 5433 pbk   # sekali saja: buat database "pbk"
```

**B. Dengan Docker Compose**, kalau mesin Anda punya Docker:

```bash
docker compose up -d
```

(`docker-compose.yml` di root adalah untuk pengembangan lokal. File produksi
terpisah, `docker-compose.prod.yml`, dipakai saat deploy — lihat
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).)

### 2. Pasang dan jalankan aplikasi

```bash
npm install
cp .env.example .env                          # sesuaikan DATABASE_URL bila perlu
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env
```

Lalu isi **`SEED_ADMIN_PASSWORD`** di `.env` dengan sandi pilihan Anda untuk
login pertama — `prisma/seed.ts` menolak berjalan tanpanya, sengaja, supaya
tidak ada satu pun sandi baku yang pernah tersimpan di kode. `ENCRYPTION_KEY`
yang dibuat di atas dipakai mengenkripsi secret TOTP setiap pengguna; harus
base64 yang benar-benar mendekode ke 32 byte — `openssl rand -base64 32`
menjaminnya, sedangkan frasa hasil ketikan sendiri yang kebetulan 32 karakter
**bukan** base64 yang sah dan akan ditolak aplikasi.

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Buka http://localhost:3000. **Login memakai username, bukan email.** Masuk
sebagai `admin` (peran **SUPERADMIN**) dengan sandi yang Anda isi ke
`SEED_ADMIN_PASSWORD` di atas — tidak ada sandi baku di repositori ini.
Login pertama langsung memaksa ganti sandi, lalu memaksa pendaftaran TOTP
(aplikasi authenticator) sebelum dashboard terbuka; akun `admin` adalah
jalur pemulihan tertinggi sehingga 2FA-nya wajib TOTP, tidak boleh
bergantung pada nomor telepon.

Sebelum TOTP terdaftar, akun ini tidak punya faktor kedua sama sekali —
halaman lupa-sandi menolaknya dengan sengaja (`canSelfReset` di
`src/lib/auth-gates.ts`), supaya tidak ada jalan mengatur ulang sandi `admin`
hanya dengan mengetik usernamenya. Satu-satunya jalan masuk saat itu, atau
kapan pun akses ke authenticator hilang setelahnya, adalah
`npm run auth:recover -- --username=admin` lewat SSH ke server. Lihat
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) untuk detailnya.

> **Prisma dipin ke `^7.10.0` di `package.json`.** Jangan pernah menjalankan
> `npm install prisma`, `npm install @prisma/client`, atau
> `npm install @prisma/adapter-pg` tanpa menuliskan versinya — tag `latest` di
> registry npm saat ini mengarah ke `8.0.0-rc.13` (rilis pre-release), dan
> instalasi tanpa pin akan diam-diam memutus pasangan CLI/client yang sudah
> cocok. Kalau perlu memasang ulang, gunakan versi yang tertulis di
> `package.json`.
>
> URL koneksi database diatur di **`prisma.config.ts`**, bukan di
> `schema.prisma`. `PrismaClient` (lihat `src/lib/prisma.ts`) dibuat memakai
> driver adapter `PrismaPg` dari `@prisma/adapter-pg` — kode baru yang
> membutuhkan instance Prisma sendiri harus mengikuti pola yang sama.

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi (`.next/standalone`) |
| `npm run start` | Jalankan build produksi secara lokal |
| `npm test` | Unit test (Vitest) |
| `npm run test:e2e` | End-to-end test (Playwright) |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Terapkan migrasi (dev) |
| `npm run db:seed` | Isi master data |
| `npm run db:studio` | Prisma Studio |
| `npm run auth:recover -- --username=<u>` | Pemulihan akun terkunci lewat SSH (nonaktifkan 2FA, terbitkan sandi sementara) |
| `scripts/db.sh {setup\|start\|stop}` | Kelola PostgreSQL portabel (tanpa Docker) |

## Deploy produksi

Lihat **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — tutorial lengkap memasang
di VPS Ubuntu dengan Docker Compose dan HTTPS otomatis.
