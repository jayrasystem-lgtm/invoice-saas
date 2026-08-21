# Invoice SaaS — Aplikasi Invoice & Inventaris Multi-Klien

Ini adalah versi **server sungguhan** dari aplikasi Invoice & Inventaris, dibangun supaya Anda bisa:

- Menjual akses ke banyak klien sekaligus, masing-masing dengan **license key** unik.
- Mengendalikan akses tiap klien dari satu **panel admin** — aktifkan, nonaktifkan (kalau telat bayar), atau atur tanggal jatuh tempo otomatis.
- Data tiap klien tersimpan terpisah di server (bukan lagi di penyimpanan Claude), dan otomatis sinkron antar perangkat milik klien yang sama.

Berbeda dari versi artifact sebelumnya: ini **file yang benar-benar Anda hosting sendiri**, jadi bisa dipakai klien tanpa perlu akun Claude.

Database yang dipakai sengaja berupa **file JSON biasa** (bukan SQL/MongoDB), supaya `npm install` dijamin berhasil di hosting gratis mana pun tanpa risiko gagal kompilasi.

---

## 1. Struktur Proyek

```
invoice-saas/
├── server/
│   ├── index.js       ← server utama (API + penguncian akses)
│   ├── db.js           ← lapisan penyimpanan (file JSON di folder data/)
│   ├── ids.js           ← generator ID & license key
│   └── public/
│       ├── app.html    ← aplikasi yang dipakai KLIEN
│       └── admin.html  ← panel yang Anda pakai untuk kelola klien
├── package.json
├── .env.example
└── README.md            ← file ini
```

Saat server jalan, folder `data/` otomatis terbuat berisi:
```
data/
├── tenants.json               ← daftar semua klien & status langganannya
└── tenant-data/
    ├── t_xxxxx.json           ← data invoice/kontak/produk klien A
    └── t_yyyyy.json           ← data invoice/kontak/produk klien B
```

## 2. Menjalankan di Komputer Sendiri (untuk dicoba dulu)

Butuh **Node.js versi 18 ke atas**. Cek dengan `node -v`.

```bash
cd invoice-saas
npm install
cp .env.example .env
# buka .env, ganti ADMIN_PASSWORD dengan password Anda sendiri
npm start
```

Buka `http://localhost:3000` → itu tampilan yang akan dilihat klien.
Buka `http://localhost:3000/admin` → itu panel kelola klien, khusus Anda.

## 3. Cara Kerja Sistem Lisensi (inti dari "kunci akses")

1. Anda buat klien baru lewat `/admin` → sistem otomatis membuatkan **license key** unik (format `XXXX-XXXX-XXXX`).
2. Anda kirim license key itu ke klien (lewat WhatsApp, email, dll).
3. Klien buka aplikasi → diminta masukkan license key sekali → tersimpan di browser mereka.
4. Setiap ± 6 detik aplikasi klien memeriksa ulang statusnya ke server.
5. **Begitu Anda klik "Nonaktifkan" di panel admin, aplikasi klien akan otomatis terkunci** dalam hitungan detik — walau sedang mereka buka sekalipun. Mereka akan melihat layar "Akses Tidak Aktif".
6. Klik "Aktifkan" lagi → klien langsung bisa lanjut memakai aplikasi, data mereka tidak hilang.

Anda juga bisa mengisi tanggal **"Berlaku Sampai"** saat membuat/mengedit klien — kalau diisi, sistem otomatis mengunci begitu tanggalnya lewat, tanpa Anda perlu klik apa pun. Kosongkan kalau Anda mau kontrol manual saja.

> Catatan jujur soal keamanan: sistem ini cukup untuk mengelola langganan bisnis kecil-menengah (klien awam, bukan pihak yang berusaha keras membobol sistem). License key disimpan di `localStorage` browser klien — cukup aman untuk kasus penggunaan normal, tapi bukan tingkat keamanan bank. Untuk kebanyakan kasus jual-beli akses SaaS ke UMKM, ini sudah memadai.

## 4. Deploy ke Hosting (supaya klien bisa akses dari mana saja)

Ada beberapa pilihan, dari gratis sampai murah. Saya urutkan dari yang paling saya rekomendasikan:

### Opsi A — Railway.app (gratis untuk mulai, mudah)

1. Buat akun di [railway.app](https://railway.app), hubungkan ke akun GitHub Anda.
2. Upload folder `invoice-saas` ini ke sebuah repository GitHub baru.
3. Di Railway: **New Project → Deploy from GitHub repo** → pilih repo tadi.
4. Di tab **Variables**, tambahkan:
   - `ADMIN_PASSWORD` = password admin Anda
5. Railway otomatis mendeteksi `npm start` dan menjalankan servernya.
6. **Penting — Persistensi Data**: tambahkan **Volume** di Railway (Settings → Volumes), mount ke `/app/data`, lalu set variable `DATA_DIR=/app/data`. Ini supaya data tidak hilang setiap kali Railway redeploy aplikasi Anda.
7. Railway akan memberi Anda URL publik (misalnya `namaanda.up.railway.app`) — itu yang dibagikan ke klien.

Railway punya masa gratis terbatas (biasanya berbasis kredit bulanan), setelah itu berbayar mulai sangat murah (~$5/bulan) — sepadan dengan pendapatan Rp150rb/klien/bulan.

### Opsi B — Render.com (gratis dengan catatan)

1. Buat akun di [render.com](https://render.com), hubungkan ke GitHub (upload folder ini ke repo dulu, sama seperti Opsi A).
2. **New → Web Service** → pilih repo Anda.
3. Build Command: `npm install` — Start Command: `npm start`.
4. Tambahkan Environment Variable `ADMIN_PASSWORD`.
5. **Penting**: paket gratis Render memakai disk yang **tidak permanen** — data bisa hilang saat server di-redeploy. Untuk produksi (klien bayar sungguhan), tambahkan **Persistent Disk** (mulai ~$1/bulan) di pengaturan service, mount ke `/data`, lalu set `DATA_DIR=/data`.
6. Paket gratis Render juga "tidur" setelah 15 menit tanpa akses, jadi permintaan pertama klien akan terasa lambat (~30 detik). Kalau ini mengganggu, upgrade ke paket berbayar termurah (~$7/bulan).

### Opsi C — VPS murah (paling stabil untuk jangka panjang)

Kalau sudah punya beberapa klien berbayar, VPS kecil (DigitalOcean, Vultr, Contabo — mulai ~$5/bulan) lebih stabil: tidak pernah "tidur", disk permanen bawaan, dan Anda pegang kendali penuh. Butuh sedikit familiar dengan perintah Linux dasar (install Node.js, `pm2 start server/index.js` supaya server tetap jalan, atur reverse proxy Nginx + domain).

**Saran realistis:** mulai dari Railway/Render dulu untuk 1-3 klien pertama sambil validasi model bisnisnya, baru pindah ke VPS begitu jumlah klien bertambah dan butuh keandalan lebih.

## 5. Mengelola Klien Sehari-hari

- **Klien baru langganan** → buka `/admin` → isi nama → klik Tambah → salin license key → kirim ke klien.
- **Klien telat bayar** → buka `/admin` → klik "Nonaktifkan" di baris klien itu. Selesai, akses terkunci otomatis.
- **Klien sudah bayar lagi** → klik "Aktifkan". Data mereka utuh, tidak hilang.
- **Klien lupa/curiga key-nya bocor** → klik "Ganti Key" → key lama otomatis tidak berfungsi lagi, kirimkan key baru ke klien.
- **Klien berhenti berlangganan permanen** → klik "Hapus" (data mereka akan terhapus permanen, tidak bisa dibatalkan).

## 6. Backup Data

Karena data berupa file JSON biasa, backup semudah menyalin folder `data/` — tidak perlu `pg_dump` atau tool database khusus. Disarankan cadangkan folder ini secara berkala (terutama sebelum melakukan redeploy) dengan cara apa pun yang nyaman buat Anda: unduh manual, sinkron ke Google Drive, atau `cp -r data/ backup-$(date +%Y%m%d)/`.

## 7. Keterbatasan yang Perlu Anda Tahu

- Ini sistem lisensi sederhana (key-based), bukan sistem pembayaran otomatis — Anda tetap perlu menerima transfer manual dari klien lalu mengubah status di panel admin. Kalau nanti mau otomatis (klien bayar → otomatis aktif), itu perlu integrasi payment gateway (Midtrans/Xendit) sebagai pengembangan lanjutan.
- Belum ada sistem "banyak pengguna per klien" (misal kasir vs owner dengan hak berbeda) — semua yang pegang satu license key punya akses penuh yang sama.
- Penyimpanan file JSON ini cocok untuk skala puluhan-ratusan klien UMKM. Kalau suatu saat sudah punya ribuan klien aktif sekaligus, pertimbangkan migrasi ke database sungguhan (PostgreSQL dsb) — beri tahu saya kalau sudah sampai tahap itu, saya bantu migrasinya.
- File PDF dan fitur kirim WhatsApp tetap berjalan sama seperti sebelumnya, sepenuhnya di sisi browser klien.
