# Backend TemuBalik

Backend Node.js **tanpa dependency** (cukup Node 18+), ditaruh di `server/`.
Server ini sekaligus menyajikan file front-end, jadi satu perintah saja.

```bash
npm start          # atau: node server/server.js
# buka http://localhost:3000
```

Port bisa diganti: `PORT=4000 npm start`.

> Front-end **belum** disambung ke API ini. Halaman masih memakai
> `localStorage` lewat `js/storage.js`, jadi situs tetap jalan seperti biasa.
> Backend ini berdiri sendiri dan bisa dicoba pakai `curl`.

---

## Yang sudah jadi vs yang belum

Sengaja dikerjakan separuh: alur baca + buat laporan sudah lengkap dan teruji,
alur ubah status / hapus / admin masih kosong dengan penanda `TODO`.

| Endpoint | Status | Keterangan |
| --- | --- | --- |
| `GET /api/health` | ✅ selesai | Cek server hidup |
| `GET /api/reports` | ✅ selesai | Daftar + `q`, `kategori`, `status`, `lokasi`, `sort`, `limit`, `offset` |
| `GET /api/reports/:id` | ✅ selesai | Detail satu laporan (id tidak peka huruf besar/kecil) |
| `POST /api/reports` | ✅ selesai | Buat laporan, validasi lengkap, nomor `LPR-YYYYMMDD-NNN` otomatis |
| `PATCH /api/reports/:id/status` | ⛔ belum | Balas `501 NOT_IMPLEMENTED` |
| `DELETE /api/reports/:id` | ⛔ belum | Balas `501 NOT_IMPLEMENTED` |
| `GET /api/stats` | ⛔ belum | Balas `501 NOT_IMPLEMENTED` |
| `POST /api/admin/login` | ⛔ belum | Balas `501 NOT_IMPLEMENTED` |
| `GET /api/admin/me` | ⛔ belum | Balas `501 NOT_IMPLEMENTED` |

Rincian langkah pengerjaan tiap endpoint yang belum jadi ada sebagai komentar
`TODO` di dalam kodenya:

- `server/routes/reports.js` → `updateStatus()`, `deleteReport()`
- `server/routes/misc.js` → `getStats()`, `adminLogin()`, `adminMe()`
- `js/api-client.js` → `Api.updateStatus()`, `Api.remove()`

---

## Struktur

```
server/
├── server.js          HTTP server + penyaji file statis + router
├── http.js            helper JSON, error, baca body (batas 8MB)
├── db.js              baca/tulis gudang JSON, antrian tulis, nomor laporan
├── validate.js        validasi input sisi server (cermin js/form.js)
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
`FORBIDDEN`, `NOT_FOUND`, `NOT_IMPLEMENTED`, `INTERNAL_ERROR`.

---

## Contoh pemakaian

```bash
# daftar 3 laporan terbaru
curl "http://localhost:3000/api/reports?limit=3"

# cari + filter
curl "http://localhost:3000/api/reports?q=dompet&status=Aktif"

# detail
curl http://localhost:3000/api/reports/LPR-20260210-001

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
```

Foto: kirim `foto` berupa data URL (`data:image/jpeg;base64,...`, maksimal
~3MB) atau path aset bawaan (`assets/img/hp.svg`). URL eksternal dan skema
lain ditolak.

---

## Uji otomatis

```bash
npm run test:api       # 60 pemeriksaan, tanpa dependency
```

Uji menjalankan server di port 3456 dengan gudang sementara di `/tmp`,
jadi `server/storage/reports.json` tidak tersentuh. Uji ikut memastikan
endpoint stub tetap membalas `501` dan tidak mengubah data.

---

## Catatan keamanan (penting)

Ini backend untuk belajar, **belum** siap produksi:

1. **Belum ada autentikasi.** Siapa pun bisa `POST` laporan. Endpoint admin
   masih kosong, jadi belum ada token/sesi sama sekali.
2. **CORS masih `*`.** Batasi ke origin frontend sebelum dipakai publik.
3. **Belum ada rate limit.** Form bisa dibanjiri request.
4. **Belum ada sanitasi HTML di sisi server.** Data dikembalikan apa adanya
   sebagai JSON; front-end sudah memakai `escapeHtml()`, tapi jangan
   mengandalkan itu kalau nanti ada konsumen lain.
5. **Satu file JSON** tidak cocok untuk banyak pengguna serentak. Pindah ke
   database sungguhan kalau dipakai ramai.
6. **Nomor laporan berurutan per hari** masih bisa bentrok kalau nanti
   dijalankan sebagai beberapa proses sekaligus.
