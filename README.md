# TemuBalik — Website Pengajuan Barang Hilang

Front-end murni (**HTML + CSS + JavaScript**) untuk pelaporan barang hilang.
Pengguna mengisi formulir, menerima kode laporan, lalu memantau status barangnya.

Tidak ada build step, tidak ada dependency. Cukup buka filenya di browser.

Ada juga **backend Node.js opsional** di `server/` (tanpa dependency) yang
sekaligus menyajikan file front-end. Backend itu **belum disambung** ke halaman
dan baru selesai separuh — lihat [README-backend.md](README-backend.md).

---

## Cara Menjalankan

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
`/api`. Front-end masih memakai `localStorage`, jadi backend hanya untuk
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
| `admin.html` | Panel admin: ubah status, hapus laporan (kata sandi `admin123`) |

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

server/                 Backend Node.js (opsional, lihat README-backend.md)
├── server.js           HTTP server + penyaji file statis
├── http.js             Helper JSON, error, baca body
├── db.js               Baca/tulis gudang data JSON
├── validate.js         Validasi sisi server
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
data/data.json ──fetch──┐
   (fallback)           ├──► storage.js ──► render halaman
localStorage ───────────┘
```

| Kunci `localStorage` | Isi |
| --- | --- |
| `temubalik.local` | Laporan baru yang dibuat di browser ini |
| `temubalik.overrides` | Perubahan status pada laporan bawaan |
| `temubalik.deleted` | ID laporan yang dihapus |
| `temubalik.mine` | ID laporan milik pengguna ini |
| `temubalik.draft` | Isi formulir yang belum dikirim |
| `temubalik.theme` | Preferensi tema |
| `temubalik.admin` | Penanda sesi admin |

Seluruh akses data melewati `js/storage.js`. Untuk menyambung ke backend nanti,
cukup ganti isi fungsi-fungsi di file itu dengan pemanggilan `fetch()` ke API —
halaman lain tidak perlu diubah.

Kerangka klien API-nya sudah disiapkan di `js/api-client.js` (belum dipakai
halaman), dengan nama fungsi yang sama: `Api.list`, `Api.getById`, `Api.create`,
`Api.updateStatus`, `Api.remove`.

---

## Batasan (penting)

Ini **purwarupa front-end**, bukan sistem produksi:

1. **Data tidak lintas perangkat.** Laporan hanya tersimpan di browser yang dipakai.
2. **Foto disimpan sebagai base64** di `localStorage`, dengan kompresi agar hemat ruang.
   Kuota `localStorage` sekitar 5MB, jadi jumlah foto besar terbatas.
3. **Login admin bukan keamanan nyata.** Kata sandi (`admin123`) hanya pembatas UI
   di sisi klien dan bisa dilihat siapa pun yang membuka DevTools. Jangan dipakai produksi.
4. **Kode laporan berurutan per hari**, bisa bentrok bila dua orang submit bersamaan
   pada waktu yang sama di server sungguhan.

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
```

Hasil yang diharapkan: **159 pemeriksaan lulus** (30 storage + 46 DOM + 29 form + 20 browser + 34 interaksi)
dan **60 pemeriksaan API**.

---

## Kredit

Dibuat untuk keperluan pembelajaran. Ilustrasi barang berupa SVG buatan sendiri,
tanpa aset pihak ketiga. Font [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts.
