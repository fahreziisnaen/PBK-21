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

Buat dua nilai acak:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"
echo "AUTH_SECRET=$(openssl rand -base64 32)"
```

Salin keduanya ke `.env`, lalu isi `DOMAIN` dengan domain Anda. Kunci berkasnya:

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

Buka `https://pbk.sekolahanda.sch.id`. Masuk dengan akun seed di bawah — lalu
**langsung lanjut ke Langkah 5, sebelum melakukan apa pun yang lain.**

| Email | Sandi | Peran |
|---|---|---|
| admin@pbk.local | pbk-demo-2026 | Admin |

## 5. WAJIB sekarang juga: ganti sandi akun bawaan

**Jangan lewati langkah ini.** Sandi di atas tercetak di README ini dan di
riwayat repositori — siapa pun yang bisa membaca kode sumber tahu sandinya.
Selama akun `admin@pbk.local` masih memakai `pbk-demo-2026`,
siapa pun bisa masuk sebagai Admin di server produksi Anda.

> **Ganti sandinya, JANGAN hapus akunnya.** Naluri yang wajar setelah Anda
> membuat akun sendiri adalah menghapus baris `admin@pbk.local`
> ini. Jangan — service `migrate` menjalankan `prisma db seed` di setiap
> `docker compose up`, dan seed-nya meng-upsert akun ini (`update: {}`, dibuat
> ulang bila hilang). Kalau barisnya dihapus, `git pull && docker compose
> -f docker-compose.prod.yml up -d --build` berikutnya membuatnya lagi
> dengan sandi bawaan `pbk-demo-2026` — diam-diam, tanpa peringatan. Kalau
> barisnya masih ada tapi sandinya sudah diganti (langkah di bawah ini),
> upsert tidak menyentuhnya sama sekali dan sandi baru Anda bertahan.

Fondasi aplikasi ini (rilis saat ini) belum punya halaman ganti-sandi di
dalam aplikasi — menyusul pada pembaruan berikutnya. Sampai saat itu, ganti
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

**b. Terapkan hash itu ke akun seed** (tempelkan hash dari langkah (a)
menggantikan `TEMPEL_HASH_DI_SINI`):

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U pbk -d pbk -c '
UPDATE "User" SET "passwordHash" = $h$TEMPEL_HASH_DI_SINI$h$
WHERE email = $e$admin@pbk.local$e$;
'
```

**Kenapa bentuknya seperti ini:** hash bcrypt selalu mengandung tanda `$`
sebagai bagian dari formatnya sendiri (`$2b$10$…`). Kalau argumen `-c`
ditulis di dalam tanda kutip **ganda** — seperti pada versi panduan ini
sebelumnya — bash men-substitusi tanda `$` itu *sebelum* `psql` sempat
menjalankannya, merusak awalan `$2b$10$` yang dipakai aplikasi untuk
mengenali algoritme dan biaya hash-nya. `psql` tetap mencetak `UPDATE 1`
seolah berhasil, padahal hash yang tersimpan sudah rusak dan akun terkunci
total — tidak bisa masuk dengan sandi lama maupun sandi baru, dan aplikasi
ini belum punya halaman lupa-sandi. Bentuk di atas memakai tanda kutip
**tunggal** di sekeliling seluruh argumen `-c` (supaya bash tidak menyentuh
tanda `$` sama sekali) dan tanda kutip dolar milik PostgreSQL sendiri
(`$h$…$h$`, `$e$…$e$`, bukan tanda kutip tunggal SQL biasa) untuk membatasi
teksnya — supaya tidak perlu mikirin karakter kutip tunggal apa pun di
dalam hash atau email.

Keluar dari sesi yang sedang login, lalu masuk ulang dengan sandi baru untuk
memastikan berhasil. Simpan sandi baru di pengelola kata sandi — jangan
dikirim lewat chat atau email biasa.

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
| Port 80 sudah dipakai | Nginx/Apache bawaan masih jalan: `sudo systemctl disable --now nginx apache2` |
| `docker build` lambat sekali atau kehabisan disk | Pastikan `.dockerignore` ikut ter-clone dari git (bukan berkas lokal yang lupa di-commit) — tanpa itu, Docker mengirim seluruh isi repo termasuk folder pengembangan lokal sebagai build context |
| Build gagal di tahap `builder` dengan galat yang menyebut `DATABASE_URL` (mis. `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL` dari `prisma generate`, atau galat "DATABASE_URL belum diisi" dari `npm run build` saat Next mengumpulkan data halaman) | Ada dua perintah di tahap `builder` yang butuh `DATABASE_URL` saat build, bukan cuma satu: `prisma generate` dan `npm run build`. `Dockerfile` yang di-ship menyediakan placeholder yang di-scope ke `RUN` masing-masing baris (`RUN DATABASE_URL="..." npx prisma generate` dan `RUN DATABASE_URL="..." npm run build`) — keduanya tidak pernah membuka koneksi database sungguhan, jadi nilai placeholder sudah cukup. Kalau Anda tetap melihat salah satu galat ini, `Dockerfile` Anda memang kehilangan salah satu dari dua prefiks itu — bandingkan kedua baris `RUN` tersebut dengan versi terbaru di repo, lalu build ulang |
| Lupa sandi baru setelah Langkah 5 | Ulangi Langkah 5 dari awal dengan sandi baru — tidak ada batas berapa kali boleh diganti |
| Perintah Langkah 5a tidak mencetak apa pun | `npm install` di dalamnya gagal (biasanya jaringan) dan pesannya tersembunyi oleh `>/dev/null 2>&1`. Jalankan ulang tanpa bagian itu untuk melihat error aslinya: `docker run --rm node:24-alpine sh -c 'npm install -g bcryptjs && bcrypt "$1" 10' sh 'sandi-baru-anda'` |
| Ingin mulai dari database kosong | `docker compose -f docker-compose.prod.yml down -v` — **menghapus seluruh data**, backup dulu |

## 8. Catatan keamanan

- Port PostgreSQL tidak pernah dipublikasikan ke internet; hanya bisa dijangkau
  antar-container lewat jaringan internal Docker (`docker-compose.prod.yml`
  tidak mempublikasikan port pada service `db`).
- Aplikasi berjalan sebagai user non-root (`nextjs`) di dalam container.
- Cookie sesi dan cookie kegiatan aktif ditandai `secure` di produksi —
  browser menolak mengirimkannya lewat koneksi non-HTTPS.
- **Ganti sandi akun seed sebelum melakukan apa pun yang lain** — lihat
  Langkah 5. Ini bukan saran, ini kewajiban.
- Simpan `.env` dan backup di tempat yang tidak bisa diakses publik.
