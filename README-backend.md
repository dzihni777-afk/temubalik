# Backend TemuBalik

Backend Node.js **tanpa dependency** (cukup Node 18+), ditaruh di `server/`.
Server ini sekaligus menyajikan file front-end, jadi satu perintah saja.

```bash
npm start          # atau: node server/server.js
# buka http://localhost:3000
```

Port bisa diganti: `PORT=4000 npm start` (PowerShell: `$env:PORT=4000; npm start`).

> Front-end **belum** disambung ke API ini. Halaman masih memakai
> `localStorage` lewat `js/storage.js`, jadi situs tetap jalan seperti biasa.
> Backend ini bisa dicoba pakai `curl`, dan kliennya sudah siap di
> `js/api-client.js`.

---

## Daftar endpoint

Semua endpoint **sudah jalan**. Endpoint bertanda 🔒 butuh token admin.

| Endpoint | Status | Keterangan |
| --- | --- | --- |
| `GET /api/health` | ✅ | Cek server hidup |
| `GET /api/reports` | ✅ | Daftar + `q`, `kategori`, `status`, `lokasi`, `sort`, `limit`, `offset` |
| `GET /api/reports/:id` | ✅ | Detail satu laporan (id tidak peka huruf besar/kecil) |
| `POST /api/reports` | ✅ | Buat laporan, validasi lengkap, nomor `LPR-YYYYMMDD-NNN` otomatis |
| `PATCH /api/reports/:id/status` | ✅ 🔒 | Ubah status `Aktif` ↔ `Selesai` |
| `DELETE /api/reports/:id` | ✅ 🔒 | Hapus laporan permanen |
| `GET /api/stats` | ✅ | Total, aktif, selesai, rincian per kategori & lokasi |
| `POST /api/admin/login` | ✅ | Tukar kata sandi dengan token (berlaku 2 jam) |
| `GET /api/admin/me` | ✅ 🔒 | Cek token masih berlaku |
| `POST /api/admin/logout` | ✅ 🔒 | Cabut token yang sedang dipakai |

Aturan tambahan:

- Endpoint 🔒 wajib mengirim `Authorization: Bearer <token>`.
  Tanpa token / token kedaluwarsa → `401 UNAUTHORIZED`.
- `PATCH` status hanya menerima `"Aktif"` atau `"Selesai"` (selain itu `422`).
- `DELETE` bersifat permanen dan mengembalikan `{ id, deleted: true, namaBarang }`.
- Login yang gagal 5× dalam 10 menit dari IP yang sama → `429 TOO_MANY_REQUESTS`.

---

## Struktur

```
server/
├── server.js          HTTP server + penyaji file statis + router
├── http.js            helper JSON, error, baca body (batas 8MB)
├── db.js              baca/tulis gudang JSON, antrian tulis, nomor laporan
├── validate.js        validasi input sisi server (cermin js/form.js)
├── auth.js            hash kata sandi, token admin, rate limit login
├── routes/
│   ├── reports.js     endpoint /api/reports*
│   └── misc.js        endpoint /api/stats dan /api/admin*
└── storage/
    └── reports.json   gudang data (dibuat otomatis dari data/data.json)
```

Penyimpanan memakai satu file JSON dengan penulisan atomik (tulis `.tmp` lalu
`rename`) dan antrian agar dua request tidak saling menimpa. Untuk produksi,
ganti isi `db.js` dengan SQLite/Postgres — `routes/` tidak perlu diubah.

---

## Konfigurasi admin

Kata sandi admin dibaca dari environment variable, dengan urutan prioritas:

1. `ADMIN_PASSWORD_HASH` — **disarankan**, sha256 hex dari kata sandi.
2. `ADMIN_PASSWORD` — teks biasa, khusus pengembangan lokal.
3. `ADMIN_DEMO_PASSWORD` — kata sandi demo, dibaca dari `.env`.
4. Kalau **ketiganya kosong** → **login admin dinonaktifkan**. Server mencetak
   pesan error saat start, dan semua percobaan login ditolak.

> Nilai-nilai itu diambil dari file `.env` di root proyek (dibaca otomatis oleh
> `server/env.js`). Tidak ada kata sandi yang ditulis di dalam kode.
> Salin contohnya dulu: `cp .env.example .env`

Membuat hash:

```bash
node -e "console.log(require('node:crypto').createHash('sha256').update('sandi-baru').digest('hex'))"
```

Lalu jalankan:

```bash
# PowerShell
$env:ADMIN_PASSWORD_HASH="<hash>"; npm start

# bash
ADMIN_PASSWORD_HASH=<hash> npm start
```

Masa berlaku token bisa diatur lewat `ADMIN_TOKEN_TTL_MS` (default `7200000` = 2 jam).

> Token disimpan **di memori** server. Restart server = semua admin harus
> login ulang. Ini cukup untuk satu proses; kalau nanti jalan di beberapa
> proses/instance, pindahkan sesi ke database.

---

## Format respons

Sukses:

```json
{ "data": { "id": "LPR-20260210-001", "...": "..." } }
```

Daftar:

```json
{
  "data": [ { "id": "..." } ],
  "meta": { "total": 10, "limit": 9, "offset": 0, "hasMore": true }
}
```

Statistik:

```json
{
  "data": {
    "total": 10,
    "aktif": 6,
    "selesai": 4,
    "perKategori": [ { "kategori": "Elektronik", "jumlah": 4 } ],
    "perLokasi": [ { "lokasi": "Perpustakaan", "jumlah": 3 } ],
    "terbaru": { "id": "LPR-...", "namaBarang": "...", "createdAt": "..." }
  }
}
```

Login:

```json
{
  "data": {
    "token": "64 karakter hex",
    "tokenType": "Bearer",
    "issuedAt": "2026-02-12T04:00:00.000Z",
    "expiresAt": "2026-02-12T06:00:00.000Z",
    "expiresIn": 7200
  }
}
```

Gagal:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data laporan belum lengkap atau tidak valid.",
    "fields": { "whatsapp": "Format nomor tidak valid (contoh: 081234567890)." }
  }
}
```

Kode error yang dipakai: `BAD_JSON`, `VALIDATION_ERROR`, `REPORT_NOT_FOUND`,
`INVALID_PHOTO`, `PHOTO_TOO_LARGE`, `PAYLOAD_TOO_LARGE`, `METHOD_NOT_ALLOWED`,
`UNAUTHORIZED`, `TOO_MANY_REQUESTS`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR`.

---

## Contoh pemakaian

```bash
# daftar 3 laporan terbaru
curl "http://localhost:3000/api/reports?limit=3"

# cari + filter
curl "http://localhost:3000/api/reports?q=dompet&status=Aktif"

# detail
curl http://localhost:3000/api/reports/LPR-20260210-001

# statistik
curl http://localhost:3000/api/stats

# buat laporan
curl -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{
    "namaPelapor": "Siti Aminah",
    "whatsapp": "081234567890",
    "namaBarang": "Kunci Motor Honda",
    "kategori": "Kunci",
    "warna": "Hitam",
    "ciriKhusus": "Gantungan kunci berbentuk boneka biru",
    "tanggalHilang": "2026-02-12",
    "lokasi": "Parkiran",
    "kronologi": "Kunci terjatuh saat membuka parkiran, sadar setelah masuk kelas."
  }'

# login admin → ambil token
TOKEN=$(curl -s -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"admin123"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.token))")

# ubah status (butuh token)
curl -X PATCH http://localhost:3000/api/reports/LPR-20260212-001/status \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"Selesai"}'

# hapus laporan (butuh token)
curl -X DELETE http://localhost:3000/api/reports/LPR-20260212-001 \
  -H "Authorization: Bearer $TOKEN"

# cek sesi & logout
curl http://localhost:3000/api/admin/me -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:3000/api/admin/logout -H "Authorization: Bearer $TOKEN"
```

Foto: kirim `foto` berupa data URL (`data:image/jpeg;base64,...`, maksimal
~3MB) atau path aset bawaan (`assets/img/hp.svg`). URL eksternal dan skema
lain ditolak.

---

## Klien JavaScript

`js/api-client.js` sudah lengkap dan memakai nama fungsi yang sama dengan
`js/storage.js`, jadi tinggal ditukar kalau nanti halaman mau pindah ke API:

| `Api.*` | Endpoint |
| --- | --- |
| `list(opts)` | `GET /api/reports` |
| `getById(id)` | `GET /api/reports/:id` |
| `create(payload)` | `POST /api/reports` |
| `stats()` | `GET /api/stats` |
| `updateStatus(id, status)` | `PATCH /api/reports/:id/status` |
| `remove(id)` | `DELETE /api/reports/:id` |
| `adminLogin(password)` | `POST /api/admin/login` |
| `adminMe()` | `GET /api/admin/me` |
| `adminLogout()` | `POST /api/admin/logout` |

Token disimpan di `sessionStorage` (hilang saat tab ditutup) dan otomatis
dibuang kalau server membalas `401`.

---

## Uji otomatis

```bash
npm run test:api       # 101 pemeriksaan, tanpa dependency
```

Uji menjalankan server di port 3456 dengan gudang sementara di folder temp OS,
jadi `server/storage/reports.json` tidak tersentuh. Yang diperiksa antara lain:
validasi input, paginasi, pencarian, statistik, login (benar/salah/format
header salah), perubahan status, penghapusan, pencabutan token saat logout,
rate limit login, serta pemisahan file statis yang tidak boleh diakses.

---

## Catatan keamanan (penting)

Ini backend untuk belajar, **belum** siap produksi:

1. **Kata sandi demo.** Tanpa `ADMIN_PASSWORD_HASH`, server memakai
   `ADMIN_DEMO_PASSWORD` dari `.env`. Kalau itu juga kosong, login admin
   **dinonaktifkan** (bukan memakai kata sandi bawaan). Selalu set env tersebut
   sebelum dipakai di luar lokal.
2. **Token di memori.** Restart server menghapus semua sesi; tidak cocok untuk
   beberapa proses sekaligus. Pindahkan ke database untuk produksi.
3. **Belum ada HTTPS.** Token dikirim di header, jadi wajib HTTPS kalau publik.
4. **CORS masih `*`.** Batasi ke origin frontend sebelum dipakai publik.
5. **Rate limit hanya untuk login.** `POST /api/reports` masih bisa dibanjiri
   request; tambahkan pembatas per IP kalau perlu.
6. **Belum ada sanitasi HTML di sisi server.** Data dikembalikan apa adanya
   sebagai JSON; front-end sudah memakai `escapeHtml()`, tapi jangan
   mengandalkan itu kalau nanti ada konsumen lain.
7. **Satu file JSON** tidak cocok untuk banyak pengguna serentak. Pindah ke
   database sungguhan kalau dipakai ramai.
8. **Nomor laporan berurutan per hari** masih bisa bentrok kalau nanti
   dijalankan sebagai beberapa proses sekaligus.
