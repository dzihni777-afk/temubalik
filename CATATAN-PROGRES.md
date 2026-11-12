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
| Security Rules | ✅ terpublish & aktif (UID + email admin terdaftar) |
| Hosting online | ✅ live, kode lokal = live (hash identik) |
| Data sensitif ke `.env` | ✅ selesai & live |
| Uji otomatis | ✅ 323 pemeriksaan lulus |
| Commit | ✅ semua ter-commit & ter-push |

**Alamat situs:** <https://temubalik-26f80.web.app>

**Status fungsi per 12 Nov 2026 (hasil uji langsung ke produksi):**

| Fungsi | Status | Bukti |
| --- | --- | --- |
| Halaman tampil | ✅ 7/7 halaman | semua HTTP 200 |
| Firebase tersambung | ✅ | `Store.mode()` → `"firebase"` |
| Baca daftar laporan | ✅ | 10 laporan contoh tampil + label CONTOH |
| Kirim laporan | ✅ masuk Firestore | uji POST → 200 |
| Ubah status tanpa login | ✅ ditolak | 403 |
| Ubah status sebagai admin | ✅ diterima | 200 (token UID admin) |
| Hapus tanpa login | ✅ ditolak | 403 |
| Hapus sebagai admin | ✅ diterima | 200 (token UID admin) |
| Foto > 700 KB | ✅ ditolak rules | 403 |
| Foto normal | ✅ diterima | 200 |
| Login Google (tombol) | ✅ tampil & provider aktif | screenshot + `createAuthUri` |
| Login admin (email) | ✅ berhasil, termasuk saat Firestore mati | form terisi → panel admin terbuka |
| Login admin (Google) | ✅ tombol tampil, provider aktif | `createAuthUri` → authUri |

**Akun admin:** UID `VHG3YKblzHQzqK0LCVpaKpAbquL2`, email
`r9723419@gmail.com`.

**Catatan soal "laporan contoh":** daftar laporan menampilkan **10 laporan
dari `data/data.json`** yang **digabung** dengan isi Firestore. Firestore
sendiri saat ini **0 dokumen**. Setiap kartu contoh diberi label **CONTOH**
supaya tidak dikira laporan nyata.


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

**Bug 4 — Data contoh hilang setelah sync** ✅ diperbaiki 12 Nov 2026

`getAllProgressive()` memanggil `onData(local)` lalu `onData(remote)`.
Panggilan kedua **mengganti** seluruh daftar, jadi begitu Firestore (yang
masih kosong) menjawab, 10 laporan contoh lenyap dan halaman menampilkan
"0 laporan". Sekarang hasilnya **digabung**, dan kartu contoh diberi label
CONTOH. Detail di §3.8.

**Bug 5 — "Firebase tidak dapat dihubungi, jadi login admin dinonaktifkan"**
✅ diperbaiki 12 Nov 2026

Gejala: saat login email + kata sandi di situs live, muncul pesan itu dan admin
tidak bisa masuk — padahal akun & sandinya benar. Kadang berhasil kalau dicoba
ulang. Ini **bukan** masalah koneksi pengguna, melainkan tiga bug logika yang
saling menumpuk:

| # | Bug | Letak | Akibat |
| --- | --- | --- | --- |
| A | Batas waktu tidak sinkron | `storage.js` `FIREBASE_TIMEOUT_MS = 6000` vs adapter `OP_TIMEOUT_MS = 8000` | login menyerah di detik 6, padahal probe Firestore baru sukses di detik 7 |
| B | Analytics menahan status siap | `firebase-adapter.js` — `state.ok = true` ditulis **setelah** `await loadScript(analytics)` tanpa timeout | analytics diblokir pemblokir iklan → `init()` tak pernah selesai → login mati permanen |
| C | Firestore mematikan Auth | `fb()` mengembalikan `null` kalau `state.degraded` | satu baca Firestore timeout → login diblokir, padahal Auth sehat dan tidak butuh Firestore |

Perbaikannya — **memisahkan Auth dari Firestore**:

- `state.authReady` di-set **sebelum** probe Firestore, jadi Auth siap lebih dulu.
- `state.ok = true` dipindah **sebelum** analytics; analytics jadi
  *fire-and-forget* dengan `withTimeout()` sendiri.
- Helper baru `waitAuth(timeoutMs = 20000)` di adapter + `firebaseAuthReady()`
  dan `fbAuth()` di `storage.js`. Semua jalur admin (`signInAdmin`,
  `signInAdminWithGoogle`, `isAdmin`, `waitAdmin`, `adminEmail`,
  `onAdminChange`, `signOutAdmin`, `canUseGoogle`) memakai jalur Auth.
- `signIn()` / `signInWithGoogle()` memakai `waitAuth()` dan menyertakan
  `state.reason` di pesan error.
- `admin.js`: tiga kondisi dibedakan — *masih memuat* / *gagal terhubung
  (tampilkan alasan asli)* / *kredensial salah*. Ditambah pemetaan
  `popup-blocked` dan `popup-closed-by-user`.

**Yang TIDAK dilonggarkan:** guard `isLocalHost()` + sandi demo tetap utuh.
Sandi demo tetap hanya berlaku di localhost, dan tetap ditolak di domain publik
walau Firebase mati. Diuji eksplisit di §2.4.

**Bukti uji di browser sungguhan (Firefox headless):** dengan proxy yang
menahan koneksi `firestore.googleapis.com` sampai probe timeout, hasilnya
`isReady=false` + alasan *"Uji koneksi Firestore melebihi batas waktu 8000ms"*
tetapi `isAuthReady=true` → **login berhasil** dan panel admin terbuka berisi
10 laporan. Dulu kondisi ini pasti menolak login.

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
storage              43 lulus, 0 gagal   (+13 tes regresi login)
form                 29 lulus, 0 gagal
dom                  46 lulus, 0 gagal
firebase-mock        52 lulus, 0 gagal   (+14 tes regresi login)
firebase-integration 19 lulus, 0 gagal
firebase-offline     33 lulus, 0 gagal   (file: tests/firebase.test.cjs)
```

**Total: 323 pemeriksaan, 0 gagal.**

Tes regresi baru untuk Bug 5 (§2.2):

| Yang diuji | Hasil |
| --- | --- |
| `state.ok` tetap `true` walau analytics gagal dimuat | ✅ |
| `signIn` berhasil saat Firestore gagal / degraded | ✅ |
| `signInAdmin` tidak menyerah saat Auth baru siap belakangan | ✅ |
| `waitAdmin` / `isAdmin` / `adminEmail` membaca sesi lewat Auth | ✅ |
| Domain publik + Firebase mati → **ditolak** (fail-closed) | ✅ |
| Domain publik + Auth gagal → sandi demo **ditolak** | ✅ |
| `localhost` + sandi demo benar → diterima | ✅ |
| `localhost` + sandi demo salah → ditolak | ✅ |
| `FIREBASE_DEMO_PASSWORD` kosong → login demo mati | ✅ |

Uji login di browser sungguhan (Firefox headless):

| Skenario | Hasil |
| --- | --- |
| Login email + sandi benar (lokal, port 8891) | ✅ panel admin terbuka |
| Login email + sandi salah | ✅ "Email atau kata sandi salah. Coba lagi." |
| Login saat Firestore **timeout** (proxy menahan 25 s) | ✅ berhasil — inilah bug aslinya |
| Halaman `/admin` live | ✅ HTTP 200, tombol Google tampil, tanpa error JS |

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

**Ringkas — yang wajib belum selesai:**

| # | Hal | Kenapa penting |
| --- | --- | --- |
| §3.3 | Service account bocor | Kunci akses penuh belum dicabut |
| §3.6 | Belum ada rate limit / App Check | Siapa pun bisa membanjiri laporan |

Sudah beres: §3.1 (email admin di rules), §3.2 (rules dipublish),
§3.4 (akun admin bisa login), §3.8 (data contoh hilang setelah sync).

### 3.1 ✅ Email admin di rules sudah diisi & dipublish

```rules
"r9723419@gmail.com"
```

**Sudah diperbaiki & dipublish 12 Nov 2026.** Ruleset aktif sudah memuat
UID admin `VHG3YKblzHQzqK0LCVpaKpAbquL2` dan email di atas.

Diverifikasi langsung ke Firestore produksi:

| Uji | Hasil |
| --- | --- |
| Ubah status tanpa login | 403 |
| Ubah status sebagai admin (UID) | 200 |
| Hapus tanpa login | 403 |
| Hapus sebagai admin (UID) | 200 |

### 3.2 ✅ Deploy terakhir sudah membawa kode terbaru

Catatan lama menyebut kode live masih versi lama (semua `last-modified`
identik `Wed, 11 Nov 2026 11:13:02 GMT`). **Itu sudah tidak berlaku.**

Per 12 November 2026, deploy hosting sudah dijalankan ulang dan diverifikasi
byte-per-byte: hash `index.html`, `tentang.html`, `admin.html`, `lapor.html`
di situs live **sama** dengan file lokal. `js/firebase-config.js` live juga
identik dengan hasil `npm run config`.

### 3.3 🔴 Service account bocor, belum di-rotate

Kunci `firebase-adminsdk-fbsvc@temubalik-26f80.iam.gserviceaccount.com`
(key id `156e8e57bbce747679be2fe8fe28705287aac522`) sudah bocor lewat chat.

**Perlu:** hapus kunci lama di
<https://console.firebase.google.com/project/temubalik-26f80/settings/serviceaccounts/adminsdk>
lalu buat baru bila perlu.

### 3.4 ✅ Akun admin siap dipakai

**Koreksi catatan lama:** akun admin **sudah ada**. Isinya:

| Field | Nilai |
| --- | --- |
| UID | `VHG3YKblzHQzqK0LCVpaKpAbquL2` |
| Email | `r9723419@gmail.com` |
| Provider | email/password |
| Email terverifikasi | ✅ ya |
| Kata sandi | ✅ sudah diatur |
| Status | aktif (tidak disabled) |

Jadi **bukan** `dzihni777@gmail.com` seperti yang sempat ditulis di
dokumentasi. Semua dokumen sudah dikoreksi.

**Sudah diuji 12 Nov 2026:**

1. `accounts:signInWithPassword` → **HTTP 200**, token berisi UID yang benar.
2. Token itu dipakai mengubah status laporan → **200**, menghapus → **200**.
3. Uji alur UI di browser sungguhan (Firefox): form diisi, tombol **Masuk**
   ditekan, panel admin **terbuka** (bukan pesan error).

Kata sandi disimpan di `.env` (`ADMIN_PASSWORD`), file yang di-ignore git.
Bisa juga masuk lewat tombol **Masuk dengan Google** tanpa kata sandi.

> ⚠️ **Kata sandi ini sudah pernah tampil di chat.** Anggap sudah setengah
> bocor. Sebaiknya ganti setelah Anda sempat login pertama kali:
> <https://console.firebase.google.com/project/temubalik-26f80/authentication/users>
> → pilih user → **Reset password**. Setelah diganti, perbarui juga
> `ADMIN_PASSWORD` di `.env` (atau hapus barisnya kalau tidak dipakai lagi).

**Cara mengganti kata sandi:**
<https://console.firebase.google.com/project/temubalik-26f80/authentication/users>
→ pilih user → **Reset password**.


### 3.4b ✅ Login Google sudah aktif

Sempat saya duga provider Google belum aktif karena `/config` hanya
menampilkan `email`. Ternyata provider Google dikelola di endpoint terpisah
(`defaultSupportedIdpConfigs/google.com`), dan statusnya **enabled: true**
dengan `clientId` + `clientSecret` terisi.

Diverifikasi dua cara:

1. `accounts:createAuthUri` dengan `providerId: "google.com"` mengembalikan
   `authUri` — artinya Google siap dipakai.
2. Screenshot halaman `/admin` di browser sungguhan menampilkan tombol
   **Masuk dengan Google** beserta logo Google.


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

### 3.8 ✅ Data contoh hilang setelah sync — SUDAH DIPERBAIKI

**Gejala:** beranda menampilkan "0 total laporan" dan halaman Daftar kosong,
padahal `data/data.json` berisi 10 laporan contoh. Begitu Firestore (yang
masih kosong) menjawab, seluruh daftar berubah jadi kosong.

**Penyebab:** `getAllProgressive()` di `js/storage.js` memanggil
`onData(LocalStore.getAll())` lalu `onData(remote.getAll())`. Panggilan kedua
**mengganti** seluruh daftar, bukan menggabung. Karena Firestore kosong,
hasil akhirnya 0 baris.

**Perbaikan (12 Nov 2026):**

1. `getAllProgressive()` sekarang **menggabungkan** data Firebase + lokal.
   Laporan Firebase menang kalau ID-nya sama, sisanya tetap tampil.
   Kalau Firebase kosong, data contoh tidak dihapus.
2. `LocalStore.getAll()` menandai laporan dari `data/data.json` dengan
   `_contoh: true`.
3. Kartu laporan di beranda, Daftar, dan Detail diberi label **CONTOH**
   (kelas `.badge-contoh`, posisi kanan atas) supaya pengunjung tidak
   mengira itu barang hilang sungguhan.

**Hasil terverifikasi di situs live:** beranda menampilkan **10 total,
8 masih dicari, 2 sudah kembali**; halaman Daftar menampilkan
"Menampilkan 9 dari 10 laporan" dengan label CONTOH di setiap kartu.

**Sisa risiko (ℹ️):** nama pelapor, NIM, email, dan nomor WhatsApp di
`data/data.json` adalah **data fiktif**. Selama data contoh masih tampil,
jangan gunakan nomor di dalamnya untuk kontak nyata. Kalau nanti sudah ada
laporan asli dan ingin data contoh disembunyikan, cukup kosongkan
`data/data.json` menjadi `[]`.


### 3.9 ✅ Tidak ada laporan uji tertinggal

Semua laporan uji sudah dihapus. Diverifikasi lewat `runQuery` ke Firestore
produksi: koleksi `reports` berisi **0 dokumen**.

Laporan uji yang dibuat & dihapus selama pengerjaan:
`LPR-CEK-171929`, `LPR-UJI-BESAR-174450`, `LPR-OK-182453`,
`LPR-ADM-183446`, `LPR-VER-*`.


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

**Sudah bisa dipakai.** Akun `r9723419@gmail.com` ada di Firebase Auth dan
emailnya terdaftar di rules, jadi tombol **Masuk dengan Google** langsung
dikenali sebagai admin (§3.4).

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

### 4.5 ✅ Catatan ini sempat memuat 3 kesalahan — SUDAH DIKOREKSI

Supaya tidak terulang, dicatat apa yang salah:

**Kesalahan 1 — "tombol Google tidak muncul".**

Saya menyimpulkan itu dari screenshot tanpa menunggu Firebase selesai
inisialisasi. Setelah diuji ulang dengan jeda yang cukup, tombolnya **ada
dan berfungsi** (§3.10). Pelajarannya: screenshot headless tidak menunggu
JavaScript async.

**Kesalahan 2 — "10 laporan contoh bercampur dengan data asli".**

Saya menulis seolah Firestore sudah berisi banyak laporan pengguna. Kenyataan:
Firestore hanya berisi **1 dokumen** (laporan uji saya). 10 laporan yang
tampil seluruhnya berasal dari `data/data.json` (§3.8).

**Kesalahan 3 — "email admin `dzihni777@gmail.com`".**

Email itu saya pakai di rules & dokumentasi atas permintaan awal, **tanpa
memeriksa** akun mana yang benar-benar ada di Firebase Auth. Ternyata akun
admin terdaftar sebagai **`r9723419@gmail.com`** dengan UID
`VHG3YKblzHQzqK0LCVpaKpAbquL2`. Kalau dibiarkan, aturan akan menyebut email
yang tidak punya akun, dan panel admin tidak bisa dipakai.

Sudah dikoreksi di `firestore.rules`, `tentang.html`, kedua README, dan
catatan ini. Pelajarannya: **periksa dulu isi Auth**, jangan percaya email
yang disebutkan di chat.

### 4.6 ⚠️ Provider Google tidak terlihat di `/config`

Endpoint `admin/v2/projects/{id}/config` hanya menampilkan provider `email`.
Itu **bukan** berarti Google mati — provider Google dikelola di
`defaultSupportedIdpConfigs/google.com` dan statusnya `enabled: true`.

Jangan simpulkan provider mati hanya dari `/config`.

### 4.7 ⚠️ `firebase deploy --only firestore:rules` bisa mencoba membuat database baru

Tanpa `"database": "default"` di `firebase.json`, CLI mengira database
`(default)` belum ada lalu mencoba membuatnya → gagal dengan
`This API method requires billing to be enabled`.

Sudah diperbaiki: `firebase.json` kini punya `"firestore": { "database": "default" }`.

Catatan tambahan: deploy rules bisa melaporkan
`Failed to make request to .../v1/projects/...:test` **padahal berhasil**.
Cek `GET /releases/cloud.firestore/default` untuk memastikan `rulesetName`
menunjuk ruleset terbaru.

### 4.8 ⚠️ Jangan simpan sandi admin Firebase di `ADMIN_PASSWORD`

**Kesalahan yang saya buat 12 Nov 2026.** Saya menambahkan ke `.env`:

```
ADMIN_PASSWORD=TemuBalik2026!kuat
```

Maksudnya menyimpan sandi akun admin Firebase. Ternyata `server/auth.js`
baris 72 **membaca `ADMIN_PASSWORD` sebagai kata sandi panel backend**.
Akibatnya sandi backend ikut berubah dan **25 dari 101 tes API gagal**
(`percobaan gagal ke-5 masih 401 — dapat 429`, `logout → 200` gagal, dst).

Bukan bug kode — murni salah saya memilih nama variabel. Diperbaiki dengan
mengganti nama menjadi `FIREBASE_ADMIN_PASSWORD` (tidak dibaca kode mana pun),
dan peringatan ditambahkan di `.env.example`.

**Pelajaran:** sebelum menambah variabel ke `.env`, cek dulu apakah nama itu
sudah dipakai kode:

```bash
grep -rhoE "process\.env\.[A-Z_]+" server/*.js scripts/*.js | sort -u
```

### 4.9 ⚠️ Jangan campur kesiapan Firestore dengan kesiapan Auth

**Penyebab Bug 5 di §2.2.** Pelajarannya penting dan mudah terulang:

`FirebaseStore.ready()` dan `state.ok` itu menandakan **Firestore** siap dipakai
untuk data. Auth adalah **layanan terpisah**. Dulu keduanya disamakan, sehingga:

- satu baca Firestore timeout → `state.degraded = true` → `fb()` jadi `null`
  → login admin ikut mati, padahal Auth sehat;
- `state.ok = true` ditulis setelah memuat analytics → analytics diblokir
  pemblokir iklan → login mati permanen;
- gerbang tunggu 6 detik lebih pendek dari batas probe 8 detik → login menyerah
  padahal probe baru saja sukses.

**Aturan yang sekarang dipegang:**

| Kebutuhan | Pakai | Jangan pakai |
| --- | --- | --- |
| Login / sesi admin | `fbAuth()` + `firebaseAuthReady()` | `fb()` / `firebaseReady()` |
| Baca/tulis data laporan | `fb()` / `firebaseReady()` | jalur Auth |

Kalau nanti menambah fitur yang butuh Auth, **pakai jalur Auth**. Kalau butuh
data, baru pakai jalur Firestore. Jangan pernah memakai satu untuk menilai yang
lain.

**Cara cepat memastikan saat debug** (Console browser di `/admin`):

```js
FirebaseStore.isReady()      // Firestore siap? (data)
FirebaseStore.isAuthReady()  // Auth siap? (login)
FirebaseStore.reason()       // alasan kalau Firestore gagal
```

Kalau `isReady()===false` tapi `isAuthReady()===true`, login **tetap harus bisa**.
Itu perilaku yang benar sekarang.


---

## 5. Langkah selanjutnya (urutan yang disarankan)

### Wajib — supaya situs benar-benar aman dipakai

1. **Rotasi service account** yang bocor (§3.3). Kunci ini masih berfungsi
   dan memberi akses penuh ke project.
2. **Ganti kata sandi admin** kalau perlu — sandi awal tercatat di `.env`
   dan sudah pernah tampil di chat, jadi sebaiknya dirotasi (§3.4).
3. **Putuskan kebijakan privasi**: `allow read: if true` membuat `whatsapp`
   dan `namaPelapor` terbaca publik lewat API tanpa login.

### Sebaiknya — memperkuat

4. Pertimbangkan `Cache-Control` JS dari `max-age=3600` → `no-cache`
   supaya pengunjung tidak tertahan kode lama setelah deploy.
5. Aktifkan App Check kalau mulai disalahgunakan (§3.6).
6. Kalau sudah ada laporan asli dan ingin data contoh disembunyikan,
   kosongkan `data/data.json` menjadi `[]`.

### Opsional — kalau mau lanjut

7. Pindahkan foto ke Firebase Storage (butuh paket Blaze).
8. Putuskan nasib folder `server/` (§3.7).
9. Hapus folder `.git` dari riwayat deploy lama di Firebase (object lama
   mungkin masih tersimpan meski URL-nya sudah 404).


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

## 8. Status commit & deploy

**Semua perubahan sudah di-commit dan di-push.** Working tree bersih.

Riwayat commit terakhir:

```
a46d2e1  fix: samakan email admin dengan akun Auth yang sebenarnya
febc05f  chore: jangan commit firebase-debug.log
b09a386  feat(rules): kenali admin lewat UID, bukan hanya email
be0da43  fix: perbaiki teks yang bilang data hanya di browser
b1bd790  feat: isi email admin & nomor WhatsApp asli
c9bf0dd  fix: jangan unggah .git & .firebase ke Hosting
```

Deploy terakhir: **hosting + firestore rules**, keduanya `Deploy complete!`.
Ruleset aktif: `1d6548c4-d665-4615-93c6-be0e4e1941e6` (memuat UID admin,
email, dan batas foto 700000).

Kalau mengubah kode lagi:

```bash
npm run config
firebase deploy --only hosting
```

`predeploy` sudah menjalankan `npm run config` otomatis, tapi menjalankannya
manual lebih dulu membuat kesalahan konfigurasi cepat terlihat.


---

## 9. Riwayat sesi

| Tanggal | Yang dikerjakan |
| --- | --- |
| 11 Nov 2026 | Integrasi Firebase, perbaikan database ID, publish rules, deploy hosting |
| 11 Nov 2026 | Pindahkan data sensitif ke `.env` + fail-closed |
| 12 Nov 2026 | Audit, lengkapi `.env.example`, `predeploy` hook, tes tidak hardcode, catatan ini |
| 12 Nov 2026 | Verifikasi live: rules aktif & aman |
| 12 Nov 2026 | Uji DOM & screenshot ke situs live: Firebase aktif, tombol Google ada (koreksi §3.10) |
| 12 Nov 2026 | Perbaiki batas foto: kompresi bertahap + rules 700 KB (§3.5) |
| 12 Nov 2026 | Ganti email admin & nomor WhatsApp asli di 7 halaman + rules |
| 12 Nov 2026 | Perbaiki teks "data hanya di browser" yang sudah tidak benar |
| 12 Nov 2026 | Tambah UID admin `VHG3YKblz...` ke `isAdmin()`, publish rules |
| 12 Nov 2026 | **Koreksi besar:** akun admin sebenarnya `r9723419@gmail.com`, bukan `dzihni777@gmail.com`. Semua dokumen disamakan (§4.5) |
| 12 Nov 2026 | Verifikasi login Google aktif via `defaultSupportedIdpConfigs` (§4.6) |
| 12 Nov 2026 | **Perbaiki bug data contoh hilang** — `getAllProgressive` kini menggabung, bukan mengganti; tambah label CONTOH (§3.8) |
| 12 Nov 2026 | **Atur kata sandi akun admin & uji login lewat UI** — berhasil masuk panel admin (§3.4) |
| 12 Nov 2026 | **Perbaiki bug "Firebase tidak dapat dihubungi, login dinonaktifkan"** — pisahkan Auth dari Firestore, analytics tidak menahan kesiapan, selaraskan timeout, pesan error jujur (§2.2 Bug 5, §4.9) |

