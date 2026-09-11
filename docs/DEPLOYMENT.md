# Deployment — VPS dengan Docker Compose

Panduan memasang PBK di VPS Ubuntu 22.04/24.04 dengan HTTPS otomatis.
Perkiraan waktu: 20 menit.

> **Catatan jujur tentang panduan ini.** Konfigurasi Docker di repo ini
> (`Dockerfile`, `docker-compose.prod.yml`, `Caddyfile`) belum pernah
> dijalankan lewat `docker build` atau `docker compose up` — mesin yang
> dipakai menulis panduan ini tidak punya Docker terpasang. Yang sudah
> diverifikasi: `next.config.ts` benar-benar menghasilkan
> `.next/standalone/server.js` (jadi target `COPY` di `Dockerfile` menunjuk
> berkas yang nyata, bukan tebakan), dan seluruh berkas konfigurasi lolos
> pengujian sintaks/isi otomatis (`tests/unit/deploy-config.test.ts`). Uji
> jalan yang sebenarnya — apakah image benar-benar ter-build dan stack-nya
> benar-benar menyala — baru terjadi pertama kali saat Anda menjalankan
> Langkah 4 di server Anda sendiri. Ikuti bagian **Kalau bermasalah** di
> bawah bila ada langkah yang tidak sesuai harapan, dan laporkan baliknya.

## 0. Yang perlu disiapkan

- VPS Ubuntu, RAM minimal 2 GB, akses SSH
- Nama domain yang **sudah diarahkan** ke IP VPS (A record). HTTPS tidak akan
  terbit sebelum DNS benar-benar mengarah ke server.
- Port 80 dan 443 terbuka di firewall

Buka port 80 dan 443 (lewati kalau Anda sudah punya aturan firewall sendiri):

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Cek DNS sudah benar sebelum lanjut. Ubuntu minimal biasanya tidak punya `dig`
terpasang — pasang dulu, atau pakai `getent` yang sudah ada di mana pun:

```bash
sudo apt install -y dnsutils
dig +short pbk.sekolahanda.sch.id
# harus mengeluarkan IP VPS Anda

# alternatif tanpa memasang apa pun:
getent hosts pbk.sekolahanda.sch.id
```

## 1. Pasang Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version && docker compose version
```

## 2. Ambil kode

```bash
sudo mkdir -p /opt/pbk && sudo chown $USER:$USER /opt/pbk
git clone <URL-REPO-ANDA> /opt/pbk
cd /opt/pbk
```

## 3. Buat berkas rahasia

```bash
cp .env.production.example .env
```

Buat nilai-nilai acak yang dibutuhkan:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"
echo "AUTH_SECRET=$(openssl rand -base64 32)"
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo "SEED_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"
```

Salin keempatnya ke `.env`, lalu isi `DOMAIN` dengan domain Anda.

- **`ENCRYPTION_KEY`** mengenkripsi secret TOTP setiap pengguna
  (`src/lib/crypto.ts`, AES-256-GCM). Harus base64 yang benar-benar
  mendekode ke 32 byte — perintah di atas menjaminnya. Sebuah frasa hasil
  ketikan sendiri yang kebetulan panjangnya 32 karakter **bukan** base64
  yang sah dan ditolak aplikasi saat start. Jangan diganti setelah ada
  pengguna dengan TOTP aktif — mengganti kunci ini membuat seluruh secret
  TOTP yang sudah tersimpan tidak bisa didekripsi lagi, sehingga semua
  pengguna dengan 2FA aktif harus mendaftar ulang.
- **`SEED_ADMIN_PASSWORD`** adalah sandi login pertama untuk akun `admin`.
  `prisma/seed.ts` menolak berjalan (dan container `migrate` ikut gagal)
  tanpanya, sengaja — tidak boleh ada satu pun sandi baku yang pernah
  tersimpan di kode. Catat nilai ini; dipakai sekali di Langkah 4 untuk
  login pertama, lalu aplikasi langsung memaksa penggantiannya. Seed hanya
  memakainya saat baris `admin` **belum ada** (`update: {}` pada upsert) —
  mengubah nilai ini di `.env` setelah deploy pertama tidak berpengaruh
  lagi.

Aplikasi juga membaca **`WA_BASE_URL`**, **`WA_API_KEY`**, dan
**`WA_INSTANCE`** untuk mengirim OTP WhatsApp pada login/lupa-sandi akun
yang punya nomor telepon — lihat `.env.production.example`. Ketiganya
dibaca langsung dari environment untuk saat ini; Plan 03 memindahkannya ke
tabel `AppSetting` supaya bisa diubah lewat UI tanpa deploy ulang. Aplikasi
tidak menolak start tanpanya, tapi tanpa `WA_BASE_URL`/`WA_API_KEY` yang
benar, pengiriman OTP untuk akun berponsel akan gagal setiap saat (tercatat
sebagai `wa.send_fail` di `AuthEvent`, tidak pernah muncul ke pengguna —
lihat Catatan Keamanan). Kosongkan saja kalau belum punya gateway WA; akun
tanpa nomor telepon tetap memakai TOTP sepenuhnya.

Kunci berkasnya:

```bash
chmod 600 .env
```

`.env` **tidak boleh** masuk git — sudah tercantum di `.gitignore`.

## 4. Nyalakan

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Urutan yang terjadi: `db` menyala dan menunggu sehat → `migrate` menerapkan
skema dan mengisi master data lalu berhenti → `app` menyala → `caddy` meminta
sertifikat TLS ke Let's Encrypt.

Pantau prosesnya:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Buka `https://pbk.sekolahanda.sch.id`. **Login memakai username, bukan
email.** Masuk sebagai `admin` (peran **SUPERADMIN**) dengan sandi yang Anda
isi ke `SEED_ADMIN_PASSWORD` di Langkah 3 — tidak ada sandi baku di mana pun
dalam kode maupun repositori ini. **Lanjutkan sampai selesai langkah di
bawah sebelum melakukan apa pun yang lain.**

Urutan yang terjadi otomatis pada login pertama:

1. Aplikasi memaksa ganti sandi (`/ganti-sandi`) — seed selalu membuat akun
   `admin` dengan `mustChangePassword` aktif, apa pun isi
   `SEED_ADMIN_PASSWORD`-nya.
2. Setelah sandi diganti, aplikasi memaksa pendaftaran TOTP (`/keamanan/2fa`,
   aplikasi authenticator seperti Google Authenticator/Aegis). Berlaku
   tanpa syarat untuk SUPERADMIN (`nextGate` di `src/lib/auth-gates.ts`) —
   akun ini adalah jalur pemulihan tertinggi, jadi 2FA-nya tidak boleh
   bergantung pada nomor telepon/WhatsApp.
3. Barulah dashboard terbuka.

**Setelah itu, buat akun pengguna sungguhan untuk kerja sehari-hari — jangan
pakai `admin` di luar keadaan darurat.** Rilis ini belum punya halaman
manajemen pengguna di dalam aplikasi (menyusul di Plan 03); sampai saat itu
ada, baris `User` baru dibuat langsung di database dengan hash bcrypt cost
10 — tekniknya sama dengan Langkah 5a di bawah.

## 5. Reset sandi tanpa lewat aplikasi, dan pemulihan akun terkunci

Bagian ini untuk dua situasi yang jarang tapi nyata: mengubah sandi langsung
dari database ketika aplikasinya sendiri tidak bisa dijalankan, dan
memulihkan akun yang benar-benar terkunci (tidak punya TOTP atau ponsel yang
bisa dipakai).

### 5a. Ubah sandi langsung lewat database

Sejak Plan 02, aplikasi sudah punya halaman ganti-sandi dan lupa-sandi di
dalam produk — pakai itu untuk kasus sehari-hari. Teknik di bawah ini untuk
kalau keduanya tidak bisa dijangkau (mis. aplikasi gagal start, atau Anda
perlu mengubah sandi akun lain tanpa akses ke kredensial lamanya). Ganti
langsung lewat database dengan dua perintah ini:

**a. Buat hash bcrypt dari sandi baru Anda** (dijalankan di container
sekali-pakai terpisah, supaya tidak menyentuh apa pun yang sedang berjalan —
ganti `sandi-baru-anda` di **akhir** baris dengan sandi pilihan Anda, di
antara tanda kutip tunggal):

```bash
docker run --rm node:24-alpine sh -c '
  npm install -g --silent bcryptjs >/dev/null 2>&1 &&
  bcrypt "$1" 10
' sh 'sandi-baru-anda'
```

**Kenapa bentuknya seperti ini, bukan sandi ditulis langsung di dalam skrip
`sh -c "..."`:** sandi bisa mengandung karakter yang berarti khusus buat
shell — tanda dolar (`$`), backtick, titik koma. Kalau sandi ditulis di
dalam tanda kutip **ganda**, bash men-substitusi karakter-karakter itu sebelum
Docker sempat melihatnya, sehingga yang di-hash bukan sandi yang Anda
ketik. Bentuk di atas melewatkan sandi sebagai argumen terpisah (`'sandi-baru-anda'`
di ujung baris, dalam tanda kutip **tunggal**, yang mencegah bash
memprosesnya sama sekali) sehingga sandi apa pun sampai ke `bcrypt` persis
apa adanya — **kecuali** sandi yang mengandung tanda kutip tunggal (`'`)
itu sendiri; kalau sandi pilihan Anda memakainya, pakai sandi sementara
tanpa tanda kutip tunggal untuk langkah ini saja, atau ganti karakter itu.

Perintah ini mencetak satu baris hash yang diawali `$2b$10$…` — salin
seluruhnya, termasuk seluruh tanda `$` di dalamnya.

**b. Terapkan hash itu ke akun tujuan** (tempelkan hash dari langkah (a)
menggantikan `TEMPEL_HASH_DI_SINI`, dan ganti `admin` dengan username akun
yang ingin diubah):

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U pbk -d pbk -c '
UPDATE "User" SET
  "passwordHash" = $h$TEMPEL_HASH_DI_SINI$h$,
  "passwordChangedAt" = now()
WHERE username = $u$admin$u$;
'
```

**Kenapa bentuknya seperti ini:** hash bcrypt selalu mengandung tanda `$`
sebagai bagian dari formatnya sendiri (`$2b$10$…`). Kalau argumen `-c`
ditulis di dalam tanda kutip **ganda** — seperti pada versi panduan ini
sebelumnya — bash men-substitusi tanda `$` itu *sebelum* `psql` sempat
menjalankannya, merusak awalan `$2b$10$` yang dipakai aplikasi untuk
mengenali algoritme dan biaya hash-nya. `psql` tetap mencetak `UPDATE 1`
seolah berhasil, padahal hash yang tersimpan sudah rusak dan akun terkunci
total — tidak bisa masuk dengan sandi lama maupun sandi baru. Bentuk di
atas memakai tanda kutip **tunggal** di sekeliling seluruh argumen `-c`
(supaya bash tidak menyentuh tanda `$` sama sekali) dan tanda kutip dolar
milik PostgreSQL sendiri (`$h$…$h$`, `$u$…$u$`, bukan tanda kutip tunggal
SQL biasa) untuk membatasi teksnya — supaya tidak perlu mikirin karakter
kutip tunggal apa pun di dalam hash atau username. Kolom pencariannya
`username`, bukan lagi `email` — sejak Plan 02, `email` bukan identitas
login dan tidak lagi unik, jadi mencari lewat kolom itu bisa mengenai baris
yang salah atau tidak mengenai apa pun.

`"passwordChangedAt" = now()` disertakan sengaja: itulah yang membuat
aplikasi menganggap kedaluwarsa setiap sesi lama akun ini di perangkat mana
pun (`isSessionStale` di `src/lib/auth-gates.ts`), sama seperti kalau sandi
diganti lewat halaman ganti-sandi di dalam aplikasi. Tanpa baris ini, sandi
di database berubah tapi sesi yang sudah terbit — termasuk milik siapa pun
yang sedang memegang sesi itu tanpa seizin Anda — tetap jalan.

Keluar dari sesi yang sedang login, lalu masuk ulang dengan sandi baru untuk
memastikan berhasil. Simpan sandi baru di pengelola kata sandi — jangan
dikirim lewat chat atau email biasa.

### 5b. Pemulihan akun terkunci lewat SSH (`npm run auth:recover`)

Akun yang **belum atau tidak lagi punya TOTP maupun nomor telepon** tidak
bisa memakai halaman lupa-sandi sama sekali — `canSelfReset`
(`src/lib/auth-gates.ts`) menolaknya dengan sengaja, karena akun seperti itu
tidak bisa membuktikan apa pun selain mengetik username-nya sendiri;
membiarkannya mengatur ulang sandi sendiri berarti siapa pun bisa melakukan
hal yang sama. Akun `admin` persis dalam kondisi ini sebelum TOTP-nya
didaftarkan di Langkah 4 — dan teknik 5a di atas tidak menolong akun seperti
ini juga, karena mengganti sandi saja tidak membuka jalan masuk kalau login
tetap meminta kode dua langkah yang tidak pernah ada.

Satu-satunya jalan untuk akun seperti itu adalah `npm run auth:recover`,
dijalankan lewat SSH oleh seseorang yang sudah punya akses ke server. Skrip
ini:

- menonaktifkan total 2FA akun tersebut (`totpSecret` dan `totpEnabledAt`
  dikosongkan) — pemiliknya mendaftar ulang dari nol setelah masuk;
- menetapkan sandi sementara acak (minimal 16 karakter, dicetak sekali di
  terminal) dan memaksa penggantiannya pada login berikutnya
  (`mustChangePassword`);
- mengakhiri **setiap** sesi akun ini di perangkat mana pun
  (`passwordChangedAt` diperbarui) — sengaja: skrip ini biasanya dijalankan
  justru karena akun diduga sudah diambil alih, bukan cuma lupa sandi;
- mencatat peristiwa `recovery.ssh_used` ke `AuthEvent`.

Container `app` yang berjalan (`runner` stage di `Dockerfile`) tidak bisa
menjalankannya — hanya `.next/standalone` yang di-copy ke sana, tanpa
`scripts/`, `tsx`, atau CLI `prisma`. Jalankan lewat image `builder` yang
sama dengan yang dipakai service `migrate` (image itu sudah berisi seluruh
repo dan hasil `npm ci` lengkap termasuk devDependencies), dengan mengganti
perintah bawaannya:

```bash
cd /opt/pbk
docker compose -f docker-compose.prod.yml run --rm migrate \
  npx tsx scripts/auth-recover.ts --username=admin
```

Ganti `admin` dengan username akun yang terkunci. `run --rm migrate <cmd>`
memakai environment service `migrate` (termasuk `DATABASE_URL`-nya, yang
sudah tersambung dengan benar) tapi mengganti perintah bawaannya
(`prisma migrate deploy && prisma db seed`) dengan skrip pemulihan, lalu
membuang containernya begitu selesai.

**Sandi sementara yang dicetak hanya muncul sekali, di layar ini** — dan
kemungkinan besar ikut tersimpan di riwayat shell dan log sesi SSH server
ini (atau bastion host/session recorder di depannya, kalau ada). Catat
lewat jalur aman, sampaikan ke pemilik akun, lalu pertimbangkan
membersihkan riwayat/scrollback sesi ini kalau relevan.

## 6. Perawatan

**Memperbarui aplikasi**

```bash
cd /opt/pbk
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrasi baru diterapkan otomatis oleh service `migrate` setiap kali naik.

> Jangan menjalankan `npm install prisma`, `npm install @prisma/client`, atau
> `npm install @prisma/adapter-pg` tanpa versi di mana pun — termasuk kalau
> Anda membuka shell di dalam container untuk debugging. Ketiganya dipin ke
> `^7.10.0` di `package.json`; tag `latest` di npm saat ini adalah rilis
> pre-release `8.0.0-rc.13` yang tidak kompatibel.

**Backup database** — jalankan harian lewat cron:

```bash
mkdir -p /opt/pbk/backup
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump --clean --if-exists -U pbk pbk | gzip > /opt/pbk/backup/pbk-$(date +%F).sql.gz
```

`--clean --if-exists` membuat berkas backup ini menghapus dan membuat ulang
setiap tabel sebelum mengisi datanya. Tanpa itu, memulihkan backup ke
database yang sudah berisi skema (kasus yang selalu terjadi pada deployment
yang berjalan normal, karena service `migrate` menerapkan skema setiap kali
naik) akan gagal dengan galat "relation already exists" dan galat
pelanggaran constraint unik untuk setiap baris.

Pasang di crontab (`crontab -e`), jam 2 pagi, simpan 30 hari terakhir:

```
0 2 * * * cd /opt/pbk && docker compose -f docker-compose.prod.yml exec -T db pg_dump --clean --if-exists -U pbk pbk | gzip > backup/pbk-$(date +\%F).sql.gz && find backup -name '*.sql.gz' -mtime +30 -delete
```

**Memulihkan dari backup**

Hentikan dulu service `app` supaya tidak ada yang memakai aplikasi selagi
tabel-tabelnya dihapus dan diisi ulang (`db` tetap menyala — restore
tersambung ke situ):

```bash
cd /opt/pbk
docker compose -f docker-compose.prod.yml stop app

gunzip -c /opt/pbk/backup/pbk-2026-09-08.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U pbk -d pbk

docker compose -f docker-compose.prod.yml start app
```

(Jalur backup di atas sengaja ditulis absolut, `/opt/pbk/backup/...` — saat
memulihkan lewat sesi darurat, bekerja dari direktori yang salah dan tidak
menyadarinya adalah kesalahan paling gampang terjadi. Sesuaikan nama berkas
dengan tanggal backup yang ingin Anda pulihkan.)

**Menghentikan / menyalakan**

```bash
docker compose -f docker-compose.prod.yml stop
docker compose -f docker-compose.prod.yml start
```

## 7. Kalau bermasalah

| Gejala | Penyebab dan penanganan |
|---|---|
| HTTPS gagal terbit | DNS belum mengarah ke VPS. Cek `dig +short <domain>`, tunggu propagasi, lalu `docker compose -f docker-compose.prod.yml restart caddy` |
| `migrate` keluar dengan error | Baca `docker compose -f docker-compose.prod.yml logs migrate`. Umumnya `POSTGRES_PASSWORD` di `.env` tidak cocok dengan yang dipakai volume lama |
| App restart terus | `AUTH_SECRET` kosong. Isi di `.env` lalu `up -d` lagi |
| `app` atau `migrate` gagal dengan galat yang menyebut `ENCRYPTION_KEY belum diisi`, `SEED_ADMIN_PASSWORD belum diisi`, atau OTP WhatsApp tidak pernah terkirim walau `.env` sudah benar | `docker-compose.prod.yml` hanya meneruskan variabel yang disebutkan eksplisit di blok `environment:` tiap service — sekadar mengisi `.env` tidak otomatis menyalurkannya ke container. Pastikan `environment:` service `migrate` menyebut `SEED_ADMIN_PASSWORD`, dan `environment:` service `app` menyebut `ENCRYPTION_KEY` serta `WA_BASE_URL`/`WA_API_KEY`/`WA_INSTANCE` (mengikuti pola `AUTH_SECRET: ${AUTH_SECRET:?wajib diisi di .env}` yang sudah ada) sebelum `up -d --build` lagi |
| Port 80 sudah dipakai | Nginx/Apache bawaan masih jalan: `sudo systemctl disable --now nginx apache2` |
| `docker build` lambat sekali atau kehabisan disk | Pastikan `.dockerignore` ikut ter-clone dari git (bukan berkas lokal yang lupa di-commit) — tanpa itu, Docker mengirim seluruh isi repo termasuk folder pengembangan lokal sebagai build context |
| Build gagal di tahap `builder` dengan galat yang menyebut `DATABASE_URL` (mis. `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL` dari `prisma generate`, atau galat "DATABASE_URL belum diisi" dari `npm run build` saat Next mengumpulkan data halaman) | Ada dua perintah di tahap `builder` yang butuh `DATABASE_URL` saat build, bukan cuma satu: `prisma generate` dan `npm run build`. `Dockerfile` yang di-ship menyediakan placeholder yang di-scope ke `RUN` masing-masing baris (`RUN DATABASE_URL="..." npx prisma generate` dan `RUN DATABASE_URL="..." npm run build`) — keduanya tidak pernah membuka koneksi database sungguhan, jadi nilai placeholder sudah cukup. Kalau Anda tetap melihat salah satu galat ini, `Dockerfile` Anda memang kehilangan salah satu dari dua prefiks itu — bandingkan kedua baris `RUN` tersebut dengan versi terbaru di repo, lalu build ulang |
| Lupa sandi sendiri, tapi 2FA masih aktif | Pakai halaman lupa-sandi di aplikasi (`/lupa-sandi`) — tidak perlu SSH sama sekali |
| Lupa sandi `admin`, dan TOTP-nya belum/tidak lagi bisa dipakai | `npm run auth:recover -- --username=admin` lewat SSH — lihat Langkah 5b. Halaman lupa-sandi sengaja menolak akun tanpa 2FA yang bisa dipakai |
| Salah tempel/rusak lewat teknik manual Langkah 5a | Ulangi Langkah 5a dari awal dengan hash baru — tidak ada batas berapa kali boleh diulang |
| Perintah Langkah 5a tidak mencetak apa pun | `npm install` di dalamnya gagal (biasanya jaringan) dan pesannya tersembunyi oleh `>/dev/null 2>&1`. Jalankan ulang tanpa bagian itu untuk melihat error aslinya: `docker run --rm node:24-alpine sh -c 'npm install -g bcryptjs && bcrypt "$1" 10' sh 'sandi-baru-anda'` |
| Ingin mulai dari database kosong | `docker compose -f docker-compose.prod.yml down -v` — **menghapus seluruh data**, backup dulu |

## 8. Catatan keamanan

- Port PostgreSQL tidak pernah dipublikasikan ke internet; hanya bisa dijangkau
  antar-container lewat jaringan internal Docker (`docker-compose.prod.yml`
  tidak mempublikasikan port pada service `db`).
- Aplikasi berjalan sebagai user non-root (`nextjs`) di dalam container.
- Cookie sesi dan cookie kegiatan aktif ditandai `secure` di produksi —
  browser menolak mengirimkannya lewat koneksi non-HTTPS.
- **Tidak ada satu pun sandi baku di repositori ini.** `admin` hanya bisa
  masuk pertama kali dengan `SEED_ADMIN_PASSWORD` yang Anda pilih sendiri di
  Langkah 3, dan aplikasi langsung memaksa penggantiannya plus pendaftaran
  TOTP pada login pertama (Langkah 4) — tidak ada langkah manual yang perlu
  diingat lagi di sini.
- **Mengganti atau mengatur ulang sandi akun mana pun langsung mengakhiri
  seluruh sesi akun itu, di semua perangkat, termasuk sesi yang sedang
  dipakai untuk melakukannya.** Pengguna diarahkan balik ke `/login` dengan
  pesan penjelasan. Ini sengaja (`isSessionStale` di
  `src/lib/auth-gates.ts`) — sebuah sesi yang dicurigai harus mati bersama
  sandinya, bukan bertahan di perangkat yang paling mungkin sudah dikuasai
  orang lain.
- **Akun tanpa TOTP maupun nomor telepon tidak bisa memakai halaman
  lupa-sandi.** Ini bukan bug — akun seperti itu tidak bisa membuktikan
  kepemilikan lewat apa pun selain mengetik username-nya sendiri, dan
  mengizinkan reset di titik itu berarti siapa pun bisa melakukan hal yang
  sama untuk akun siapa pun. Satu-satunya jalan pulih untuk akun seperti itu
  adalah `npm run auth:recover` lewat SSH (Langkah 5b) — itulah alasan skrip
  ini ada.
- **Pembatasan laju login** dihitung dari tabel `AuthEvent`, bukan memori
  proses, supaya bertahan lewat restart: maksimum 5 sandi gagal per
  username dan 20 per alamat IP, dalam jendela 15 menit berjalan
  (`src/lib/rate-limit.ts`).
- **Tidak ada pembersihan otomatis untuk `AuthEvent` maupun
  `AuthChallenge`.** Setiap percobaan login, setiap kode OTP/TOTP yang
  diminta, dan setiap tantangan yang sudah dipakai maupun kedaluwarsa
  tersimpan permanen di kedua tabel ini — tidak ada job yang menghapusnya.
  Ini sengaja untuk sekarang (jejak audit utuh lebih penting di rilis ini),
  tapi berarti kedua tabel itu bertumbuh tanpa batas seiring pemakaian.
  Sudah teramati puluhan baris `AuthChallenge` yang sudah dikonsumsi
  menumpuk hanya dari pengujian otomatis berulang di satu instalasi
  pengembangan — pantau ukurannya di server produksi, dan pangkas manual
  (mis. hapus baris yang lebih tua dari retensi backup Anda) kalau sudah
  terasa besar.
- Simpan `.env` dan backup di tempat yang tidak bisa diakses publik.
