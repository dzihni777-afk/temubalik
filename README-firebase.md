> **Sudah siap online?** Lihat [README-deploy.md](README-deploy.md) untuk
> langkah deploy ke Firebase Hosting.

# Integrasi Firebase — Panduan Langkah demi Langkah

Panduan ini menjelaskan cara menyambungkan TemuBalik ke **Firebase Firestore**
(database) dan **Firebase Auth** (login admin), dari nol sampai jalan.

> **Penting sebelum mulai:** project Firebase Anda (`temubalik-26f80`) belum
> mengaktifkan Cloud Firestore. Tanpa langkah 2, aplikasi akan otomatis
> memakai `localStorage` (tidak error, tapi data tidak tersimpan di cloud).

---

## Ringkasan arsitektur

```
                    ┌──────────────────────┐
  index/lapor/…     │  js/firebase-adapter │──► Firestore (reports)
  ─────────────►    │  js/storage.js       │──► Auth (admin)
                    └──────────────────────┘
                              │ gagal?
                              ▼
                    localStorage + data/data.json
```

`js/storage.js` adalah satu-satunya pintu data. Ia mencoba Firebase lebih dulu;
kalau Firebase tidak tersedia, ia memakai `localStorage`. **Halaman tidak perlu
tahu sedang memakai yang mana** — jadi situs tidak pernah blank.

---

## Langkah 1 — Konfigurasi dari `.env`

Konfigurasi Firebase **tidak ditulis di dalam kode**. Nilainya disimpan di
`.env`, lalu dihasilkan menjadi `js/firebase-config.js`:

```bash
cp .env.example .env     # sekali saja
# lalu isi variabel FIREBASE_* di .env
npm run config           # menghasilkan js/firebase-config.js
```

Variabel yang dipakai:

```
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_APP_ID=...
FIREBASE_MEASUREMENT_ID=...
FIREBASE_DATABASE_ID=default
FIREBASE_COLLECTION=reports
FIREBASE_DEMO_PASSWORD=...
```

Nilainya bisa diambil dari Firebase Console →
**Project settings** → **Your apps** → konfigurasi SDK Firebase.

> `.env` dan `js/firebase-config.js` **tidak ikut di-commit**. Yang dibagikan
> hanya `.env.example` (nama variabel tanpa nilai rahasia).

File ini dimuat di semua halaman, sebelum `firebase-adapter.js`:

```html
<script src="js/firebase-config.js"></script>
<script src="js/firebase-adapter.js"></script>
<script src="js/storage.js"></script>
```

> **Soal `apiKey`:** kunci ini memang dirancang publik untuk Firebase Web dan
> ikut terkirim ke browser. Yang melindungi data Anda adalah **Security Rules**
> (langkah 4), bukan kerahasiaan kunci ini.

---

## Langkah 2 — Aktifkan Firestore 🔴 WAJIB

1. Buka <https://console.firebase.google.com/project/temubalik-26f80/firestore>
2. Klik **Create database**
3. Pilih lokasi, misalnya **asia-southeast2 (Jakarta)**
   — lokasi **tidak bisa diubah** setelah dibuat, jadi pilih yang benar.
4. Pilih **Start in production mode** (jangan test mode — nanti kita isi rules
   sendiri di langkah 4).
5. Tunggu 1–2 menit sampai database siap.

Kalau langkah ini dilewati, di Console browser akan muncul:

```
Cloud Firestore API has not been used in project temubalik-26f80 before
or it is disabled.
```

Aplikasi tetap jalan (memakai `localStorage`), tapi tidak ada data di cloud.

### ⚠️ Penting: nama database harus cocok

Firebase punya dua jalur pembuatan database, dan **nama yang dihasilkan
berbeda**:

| Dibuat lewat | ID database |
| --- | --- |
| Firebase Console | `(default)` — dengan tanda kurung |
| Google Cloud Console | `default` — tanpa tanda kurung |

SDK web Firebase secara bawaan mencari `(default)`. Kalau database Anda
bernama `default`, SDK akan error:

```
The database (default) does not exist for project temubalik-26f80
```

Solusinya, tulis nama database yang benar di `js/firebase-config.js`:

```js
databaseId: "default",   // sesuaikan dengan yang ada di Console
```

Nama pastinya bisa dilihat di
<https://console.firebase.google.com/project/temubalik-26f80/firestore>
(bagian **Database** / pilihan database di kiri atas).

> Project ini memakai `databaseId: "default"` karena database-nya dibuat lewat
> Google Cloud Console dengan lokasi `nam5`.

---

## Langkah 3 — Aktifkan login Email/Password 🔴 WAJIB untuk admin

1. Buka <https://console.firebase.google.com/project/temubalik-26f80/authentication/providers>
2. Klik **Get started** (kalau baru pertama kali)
3. Pada daftar provider, pilih **Email/Password**
4. Aktifkan **Enable**, lalu **Save**
5. Pindah ke tab **Users** → **Add user**
6. Isi email & kata sandi admin, contoh:
   - Email: `admin@temubalik.com`
   - Password: (pilih sandi kuat, minimal 6 karakter)

Akun inilah yang dipakai untuk masuk ke `admin.html`.

---

## Langkah 4 — Pasang Security Rules 🔴 WAJIB

Tanpa langkah ini, Firestore menolak semua akses (default production mode).

1. Buka <https://console.firebase.google.com/project/temubalik-26f80/firestore/rules>
2. Buka file `firestore.rules` di proyek ini
3. **Ganti baris ini** dengan email admin Anda dari langkah 3:

```
"admin@temubalik.com"   // ← GANTI dengan email admin Anda
```

4. Salin **seluruh** isi `firestore.rules` ke editor di Console
5. Klik **Publish**

Ringkasan izin yang diberikan:

| Aksi | Siapa yang boleh |
| --- | --- |
| Baca daftar & detail laporan | Semua orang |
| Membuat laporan baru | Semua orang (isi divalidasi ketat) |
| Mengubah status | Hanya admin |
| Menghapus laporan | Hanya admin |
| Field selain `status` diubah | Tidak ada (ditolak) |

> **Cara alternatif (custom claim):** kalau tidak ingin menaruh email di rules,
> pasang custom claim `admin: true` pada akun lewat Admin SDK, lalu hapus daftar
> email dari rules. Rules sudah mendukung keduanya.

---

## Langkah 5 — Jalankan dan uji

```bash
npm start          # atau: node server/server.js
# buka http://localhost:3000
```

**Cek cepat bahwa Firestore aktif:** buka Console browser (F12) → tab Console.
Kalau berhasil, akan muncul:

```
[firebase] aktif — project temubalik-26f80
```

Kalau gagal, akan muncul alasan yang jelas, misalnya:

```
[firebase] gagal aktif, memakai localStorage. Cloud Firestore API has not been used…
```

### Uji alur lengkap

1. **Buat laporan** — buka `lapor.html`, isi form, kirim.
2. **Cek di Console** — <https://console.firebase.google.com/project/temubalik-26f80/firestore/data>
   → koleksi `reports` → harus ada dokumen baru dengan id `LPR-YYYYMMDD-NNN`.
3. **Login admin** — buka `admin.html`, masuk dengan email & sandi langkah 3.
4. **Ubah status / hapus** — coba tombol "Selesaikan" dan ikon tempat sampah.
   Perubahan harus langsung terlihat di Console Firestore.
5. **Uji lintas perangkat** — buka situs dari HP. Laporan yang sama harus
   muncul, karena sekarang datanya di cloud.

---

## Struktur data di Firestore

**Koleksi `reports`** — id dokumen = kode laporan (`LPR-20260210-001`):

| Field | Tipe | Contoh |
| --- | --- | --- |
| `id` | string | `"LPR-20260210-001"` |
| `namaBarang` | string | `"Dompet Kulit Cokelat"` |
| `kategori` | string | `"Dompet & Tas"` |
| `merek`, `warna`, `ciriKhusus` | string | |
| `tanggalHilang` | string | `"2026-02-10"` |
| `jamHilang` | string | `"13:30"` |
| `lokasi`, `lokasiDetail` | string | |
| `kronologi` | string | |
| `foto` | string | data URL base64 atau `assets/img/…` |
| `namaPelapor`, `nim`, `whatsapp`, `email` | string | |
| `status` | string | `"Aktif"` / `"Selesai"` |
| `createdAt`, `updatedAt` | timestamp | |
| `ownerUid` | string \| null | uid admin pembuat (kalau login) |

**Koleksi `meta`** — dipakai untuk nomor urut laporan:

```
meta/counter-20260210  →  { value: 3, updatedAt: <timestamp> }
```

Nomor laporan memakai **transaksi**, jadi dua orang yang submit bersamaan
tidak akan mendapat nomor yang sama.

---

## Cara mematikan Firebase (kembali ke localStorage)

Ada dua cara:

**Cara 1 — permanen**, edit `js/firebase-config.js`:

```js
enabled: false,
```

**Cara 2 — sementara, tanpa ubah kode.** Buka Console browser, jalankan:

```js
localStorage.setItem("temubalik.storage", "local");
location.reload();
```

Untuk mengembalikannya:

```js
localStorage.removeItem("temubalik.storage");
location.reload();
```

Saklar ini juga berguna saat mengembangkan tanpa internet.

---

## Cara memindahkan data contoh ke Firestore (opsional)

10 laporan contoh dari `data/data.json` **tidak** otomatis masuk ke Firestore.
Kalau ingin memindahkannya:

1. Pastikan Firestore + rules sudah aktif (langkah 2 & 4)
2. Login sebagai admin di `admin.html`
3. Buka Console browser di halaman itu, lalu jalankan:

```js
fetch("data/data.json")
  .then((r) => r.json())
  .then(async (rows) => {
    for (const r of rows) {
      await FirebaseStore.create(r);
      console.log("masuk:", r.namaBarang);
    }
    console.log("Selesai:", rows.length, "laporan dipindahkan.");
  });
```

Tunggu sampai selesai, lalu muat ulang halaman.

---

## Kalau ada masalah

| Gejala | Penyebab & solusi |
| --- | --- |
| Data hilang setelah refresh, data tidak lintas perangkat | Firestore belum aktif → kerjakan langkah 2 |
| `Cloud Firestore API has not been used` | Sama, langkah 2 belum selesai |
| `Missing or insufficient permissions` | Rules belum dipasang / email admin belum diganti → langkah 4 |
| Login admin gagal terus | Provider Email/Password belum aktif, atau akun belum dibuat → langkah 3 |
| `auth/operation-not-allowed` | Provider Email/Password masih nonaktif → langkah 3 |
| `auth/invalid-credential` | Email atau kata sandi salah |
| Halaman terasa lambat beberapa detik saat pertama dibuka | Normal: adapter sedang memeriksa koneksi. Konten tetap tampil duluan dari cache lokal |
| Muncul `[firebase] gagal aktif` | Baca alasannya di Console — biasanya langkah 2 atau 4 belum selesai |

Untuk melihat status terkini kapan saja, buka Console browser:

```js
FirebaseStore.mode()     // "firebase" atau "local"
FirebaseStore.reason()   // alasan kalau tidak aktif
```

---

## Uji otomatis

Tiga berkas uji khusus Firebase, tidak butuh kredensial dan tidak mengubah
data Anda:

```bash
node tests/firebase-mock.test.cjs          # 38 pemeriksaan — adapter + Firestore tiruan
node tests/firebase-integration.test.cjs   # 19 pemeriksaan — SDK asli + Firestore tiruan
node tests/firebase.test.cjs               # 33 pemeriksaan — perilaku saat offline
```

Yang diuji antara lain: konversi Timestamp, nomor laporan tidak bentrok,
validasi status, login gagal/berhasil, dan **fallback ke localStorage saat
Firebase mati** (memastikan situs tidak pernah blank).

---

## Catatan keamanan

1. **Jangan pakai `test mode`** (`allow read, write: if true`) di produksi.
   Siapa pun bisa menghapus seluruh database.
2. **Foto disimpan sebagai base64** di dalam dokumen. Batas dokumen Firestore
   adalah 1 MiB, sedangkan adapter membatasi foto ~3MB — jadi foto besar bisa
   gagal disimpan. Untuk produksi, pindahkan foto ke **Firebase Storage**.
3. **`ownerUid` hanya informasi**, bukan dasar izin. Izin tetap ditentukan
   Security Rules.
4. **Kuota gratis Spark** cukup untuk belajar, tapi ada batas baca/tulis harian.
5. **Laporan siapa pun bisa dibaca publik** (memang tujuan situs ini). Jangan
   simpan data sensitif seperti NIK atau nomor rekening di kolom kronologi.
