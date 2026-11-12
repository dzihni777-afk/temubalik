# Deploy Online — Status & Panduan

**Status: SUDAH ONLINE** ✅

```
https://temubalik-26f80.web.app
https://temubalik-26f80.firebaseapp.com
```

---

## Ringkasan yang sudah dikerjakan

| Komponen | Status | Keterangan |
| --- | --- | --- |
| Firebase Auth — Email/Password | ✅ aktif | terverifikasi lewat API Google |
| Firebase Auth — Google | ✅ aktif | terverifikasi lewat API Google |
| Firestore database | ✅ dibuat | `projects/temubalik-26f80/databases/default`, lokasi `nam5` |
| Security Rules | ✅ **terpublish** | release `cloud.firestore/default` |
| Firebase Hosting | ✅ **live** | 33 file ter-upload, versi `FINALIZED` |
| Akun admin | ⬜ **perlu Anda buat** | lihat Langkah 2 di bawah |

---

## ⚠️ Satu hal penting yang saya temukan dan perbaiki

Database Firestore Anda dibuat lewat **Google Cloud Console**, sehingga ID-nya
adalah **`default`** (tanpa tanda kurung).

SDK web Firebase secara bawaan mencari **`(default)`** — dengan tanda kurung.
Keduanya adalah database yang **berbeda**, dan `(default)` **tidak ada** di
project Anda. Kalau dibiarkan, situs akan menampilkan error
`database (default) does not exist` lalu diam-diam jatuh ke mode lokal
(data tidak lintas perangkat).

Perbaikannya ada di `js/firebase-config.js`:

```js
databaseId: "default",
```

Dan `js/firebase-adapter.js` mengarahkan instance Firestore ke ID tersebut
(fungsi `applyDatabaseId`). Sudah diuji di browser sungguhan: situs berhasil
menulis dan membaca dari Firestore.

> Kalau nanti Anda membuat ulang database lewat Firebase Console, ID-nya akan
> menjadi `(default)`. Saat itu, kosongkan atau ubah nilai `databaseId` agar
> sesuai.

---

## Langkah yang masih perlu Anda lakukan

### 1. Security Rules ✅ SUDAH DIPUBLISH

Rules sudah aktif di server. Isinya mendaftarkan admin lewat **UID** dan
**email**:

```
request.auth.uid in [ "VHG3YKblzHQzqK0LCVpaKpAbquL2" ]
request.auth.token.email in [ "r9723419@gmail.com" ]
```

Diverifikasi langsung ke Firestore produksi: ubah status & hapus laporan
sebagai admin → **200**, tanpa login → **403**.

Kalau nanti mengubah `firestore.rules`, publish ulang dengan:

```bash
firebase deploy --only firestore:rules
```

### 2. Akun admin ✅ SUDAH SIAP

Akun admin **sudah dibuat dan sudah diuji bisa login** (12 Nov 2026).

| Field | Nilai |
| --- | --- |
| URL login | <https://temubalik-26f80.web.app/admin> |
| Email | `r9723419@gmail.com` |
| Kata sandi | lihat `ADMIN_PASSWORD` di file `.env` (tidak di-commit) |
| UID | `VHG3YKblzHQzqK0LCVpaKpAbquL2` |

**Dua cara masuk, keduanya berfungsi:**

1. **Email + kata sandi** — isi email & sandi di form, klik **Masuk**.
2. **Masuk dengan Google** — klik tombolnya, pilih akun `r9723419@gmail.com`.
   Tidak perlu sandi. Email ini sudah terdaftar di `firestore.rules`.

Kalau lupa kata sandi: buka
<https://console.firebase.google.com/project/temubalik-26f80/authentication/users>,
pilih user tersebut, lalu **Reset password**.

### 3. Daftarkan domain untuk login Google

Domain `temubalik-26f80.web.app` dan `temubalik-26f80.firebaseapp.com`
**sudah terdaftar** sebagai authorized domain. Tidak perlu diubah.

Kalau nanti memakai domain sendiri, tambahkan di
<https://console.firebase.google.com/project/temubalik-26f80/authentication/settings>
→ **Authorized domains**, kalau tidak login Google akan gagal dengan
`auth/unauthorized-domain`.


### 4. Rotasi service account 🔴 PENTING

Kunci service account yang Anda kirim lewat chat **sudah bocor**. Siapa pun
yang melihatnya bisa mengakses seluruh project.

1. Buka <https://console.firebase.google.com/project/temubalik-26f80/settings/serviceaccounts/adminsdk>
2. **Generate new private key** (kalau perlu deploy lagi)
3. **Hapus** kunci lama dengan ID `156e8e57bbce747679be2fe8fe28705287aac522`

Kunci tidak pernah tersimpan di repo (sudah saya pastikan, dan `.gitignore`
kini memblokirnya).

---

## Hasil pengujian keamanan (dari luar, tanpa login)

| Yang diuji | Hasil |
| --- | --- |
| Baca daftar laporan | ✅ diizinkan (200) |
| Baca koleksi lain (`/rahasia`) | ✅ ditolak (403) |
| Hapus laporan | ✅ ditolak (403) |
| Ubah status | ✅ ditolak (403) |
| Kirim laporan valid | ✅ diterima (200) |
| Kirim laporan asal-asalan | ✅ ditolak (403) |
| Naikkan nomor urut laporan | ✅ diterima (200) |
| Turunkan nomor urut laporan | ✅ ditolak (403) |

Uji di browser sungguhan (Firefox) pada domain publik:
laporan berhasil dibuat (`LPR-20261111-001`), muncul di daftar, dan
penghapusan tanpa login ditolak.

**Celah `admin123` sudah tertutup:** di domain publik login demo ditolak
kalau Firebase tidak bisa dihubungi. Hanya berlaku di `localhost`,
`127.0.0.1`, dan `file://`.

---

## Cara deploy ulang setelah mengubah kode

```bash
cd temubalik
firebase login          # sekali saja
firebase deploy --only hosting
```

Kalau `firebase deploy` gagal dengan pesan
`Permission denied to get service [firebasehosting.googleapis.com]`, itu
karena akun yang dipakai tidak punya izin `serviceusage.services.get`.
Dua jalan keluar:

1. Login dengan akun Google pemilik project (`firebase login`), atau
2. Beri peran **Firebase Hosting Admin** + **Service Usage Viewer** ke akun
   yang dipakai.

Selama masalah itu ada, deploy bisa dilakukan lewat Hosting REST API langsung
(cara yang saya pakai): buat versi → `populateFiles` → unggah (gzip level 9)
→ `FINALIZED` → buat release.

---

## Uji setelah online

Buka `https://temubalik-26f80.web.app`, lalu:

1. **Console browser (F12)** → cari baris:
   ```
   [firebase] aktif — project temubalik-26f80
   [firebase] database dipakai: default
   ```
   Kalau muncul `[firebase] gagal aktif`, baca alasannya.

2. **Buat laporan** di halaman *Lapor Barang*.

3. **Cek Firestore Console** →
   <https://console.firebase.google.com/project/temubalik-26f80/firestore/data>
   → koleksi `reports` harus bertambah.

4. **Login admin** di `/admin.html`.

5. **Ubah status / hapus** laporan → perubahan langsung terlihat di Console.

6. **Uji dari HP** — laporan yang sama harus muncul.

7. **Uji keamanan** — buka Incognito, coba ubah status tanpa login. Harus gagal.

Cek status kapan saja dari Console browser:

```js
FirebaseStore.mode()     // "firebase" atau "local"
FirebaseStore.reason()   // alasan kalau tidak aktif
```

---

## Biaya

Paket **Spark (gratis)** sudah cukup:

| Layanan | Kuota gratis harian |
| --- | --- |
| Firestore — baca | 50.000 |
| Firestore — tulis | 20.000 |
| Firestore — hapus | 20.000 |
| Firestore — penyimpanan | 1 GiB total |
| Hosting — transfer | 360 MB/hari |
| Auth | tak terbatas untuk Email/Password |

Kalau kuota habis, situs tidak error — hanya baca/tulis Firestore yang gagal
sementara sampai kuota reset besok.

---

## Batasan yang perlu Anda tahu

1. **Foto disimpan base64 di dokumen Firestore.** Batas satu dokumen **1 MiB**,
   sedangkan adapter membatasi ~3MB. Jadi foto besar bisa **gagal tersimpan**.
   Untuk produksi, pindahkan foto ke **Firebase Storage**.
2. **Semua orang bisa membaca semua laporan** — memang tujuan situs ini. Jangan
   minta pengguna menulis NIK, nomor rekening, atau data sensitif di kronologi.
3. **Belum ada rate limit.** Form bisa dibanjiri request. Kalau mulai
   disalahgunakan, aktifkan **Firebase App Check** (reCAPTCHA v3).
4. **Data contoh 10 laporan** berasal dari `data/data.json` dan tetap tampil
   sebagai contoh. Laporan baru dari pengguna masuk ke Firestore.
5. **Backend `server/` tidak dipakai** dan tidak ikut ter-deploy. Halaman
   memakai Firebase langsung.

---

## Kalau ada masalah

| Gejala | Solusi |
| --- | --- |
| `database (default) does not exist` | `databaseId` di `js/firebase-config.js` tidak sesuai nama database |
| `Missing or insufficient permissions` | Rules belum dipublish, atau email admin belum diganti |
| `auth/unauthorized-domain` | Domain belum terdaftar di Authentication → Settings |
| `auth/operation-not-allowed` | Provider belum aktif |
| Login Google: "bukan admin" | Email Google belum ada di `firestore.rules` |
| Data tidak lintas perangkat | Masih mode lokal → cek `FirebaseStore.reason()` |
| Foto gagal tersimpan | Melebihi 1 MiB → kompres lebih kecil / pakai Storage |
| Deploy: `Permission denied to get service` | Lihat bagian "Cara deploy ulang" di atas |
