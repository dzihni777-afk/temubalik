# TemuBalik — Website Pengajuan Barang Hilang

Front-end murni (**HTML + CSS + JavaScript**) untuk pelaporan barang hilang.
Pengguna mengisi formulir, menerima kode laporan, lalu memantau status barangnya.

Tidak ada build step, tidak ada dependency. Cukup buka filenya di browser.

**Database:** sekarang memakai **Firebase Firestore + Firebase Auth** (sudah
terpasang dan aktif). Kalau Firebase tidak tersedia, situs otomatis kembali ke
`localStorage` — jadi tidak pernah blank. Panduan pemasangan ada di
[README-firebase.md](README-firebase.md), dan panduan deploy online di
[README-deploy.md](README-deploy.md).

Ada juga **backend Node.js opsional** di `server/` (tanpa dependency) yang
sekaligus menyajikan file front-end. Semua endpoint API sudah jalan (termasuk
login admin, ubah status, hapus, dan statistik), tetapi halaman **tidak**
memakainya — halaman memakai Firebase. Lihat [README-backend.md](README-backend.md).

---

## Cara Menjalankan

**Langkah 0 — siapkan `.env` (sekali saja)**

Konfigurasi Firebase dan kata sandi **tidak ditulis di dalam kode**. Semuanya
berasal dari file `.env` yang tidak ikut di-commit.

```bash
cp .env.example .env     # lalu isi nilainya
npm run config           # menghasilkan js/firebase-config.js dari .env
```

Variabel yang perlu diisi ada di `.env.example` (nama variabelnya saja, tanpa
nilai rahasia). Kalau `.env` kosong, situs tetap jalan dalam mode lokal —
tidak error.

**Cara 1 — paling cepat (tanpa server)**

Klik dua kali `index.html`. Semua fitur berjalan, data awal dibaca dari `data/data-seed.js`.

**Cara 2 — dengan server lokal (disarankan)**

```bash
# Python 3
python -m http.server 8000

# atau Node.js
npx serve .

# atau PHP
php -S localhost:8000
```

Lalu buka <http://localhost:8000>.

**Cara 3 — dengan backend Node.js (opsional)**

```bash
npm start        # sama dengan: node server/server.js
```

Buka <http://localhost:3000>. Server ini menyajikan front-end sekaligus API di
`/api`. Front-end memakai Firebase, jadi backend hanya untuk
eksplorasi API — lihat [README-backend.md](README-backend.md).

> Dengan server, data awal diambil dari `data/data.json` lewat `fetch`.
> Tanpa server (`file://`), otomatis beralih ke `data/data-seed.js` karena
> `fetch` diblokir CORS pada protokol file.

---

## Halaman

| Halaman | Fungsi |
| --- | --- |
| `index.html` | Beranda: hero, statistik, 6 laporan terbaru, alur 3 langkah |
| `lapor.html` | **Formulir pengajuan** — validasi, upload foto, draft otomatis |
| `daftar.html` | Daftar laporan: pencarian, filter kategori/status/lokasi, urutkan, muat lebih banyak |
| `detail.html` | Detail laporan: lightbox foto, kontak tersensor, ubah status |
| `status.html` | Cek status via kode laporan + daftar "Laporan Saya" |
| `tentang.html` | Penjelasan sistem, kontak, FAQ accordion |
| `admin.html` | Panel admin: ubah status, hapus laporan (login Firebase Auth) |

---

## Struktur

```
temubalik/
├── index.html          Beranda
├── lapor.html          Form pengajuan
├── daftar.html         Daftar laporan
├── detail.html         Detail laporan
├── status.html         Cek status
├── tentang.html        Tentang & FAQ
├── admin.html          Panel admin
│
├── css/
│   ├── style.css       Design system: token, layout, komponen
│   └── responsive.css  Media query (960 / 820 / 560 / 380px)
│
├── js/
│   ├── theme-init.js   Terapkan tema sebelum paint (cegah flash)
│   ├── utils.js        Helper: tanggal, escape HTML, toast, modal, ikon
│   ├── storage.js      Lapisan data — SEMUA akses data lewat sini
│   ├── form.js         Logika form + validasi + preview foto
│   ├── list.js         Render daftar + filter + pagination
│   ├── detail.js       Render detail + lightbox + ubah status
│   ├── status.js       Cek kode + laporan saya
│   └── admin.js        Panel admin
│
├── data/
│   ├── data.json       10 laporan contoh (dipakai via fetch)
│   └── data-seed.js    Salinan data.json (fallback untuk file://)
│
├── assets/img/         Ilustrasi SVG per kategori barang
└── tests/              Uji otomatis (opsional, lihat bawah)

firebase.json           Konfigurasi deploy Firebase Hosting
.firebaserc             Project default untuk Firebase CLI
firestore.rules         Security Rules (WAJIB dipasang di Console)
js/firebase-config.js   Konfigurasi Firebase (HASIL GENERATE dari .env)
js/firebase-adapter.js  Adapter Firestore + Auth

.env                    Variabel lingkungan + rahasia (TIDAK di-commit)
.env.example            Contoh variabel lingkungan (aman dibagikan)
scripts/
└── gen-firebase-config.js  Membuat js/firebase-config.js dari .env

server/                 Backend Node.js (opsional, lihat README-backend.md)
├── server.js           HTTP server + penyaji file statis
├── env.js              Pembaca file .env (tanpa dependency)
├── http.js             Helper JSON, error, baca body
├── db.js               Baca/tulis gudang data JSON
├── validate.js         Validasi sisi server
├── auth.js             Hash kata sandi, token admin, rate limit login
├── routes/             reports.js, misc.js
└── storage/            reports.json (dibuat otomatis, tidak di-commit)
```

---

## Fitur

**Form pengajuan**
- Data pelapor, data barang, waktu & lokasi, kronologi, foto
- Validasi real-time per field (nama, no. WhatsApp, email, tanggal, panjang teks)
- Tanggal kehilangan tidak boleh melebihi hari ini
- Upload foto dengan drag & drop, pratinjau, dan kompresi otomatis via canvas
- Simpan draft otomatis ke `localStorage`, dipulihkan saat halaman dibuka lagi
- Kode laporan otomatis berformat `LPR-YYYYMMDD-NNN`
- Halaman sukses: salin kode, unduh bukti (print), lanjut cek status

**Daftar & pencarian**
- Pencarian teks pada nama barang, lokasi, kode, kategori, merek, warna, ciri khusus, pelapor
- Filter kategori, status, lokasi + urutkan (terbaru / terlama / nama A–Z)
- Chip filter aktif yang bisa dilepas satu per satu
- Pagination "Muat Lebih Banyak", skeleton loading, empty state

**Detail**
- Lightbox foto (klik, Enter/Space, tutup dengan Escape)
- Nomor WhatsApp disensor default, tombol "Tampilkan"
- Tombol hubungi via WhatsApp, bagikan tautan (Web Share API + fallback clipboard)
- Ubah status Aktif ↔ Selesai

**Lintas halaman**
- Mode terang & gelap, tersimpan dan diterapkan sebelum paint (tanpa flash)
- Responsif mobile-first, menu hamburger
- Toast notification, modal konfirmasi, skeleton loading
- `escapeHtml()` pada semua data dinamis untuk mencegah XSS
- Aksesibilitas: label form, `aria-expanded`, `aria-live`, fokus terlihat, navigasi keyboard

---

## Penyimpanan Data

```
Firebase Firestore ──┐
   (utama)           ├──► storage.js ──► render halaman
localStorage ────────┘
   (cadangan otomatis)
```
Semua akses data melewati `js/storage.js`. Ia mencoba Firebase lebih dulu; kalau
Firebase tidak tersedia (offline, Firestore belum diaktifkan, rules menolak),
ia otomatis memakai `localStorage`. **Halaman tidak perlu diubah** dan situs
tidak pernah blank.

| Lokasi | Isi |
| --- | --- |
| Firestore `reports` | Seluruh laporan (lintas perangkat) |
| Firestore `meta` | Counter nomor urut laporan |
| Firebase Auth | Akun admin |
| `localStorage` `temubalik.mine` | ID laporan milik perangkat ini |
| `localStorage` `temubalik.draft` | Isi formulir yang belum dikirim |
| `localStorage` `temubalik.theme` | Preferensi tema |
| `localStorage` `temubalik.storage` | Paksa mode `local` / `firebase` (opsional) |

---

## Data sensitif & file `.env`

Tidak ada kata sandi, kunci, atau konfigurasi project yang ditulis di dalam
kode. Semuanya berasal dari `.env`:

| Variabel | Dipakai untuk |
| --- | --- |
| `FIREBASE_*` | Konfigurasi Firebase (dihasilkan ke `js/firebase-config.js`) |
| `FIREBASE_DATABASE_ID` | Nama database Firestore (`default` atau `(default)`) |
| `FIREBASE_DEMO_PASSWORD` | Kata sandi demo mode lokal (kosong = login demo mati) |
| `ADMIN_PASSWORD_HASH` | Kata sandi admin backend Node.js (disarankan, berupa hash) |
| `ADMIN_DEMO_PASSWORD` | Kata sandi demo backend (kosong = login backend mati) |

**Yang di-commit:** `.env.example` (nama variabel saja, tanpa nilai).
**Yang TIDAK di-commit:** `.env` dan `js/firebase-config.js` (hasil generate).

Alur kerjanya:

```
.env  ──[npm run config]──►  js/firebase-config.js  ──►  halaman web
        (rahasia, tidak           (hasil generate,
         di-commit)                 tidak di-commit)
```

> **Soal `apiKey` Firebase Web:** nilai ini **bukan rahasia**. Firebase memang
> mengirimnya ke browser setiap pengunjung, dan itu sesuai rancangan. Yang
> melindungi data adalah **Security Rules** (`firestore.rules`). Memindahkannya
> ke `.env` tidak menambah keamanan dari pengunjung — manfaatnya agar repo bisa
> dibagikan tanpa menunjuk ke project Firebase yang hidup.

**Service account** (kunci admin Firebase) **tidak boleh** disimpan di repo
sama sekali. Simpan di luar folder proyek, lalu tunjuk lewat
`GOOGLE_APPLICATION_CREDENTIALS`. Untuk deploy, lebih aman pakai
`firebase login` (tanpa file kunci).

Kalau `.env` tidak ada atau variabelnya kosong, aplikasi **tidak** memakai nilai
bawaan yang lemah — fitur terkait dimatikan (login demo ditolak, bukan terbuka).

Saat Firebase tidak aktif, kunci `temubalik.local`, `temubalik.overrides`, dan
`temubalik.deleted` dipakai sebagai penyimpanan cadangan.

Panduan pemasangan Firebase: [README-firebase.md](README-firebase.md).

Klien untuk backend Node.js tetap tersedia di `js/api-client.js` (tidak dipakai
halaman), dengan fungsi `Api.list`, `Api.getById`, `Api.create`, `Api.stats`,
`Api.updateStatus`, `Api.remove`, `Api.adminLogin`, `Api.adminMe`,
`Api.adminLogout`.

---

## Batasan (penting)

Ini **purwarupa**, bukan sistem produksi:

1. **Wajib memasang Security Rules** (`firestore.rules`) dan mengaktifkan
   Firestore + Auth di Firebase Console. Tanpa itu, aplikasi jatuh ke mode
   lokal dan data tidak lintas perangkat.
2. **Foto disimpan sebagai base64** di dalam dokumen Firestore. Batas satu dokumen
   adalah 1 MiB, jadi foto besar bisa gagal. Untuk produksi, pindahkan foto ke
   Firebase Storage.
3. **Login admin memakai Firebase Auth**, dan izin ubah/hapus ditegakkan oleh
   Security Rules di `firestore.rules` — bukan sekadar UI. Tetap wajib memasang
   rules tersebut, kalau tidak Firestore memakai default yang menolak semua.
4. **Nomor laporan memakai transaksi**, jadi dua orang yang submit bersamaan
   tidak akan mendapat nomor yang sama.

---

## Uji Otomatis (opsional)

Butuh Node.js. Uji memakai `jsdom` dan Chrome headless.

```bash
npm install jsdom ws --no-save

# uji logika data (tanpa browser)
node tests/storage.test.cjs

# uji render halaman (butuh server lokal di port 8899)
node -e "const http=require('http'),fs=require('fs'),path=require('path');http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile(path.join(process.cwd(),p),(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200);s.end(d)})}).listen(8899)"
node tests/dom.test.cjs
node tests/form.test.cjs

# uji di browser asli (mode file://)
node tests/browser.test.cjs
node tests/interaksi.test.cjs

# uji backend API (tanpa dependency, tanpa menyentuh data asli)
npm run test:api

# uji integrasi Firebase (tanpa kredensial, tanpa menyentuh data asli)
node tests/firebase-mock.test.cjs
node tests/firebase-integration.test.cjs
node tests/firebase.test.cjs
```

Hasil yang diharapkan: **159 pemeriksaan lulus** (30 storage + 46 DOM + 29 form
+ 20 browser + 34 interaksi), **101 pemeriksaan API**, dan **90 pemeriksaan
Firebase** (38 mock + 19 integrasi + 33 offline).

Uji halaman memaksa mode lokal lewat `localStorage.setItem("temubalik.storage",
"local")`, jadi tidak bergantung pada jaringan maupun data Firebase Anda.

---

## Kredit

Dibuat untuk keperluan pembelajaran. Ilustrasi barang berupa SVG buatan sendiri,
tanpa aset pihak ketiga. Font [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts.
