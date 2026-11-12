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
| Security Rules | ✅ terpublish & aktif, ⚠️ email admin masih placeholder |
| Hosting online | ✅ live, ⚠️ **kode live masih versi lama** (§3.2) |
| Data sensitif ke `.env` | ✅ selesai di kode, ⚠️ belum live |
| Uji otomatis | ✅ 296 pemeriksaan lulus |
| Commit | ⚠️ ada perubahan belum di-commit (§8) |

**Alamat situs:** <https://temubalik-26f80.web.app>

**Status fungsi per 12 Nov 2026 (hasil uji langsung ke situs live):**

| Fungsi | Status | Bukti |
| --- | --- | --- |
| Halaman tampil | ✅ 7/7 halaman | semua HTTP 200 |
| Firebase tersambung | ✅ | `Store.mode()` → `"firebase"` |
| Baca daftar laporan | ✅ | 10 laporan contoh tampil |
| Kirim laporan | ✅ masuk Firestore | uji POST → 200 |
| Ubah status tanpa login | ✅ ditolak | 403 |
| Hapus tanpa login | ✅ ditolak | 403 |
| Baca koleksi lain | ✅ ditolak | 403 |
| Login Google (tombol) | ✅ muncul | `canUseGoogle()` → `true` |
| Login admin (email) | ❌ belum bisa | belum ada akun + email rules placeholder |

**Catatan penting soal "laporan contoh":** daftar laporan di situs live
menampilkan **10 laporan dari `data/data.json`** (data contoh bawaan repo),
bukan data pengguna. Firestore saat ini hanya berisi **1 dokumen**, yaitu
laporan uji saya `LPR-CEK-171929` (§3.9).

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

Diurutkan dari yang paling penting. Tanda: 🔴 wajib · ⚠️ sebaiknya · ℹ️ info · ✅ sudah diperbaiki.

**Ringkas — 3 hal wajib yang belum selesai:**

| # | Hal | Kenapa penting |
| --- | --- | --- |
| §3.2 | Kode live masih versi lama | Semua perbaikan tidak terasa di situs |
| §3.1 | Email admin masih placeholder | Panel admin tidak bisa dipakai siapa pun |
| §3.3 | Service account bocor | Kunci akses penuh belum dicabut |

### 3.1 🔴 Email admin di rules masih placeholder

```rules
"admin@temubalik.com"   // ← GANTI dengan email admin Anda
```

Selama belum diganti, **tidak ada yang bisa mengubah status atau menghapus
laporan**. Situs berfungsi untuk pengunjung, tapi panel admin tidak berguna.

**Perlu:** ganti dengan email asli → publish ulang rules.

### 3.2 🔴 Deploy terakhir belum membawa kode terbaru

Per 12 November 2026 pukul 17:20, saya verifikasi ulang ke situs live.
Hasilnya **kode live masih versi LAMA**:

| File | Live | Lokal |
| --- | --- | --- |
| `js/storage.js` | masih `if (String(password) !== "admin123")` | pakai `demoPassword()` |
| `js/admin.js` | masih hardcode `admin123` | baca dari config |
| `js/firebase-config.js` | versi lama (bukan hasil generate) | hasil generate `.env` |

**Bukti paling kuat:** header `last-modified` **SEMUA** file live (index.html,
admin.html, daftar.html, storage.js, admin.js, firebase-config.js,
firebase-adapter.js, utils.js, style.css) bernilai **identik**:
`Wed, 11 Nov 2026 11:13:02 GMT`.

Timestamp yang sama untuk semua file hanya mungkin kalau seluruh situs
diunggah dalam satu operasi — yaitu deploy pertama. Deploy baru akan memberi
timestamp baru, minimal pada file yang berubah.

**Artinya:** perubahan `.env`, `predeploy`, dan perbaikan tes **belum aktif
di situs online**. Situs lama tetap jalan normal (tidak rusak), tapi masih
memakai kode sebelum `.env`.

**Kemungkinan penyebab:**

1. `firebase deploy` dijalankan dari folder lain (bukan root proyek)
2. Deploy berhenti sebelum tahap hosting (mis. hanya `--only firestore:rules`)
3. `firebase deploy` gagal di `predeploy` karena `.env` tidak ada di mesin itu
4. Yang ter-deploy adalah salinan lama (mis. hasil clone sebelumnya)
5. Deploy dijalankan di mesin/perangkat lain yang isi foldernya belum
   diperbarui (mis. hasil `git pull` sebelum commit terakhir)

**Cara memastikan sudah benar:**

```bash
cd temubalik
npm run config                      # harus sukses dulu
firebase deploy --only hosting      # perhatikan "Deploy complete!"
```

Setelah itu verifikasi — harus muncul **1 baris per file**, bukan "BEDA":

```bash
for f in js/storage.js js/admin.js js/firebase-config.js; do
  r=$(curl -s "https://temubalik-26f80.web.app/$f" | sha256sum | cut -d' ' -f1)
  l=$(sha256sum "$f" | cut -d' ' -f1)
  [ "$r" = "$l" ] && echo "SAMA  $f" || echo "BEDA  $f"
done
```

Cek juga timestamp-nya sudah berubah:

```bash
curl -sI https://temubalik-26f80.web.app/js/storage.js | grep -i last-modified
```

Kalau masih BEDA, cek `firebase.json` punya `predeploy` dan pastikan `.env`
ada di folder yang sama saat deploy.

### 3.3 🔴 Service account bocor, belum di-rotate

Kunci `firebase-adminsdk-fbsvc@temubalik-26f80.iam.gserviceaccount.com`
(key id `156e8e57bbce747679be2fe8fe28705287aac522`) sudah bocor lewat chat.

**Perlu:** hapus kunci lama di
<https://console.firebase.google.com/project/temubalik-26f80/settings/serviceaccounts/adminsdk>
lalu buat baru bila perlu.

### 3.4 ⚠️ Akun admin belum dibuat

Belum ada user di Firebase Authentication. Panel admin tidak bisa dipakai
sampai akun dibuat dan emailnya terdaftar di rules.

### 3.5 ✅ Batas ukuran foto tidak konsisten — SUDAH DIPERBAIKI

**Ditemukan:** ada tiga lapisan batas yang tidak saling cocok.

| Lapisan | Batas lama | Batas baru |
| --- | --- | --- |
| `js/form.js` (file asli) | 5 MB | 5 MB (tidak berubah) |
| Kompresi hasil (`form.js`) | hanya 1 percobaan (1000px, q=0.72) | 4 percobaan bertahap |
| `firestore.rules` (foto base64) | 4.000.000 byte | **700.000 byte** |
| **Firestore (batas dokumen)** | **1.048.576 byte (1 MiB)** | idem |

Rules lama mengizinkan foto yang **pasti ditolak Firestore**. Base64 membengkak
~33%:

| Foto asli | Base64 | Hasil |
| --- | --- | --- |
| 500 KB | ~667 KB | ✅ aman |
| 700 KB | ~933 KB | ❌ melebihi batas baru 700 KB |
| 800 KB | ~1067 KB | ❌ melebihi 1 MiB |
| 900 KB | ~1200 KB | ❌ melebihi 1 MiB |

**Sudah diperbaiki (12 Nov 2026):**

1. `js/form.js` — kompresi kini **bertahap**: 1000px/q0.72 → 900px/q0.62 →
   800px/q0.52 → 640px/q0.45. Berhenti begitu hasilnya ≤ 700 KB. Kalau semua
   percobaan masih terlalu besar, pengguna dapat pesan yang jelas — bukan
   error Firestore.
2. `js/form.js` — error `invalid-argument` / "too large" saat menyimpan
   diterjemahkan menjadi "Laporan terlalu besar untuk disimpan. Coba lampirkan
   foto yang lebih kecil."
3. `firestore.rules` — batas foto diturunkan `4.000.000` → `700.000` agar
   sejalan dengan frontend.

Sudah diuji: semua 296 pemeriksaan tetap lulus, dan logika pemilihan
percobaan kompresi disimulasikan (foto besar → jatuh ke 640px → 588 KB, aman).

**Sisa risiko:** rules versi baru ini **belum dipublish**. Sampai dipublish,
rules lama (4.000.000) masih aktif di server.

### 3.6 ⚠️ Belum ada rate limit / App Check

Form bisa dibanjiri request. Belum ada reCAPTCHA / App Check.

**Perlu (kalau mulai disalahgunakan):** aktifkan Firebase App Check.

### 3.7 ⚠️ Backend `server/` tidak dipakai

Folder `server/` lengkap dan berfungsi, tapi **tidak dipakai** oleh situs
online (halaman memakai Firebase langsung). Tidak ikut ter-deploy.

**Keputusan yang perlu diambil:** hapus, atau pertahankan sebagai alternatif.

### 3.8 ℹ️ Data contoh masih tampil — dan saat ini itu SELURUH isi daftar

**Fakta per 12 Nov 2026:**

| Sumber | Jumlah |
| --- | --- |
| `data/data.json` (data contoh repo) | **10 laporan** |
| Firestore `reports` | **1 dokumen** (`LPR-CEK-171929`, laporan uji saya) |

Jadi daftar laporan di situs live saat ini **hanya menampilkan data contoh**,
bukan data pengguna nyata. Ini bukan bug — memang begitu desainnya — tapi
penting diketahui supaya tidak salah kira situs sudah "berisi".

**Risiko kalau dibiarkan setelah dipakai publik:** pengunjung bisa mengira
10 barang itu benar-benar hilang di kampus, lalu menghubungi nomor yang tidak
ada. Nama pelapor & nomor WhatsApp di `data/data.json` adalah data fiktif.

**Perlu (pilih salah satu):**

1. Beri label jelas "Contoh" pada kartu yang berasal dari `data/data.json`
2. Kosongkan `data/data.json` (`[]`) setelah ada laporan asli
3. Pertahankan sebagai demo, tapi tampilkan hanya di mode lokal

Cara membedakan: laporan contoh punya ID berawalan `LPR-20260210` s/d
`LPR-20260215`. Laporan asli memakai tanggal hari ini.

### 3.9 🧹 Ada 1 laporan uji tertinggal di Firestore

Saat memverifikasi keamanan produksi pada 12 Nov 2026, saya membuat laporan
uji lewat API:

```
ID: LPR-CEK-171929   ("Uji Verifikasi")
```

Laporan ini **masih ada** di Firestore karena service account sudah tidak
tersedia untuk menghapusnya (hapus butuh admin).

**Perlu:** hapus manual di
<https://console.firebase.google.com/project/temubalik-26f80/firestore/data>
→ koleksi `reports` → dokumen `LPR-CEK-171929`.

### 3.10 ✅ Tombol "Masuk dengan Google" ADA di situs live — koreksi catatan

**Catatan sebelumnya salah.** Saya pernah menulis tombol Google tidak muncul,
berdasarkan screenshot. Setelah diperiksa lebih teliti, **tombolnya ada** —
screenshot hanya diambil terlalu cepat, sebelum Firebase selesai inisialisasi.

Bukti (12 Nov 2026):

1. `admin.html` live memuat `<div id="googleWrap" class="hidden">` dan
   `<button id="googleBtn">` — sama persis dengan lokal.
2. `js/admin.js` live sudah memuat kode `Store.canUseGoogle()`.
3. `js/storage.js` live sudah punya `signInAdminWithGoogle()` dan `canUseGoogle()`.
4. Uji DOM langsung ke `https://temubalik-26f80.web.app/admin.html`:
   `Store.canUseGoogle()` → `true`.
5. Screenshot dengan jeda inisialisasi menampilkan tombol
   "Masuk dengan Google" di bawah tombol Masuk.

**Yang perlu diketahui:** tombol muncul **setelah** Firebase selesai
inisialisasi (bisa 1–3 detik pada koneksi lambat). Ini perilaku normal, bukan bug.

**Sisa pekerjaan:** belum ada akun admin di Firebase Authentication, jadi
tombol itu belum bisa dipakai sampai akun dibuat (§3.4) dan emailnya
didaftarkan di rules (§3.1).

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

### 4.5 ✅ Catatan ini sempat memuat 2 kesalahan — SUDAH DIKOREKSI

Supaya tidak terulang, dicatat apa yang salah:

**Kesalahan 1 — "tombol Google tidak muncul".**

Saya menyimpulkan itu dari screenshot tanpa menunggu Firebase selesai
inisialisasi. Setelah diuji ulang, tombolnya **ada dan berfungsi**
(§3.10). Pelajarannya: screenshot headless tidak menunggu JavaScript async.

**Kesalahan 2 — "10 laporan contoh bercampur dengan data asli".**

Saya menulis seolah Firestore sudah berisi banyak laporan pengguna. Kenyataan:
Firestore hanya berisi **1 dokumen** (laporan uji saya). 10 laporan yang
tampil seluruhnya berasal dari `data/data.json` (§3.8).

---

## 5. Langkah selanjutnya (urutan yang disarankan)

### Wajib — supaya situs benar-benar berfungsi

1. **Commit dulu** perubahan yang ada (§8) — supaya deploy berikutnya
   membawa kode terbaru, bukan versi lama lagi.
2. **Deploy ulang dengan benar** — kode live masih versi lama (§3.2).
   Tanpa ini, semua perbaikan berikutnya tidak akan terasa.
3. **Ganti email admin** di `firestore.rules` baris 36 → publish rules
4. **Buat akun admin** di Firebase Authentication (email harus sama dengan
   yang di rules)
5. **Publish rules baru** yang membatasi foto 700 KB (§3.5)
6. **Hapus laporan uji** `LPR-CEK-171929` (§3.9)
7. **Rotasi service account** yang bocor (§3.3)

### Sebaiknya — memperkuat

8. Putuskan nasib data contoh di `data/data.json` (§3.8) sebelum situs
   dipromosikan ke pengguna nyata
9. Pertimbangkan `npm run config` dijalankan otomatis saat build CI

### Opsional — kalau mau lanjut

10. Aktifkan App Check kalau mulai disalahgunakan
11. Pindahkan foto ke Firebase Storage (butuh paket Blaze)
12. Putuskan nasib folder `server/`

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
| `js/form.js` | kompresi foto bertahap + pesan error yang ramah |
| `firestore.rules` | batas foto `4.000.000` → `700.000` |
| `CATATAN-PROGRES.md` | file baru (dokumen ini) |

**Perlu:**

```bash
git add -A
git commit -m "fix: batas foto selaras Firestore, .env.example lengkap, tes tidak hardcode sandi"
```

Setelah commit, deploy ulang agar situs memakai kode terbaru:

```bash
npm run config
firebase deploy --only hosting
firebase deploy --only firestore:rules   # untuk batas foto 700 KB
```

**Penting:** commit dulu, baru deploy. Kalau deploy dari mesin lain, pastikan
mesin itu sudah `git pull` supaya kode terbaru ikut.

---

## 9. Riwayat sesi

| Tanggal | Yang dikerjakan |
| --- | --- |
| 11 Nov 2026 | Integrasi Firebase, perbaikan database ID, publish rules, deploy hosting |
| 11 Nov 2026 | Pindahkan data sensitif ke `.env` + fail-closed |
| 12 Nov 2026 | Audit, lengkapi `.env.example`, `predeploy` hook, tes tidak hardcode, catatan ini |
| 12 Nov 2026 | Verifikasi live: rules aktif & aman; ditemukan kode live masih versi lama (§3.2) |
| 12 Nov 2026 | Uji DOM & screenshot ke situs live: Firebase aktif, tombol Google ada (koreksi §3.10) |
| 12 Nov 2026 | Perbaiki batas foto: kompresi bertahap + rules 700 KB (§3.5) |
