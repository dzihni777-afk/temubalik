# CATATAN PROGRES — TemuBalik

> **File kerja, bukan dokumentasi pengguna.**
> Isinya: apa yang sudah selesai, apa yang masih kurang, dan apa yang salah.
> Perbarui file ini setiap kali ada perubahan besar.
>
> Terakhir diperbarui: **12 November 2026**

---

## 1. Ringkasan status

| Bagian | Status |
| --- | --- |
| Integrasi Firebase (Firestore + Auth) | ✅ selesai |
| Security Rules | ✅ terpublish, ⚠️ email admin masih placeholder |
| Hosting online | ✅ live, ⚠️ **3 file belum ter-deploy** |
| Data sensitif ke `.env` | ✅ selesai |
| Uji otomatis | ✅ 296 pemeriksaan lulus |
| Commit | ⚠️ ada perubahan belum di-commit (lihat §8) |

**Alamat situs:** <https://temubalik-26f80.web.app>

---

## 2. Yang sudah selesai

### 2.1 Integrasi Firebase

- `js/firebase-config.js` — konfigurasi (hasil generate dari `.env`)
- `js/firebase-adapter.js` — adapter Firestore + Auth
- `js/storage.js` — pemilih sumber data (Firebase ↔ localStorage)
- `firestore.rules` — aturan akses
- `firebase.json` + `.firebaserc` — konfigurasi deploy

**Arsitektur fail-safe:** Firebase dicoba dulu; kalau gagal → otomatis
`localStorage`. Situs tidak pernah blank.

**Render progresif:** konten tampil dari cache lokal dulu, lalu disinkronkan
dari Firestore.

### 2.2 Tiga bug besar yang sudah diperbaiki

**Bug 1 — Nama release rules salah**

Firebase CLI gagal karena service account tidak punya izin
`serviceusage.services.get`. Deploy lewat REST API juga gagal berulang (404),
karena nama release sebenarnya **`cloud.firestore/default`**, bukan
`cloud.firestore`. Firestore Enterprise menambahkan segmen nama database.

**Bug 2 — ID database tidak cocok** 🔴 paling berbahaya

Database dibuat lewat Google Cloud Console → ID-nya **`default`** (tanpa
kurung). SDK web Firebase mencari **`(default)`**. Keduanya database berbeda,
dan `(default)` tidak ada. Akibatnya situs akan error
`database (default) does not exist` lalu **diam-diam jatuh ke mode lokal** —
data tidak lintas perangkat tanpa ada peringatan.

Diperbaiki lewat `databaseId` di config + `applyDatabaseId()` di adapter.

**Bug 3 — Celah keamanan `admin123`**

Dulu, kalau Firebase gagal di situs online, siapa pun bisa login admin dengan
`admin123`. Sekarang dibatasi hanya untuk `localhost` / `127.0.0.1` / `file://`.

### 2.3 Data sensitif dipindahkan ke `.env`

| Sebelum | Sesudah |
| --- | --- |
| `const DEMO_PASSWORD = "admin123"` di `server/auth.js` | `ADMIN_DEMO_PASSWORD` di `.env` |
| `"admin123"` di `js/storage.js` & `js/admin.js` | `FIREBASE_DEMO_PASSWORD` lewat config |
| Konfigurasi Firebase ditulis di `js/firebase-config.js` | Dihasilkan dari `.env` via `npm run config` |

**Prinsip fail-closed:** kalau `.env` kosong, fitur **dimatikan**, bukan memakai
nilai bawaan yang lemah. Sudah diuji: tanpa `ADMIN_DEMO_PASSWORD`, login backend
ditolak total; tanpa `FIREBASE_DEMO_PASSWORD`, login demo frontend ditolak.

**File yang tidak di-commit:** `.env`, `js/firebase-config.js`
**File yang di-commit:** `.env.example` (nama variabel tanpa nilai)

### 2.4 Hasil pengujian

```
api                 101 lulus, 0 gagal
storage              30 lulus, 0 gagal
form                 29 lulus, 0 gagal
dom                  46 lulus, 0 gagal
firebase-mock        38 lulus, 0 gagal
firebase-integration 19 lulus, 0 gagal
firebase-offline     33 lulus, 0 gagal
```

Uji keamanan dari luar (tanpa login):

| Yang diuji | Hasil |
| --- | --- |
| Baca daftar laporan | ✅ 200 |
| Baca koleksi lain | ✅ 403 |
| Hapus laporan | ✅ 403 |
| Ubah status | ✅ 403 |
| Kirim laporan valid | ✅ 200 |
| Kirim laporan asal-asalan | ✅ 403 |
| Turunkan nomor urut | ✅ 403 |

---

## 3. Yang masih KURANG

Diurutkan dari yang paling penting.

### 3.1 🔴 Email admin di rules masih placeholder

```rules
"admin@temubalik.com"   // ← GANTI dengan email admin Anda
```

Selama belum diganti, **tidak ada yang bisa mengubah status atau menghapus
laporan**. Situs berfungsi untuk pengunjung, tapi panel admin tidak berguna.

**Perlu:** ganti dengan email asli → publish ulang rules.

### 3.2 🔴 3 file belum ter-deploy

Per 12 November 2026, file lokal berbeda dari yang live:

| File | Status |
| --- | --- |
| `js/firebase-config.js` | ❌ belum ter-deploy |
| `js/storage.js` | ❌ belum ter-deploy |
| `js/admin.js` | ❌ belum ter-deploy |
| `js/firebase-adapter.js` | ✅ sudah sama |

Artinya **struktur `.env` yang baru belum aktif di situs online**. Situs lama
masih jalan normal (tidak rusak), tapi masih memakai kode versi sebelumnya.

**Penyebab:** service account hilang saat `/tmp` dibersihkan dan sesi
`firebase login` tidak valid (`Failed to authenticate`).

**Perlu:**

```bash
cd temubalik
firebase login
npm run config        # pastikan js/firebase-config.js terbaru
firebase deploy --only hosting
```

### 3.3 🔴 Service account bocor, belum di-rotate

Kunci `firebase-adminsdk-fbsvc@temubalik-26f80.iam.gserviceaccount.com`
(key id `156e8e57bbce747679be2fe8fe28705287aac522`) sudah bocor lewat chat.

**Perlu:** hapus kunci lama di
<https://console.firebase.google.com/project/temubalik-26f80/settings/serviceaccounts/adminsdk>
lalu buat baru bila perlu.

### 3.4 ⚠️ Akun admin belum dibuat

Belum ada user di Firebase Authentication. Panel admin tidak bisa dipakai
sampai akun dibuat dan emailnya terdaftar di rules.

### 3.5 ⚠️ Batas ukuran foto tidak konsisten

| Lapisan | Batas |
| --- | --- |
| `js/form.js` (file asli) | 5 MB |
| `firestore.rules` (foto base64) | 4.000.000 byte |
| **Firestore (batas dokumen)** | **1.048.576 byte (1 MiB)** |

Rules mengizinkan foto yang **akan ditolak Firestore**. Base64 membengkak ~33%:

| Foto asli | Base64 | Hasil |
| --- | --- | --- |
| 500 KB | ~667 KB | ✅ aman |
| 700 KB | ~933 KB | ✅ aman |
| 800 KB | ~1067 KB | ❌ melebihi 1 MiB |
| 900 KB | ~1200 KB | ❌ melebihi 1 MiB |

Kompresi di `form.js` (1000px, q=0.72) biasanya menghasilkan ~200–400 KB,
jadi **kasus normal aman**. Tapi foto detail tinggi bisa gagal dengan pesan
error dari Firestore, bukan pesan yang ramah.

**Perlu:** turunkan batas rules ke ~900.000 byte, dan/atau tangkap error
`invalid-argument` di adapter lalu beri pesan "foto terlalu besar, coba foto lain".

### 3.6 ⚠️ Belum ada rate limit / App Check

Form bisa dibanjiri request. Belum ada reCAPTCHA / App Check.

**Perlu (kalau mulai disalahgunakan):** aktifkan Firebase App Check.

### 3.7 ⚠️ Backend `server/` tidak dipakai

Folder `server/` lengkap dan berfungsi, tapi **tidak dipakai** oleh situs
online (halaman memakai Firebase langsung). Tidak ikut ter-deploy.

**Keputusan yang perlu diambil:** hapus, atau pertahankan sebagai alternatif.

### 3.8 ℹ️ Data contoh masih tampil

10 laporan dari `data/data.json` selalu tampil sebagai contoh, bercampur
dengan laporan asli dari Firestore. Mungkin membingungkan pengguna asli.

**Perlu:** pertimbangkan menandai laporan contoh, atau hapus setelah ada data
asli.

---

## 4. Yang SALAH / perlu diperbaiki

### 4.1 ✅ `.env.example` tidak memuat variabel Firebase — SUDAH DIPERBAIKI

**Ditemukan:** `.env.example` hanya berisi variabel backend (`ADMIN_*`), tidak
ada `FIREBASE_*` sama sekali. Orang yang meng-clone repo lalu menjalankan
`npm run config` akan mendapat error "variabel belum diisi" tanpa tahu
variabel apa yang harus ditambahkan.

**Sudah diperbaiki:** bagian Firebase Web ditambahkan ke `.env.example`
(11 variabel: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`,
`FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`,
`FIREBASE_MEASUREMENT_ID`, `FIREBASE_DATABASE_ID`, `FIREBASE_COLLECTION`,
`FIREBASE_ENABLED`, `FIREBASE_DEMO_PASSWORD`).

Sudah diuji dengan clone bersih: `cp .env.example .env` → `npm run config`
memberi pesan jelas variabel mana yang kurang.

### 4.2 ✅ Tes bergantung pada `admin123` — SUDAH DIPERBAIKI

**Ditemukan:** `tests/dom.test.cjs`, `tests/firebase.test.cjs`,
`tests/interaksi.test.cjs`, dan `tests/browser.test.cjs` memakai `admin123`
sebagai nilai hardcode. Kalau `FIREBASE_DEMO_PASSWORD` diubah, tes gagal
padahal kode tidak salah.

**Sudah diperbaiki:** keempat tes kini membaca `demoPassword` dari
`js/firebase-config.js` lewat helper `readDemoPassword()`.

Diuji: mengganti nilai menjadi `sandi-uji-baru` → semua tes tetap lulus.

### 4.3 ✅ `js/firebase-config.js` bisa hilang saat deploy — SUDAH DIPERBAIKI

**Ditemukan:** file ini tidak di-commit (benar), tapi wajib ada saat deploy.
Kalau `firebase deploy` dijalankan tanpa `npm run config` lebih dulu, situs
ter-deploy **tanpa** `js/firebase-config.js` → semua halaman error
`TEMUBALIK_FIREBASE is not defined`.

**Sudah diperbaiki:** `firebase.json` kini punya hook:

```json
"hosting": {
  "predeploy": ["npm run config"]
}
```

Selain itu `scripts/**` dan `CATATAN-PROGRES.md` ditambahkan ke `ignore` agar
tidak ikut ter-upload.

### 4.4 ℹ️ Dokumentasi menyebut angka yang bisa basi

`README-deploy.md` menyebut "33 file ter-upload". Angka ini berubah setiap
kali ada file baru. Sebaiknya tidak menyebut angka pasti.

---

## 5. Langkah selanjutnya (urutan yang disarankan)

### Wajib — supaya situs benar-benar berfungsi

1. **Ganti email admin** di `firestore.rules` → publish
2. **Buat akun admin** di Firebase Authentication
3. **Deploy ulang** (`firebase login` → `firebase deploy --only hosting`)
4. **Rotasi service account** yang bocor

### Sebaiknya — memperkuat

5. Samakan batas ukuran foto (poin 3.5)
6. Commit perubahan yang belum masuk (lihat §8)
7. Pertimbangkan `npm run config` dijalankan otomatis saat build CI

### Opsional — kalau mau lanjut

8. Aktifkan App Check kalau mulai disalahgunakan
9. Pindahkan foto ke Firebase Storage (butuh paket Blaze)
10. Putuskan nasib folder `server/`
11. Tandai atau hapus data contoh setelah ada data asli

---

## 6. Cara memverifikasi sendiri

**Cek situs online masih hidup:**

```bash
for u in / /daftar.html /lapor.html /admin.html; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://temubalik-26f80.web.app$u)  $u"
done
```

**Cek Firebase aktif** (buka Console browser di situs):

```js
FirebaseStore.mode()     // "firebase" atau "local"
FirebaseStore.reason()   // alasan kalau tidak aktif
```

**Cek rules bekerja** (dari terminal):

```bash
K=AIzaSy...   # apiKey dari .env
B="https://firestore.googleapis.com/v1/projects/temubalik-26f80/databases/default/documents"

# harus 200 (baca diizinkan)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B:runQuery?key=$K" \
  -H "Content-Type: application/json" \
  -d '{"structuredQuery":{"from":[{"collectionId":"reports"}],"limit":1}}'

# harus 403 (koleksi lain ditolak)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B:runQuery?key=$K" \
  -H "Content-Type: application/json" \
  -d '{"structuredQuery":{"from":[{"collectionId":"rahasia"}],"limit":1}}'
```

**Jalankan semua tes:**

```bash
# butuh server di port 3200 dan 8899
PORT=3200 node server/server.js &
node -e "require('http').createServer((q,s)=>require('fs').createReadStream('index.html').pipe(s)).listen(8899)" &

node tests/api.test.cjs
node tests/storage.test.cjs
node tests/form.test.cjs
node tests/dom.test.cjs
node tests/firebase-mock.test.cjs
node tests/firebase-integration.test.cjs
node tests/firebase.test.cjs
```

---

## 7. Catatan teknis yang mudah dilupakan

- **Database ID `default`** (tanpa kurung), lokasi `nam5`, tipe Enterprise.
  Tidak bisa diubah. Kalau database dibuat ulang lewat Firebase Console,
  ID-nya jadi `(default)` dan `FIREBASE_DATABASE_ID` harus disesuaikan.
- **Rules release:** `projects/temubalik-26f80/releases/cloud.firestore/default`
- **Publish rules via REST** (kalau CLI gagal karena izin `serviceusage`):
  `PATCH /v1/{release}?updateMask=rulesetName` dengan body
  `{ "release": { "name": "...", "rulesetName": "..." } }`
- **Deploy hosting via REST** (kalau CLI gagal): buat versi → `populateFiles`
  → unggah **gzip level 9** (hash = sha256 dari konten **ter-gzip**) →
  `PATCH status=FINALIZED` → buat release.
- **`prestart` sudah ada** di `package.json` sehingga `npm start` otomatis
  menjalankan `npm run config`.
- **`.env` dibaca** oleh `server/env.js` (tanpa dependency, karena Node 18
  belum punya `--env-file`). Variabel yang sudah ada di shell tidak ditimpa.

---

## 8. Perubahan yang belum di-commit

Per 12 November 2026, working tree berisi perubahan dari sesi perbaikan ini:

| File | Perubahan |
| --- | --- |
| `.env.example` | +11 variabel `FIREBASE_*` (sebelumnya tidak ada) |
| `firebase.json` | +`predeploy: npm run config`, ignore `scripts/**` & `CATATAN-PROGRES.md` |
| `tests/dom.test.cjs` | baca `demoPassword` dari config, bukan hardcode |
| `tests/firebase.test.cjs` | idem |
| `tests/interaksi.test.cjs` | idem |
| `tests/browser.test.cjs` | idem |
| `CATATAN-PROGRES.md` | file baru (dokumen ini) |

**Perlu:**

```bash
git add -A
git commit -m "chore: lengkapi .env.example, predeploy hook, tes tidak hardcode sandi"
```

Setelah commit, deploy ulang agar situs memakai kode terbaru.

---

## 9. Riwayat sesi

| Tanggal | Yang dikerjakan |
| --- | --- |
| 11 Nov 2026 | Integrasi Firebase, perbaikan database ID, publish rules, deploy hosting |
| 11 Nov 2026 | Pindahkan data sensitif ke `.env` + fail-closed |
| 12 Nov 2026 | Audit, lengkapi `.env.example`, `predeploy` hook, tes tidak hardcode, catatan ini |
