/* ==========================================================================
   TemuBalik — Pembuat js/firebase-config.js dari .env

   Kenapa ada file ini?
   Konfigurasi Firebase tidak lagi ditulis langsung di dalam kode. Nilainya
   disimpan di .env (tidak ikut di-commit), lalu file ini menghasilkan
   js/firebase-config.js yang dipakai halaman web.

   Cara pakai:
     npm run config          # buat ulang js/firebase-config.js dari .env
     node scripts/gen-firebase-config.js

   Catatan keamanan penting:
     apiKey Firebase Web BUKAN rahasia — nilainya memang ikut terkirim ke
     browser setiap pengunjung, dan itu memang rancangan Firebase. Yang
     melindungi data adalah Security Rules (firestore.rules), bukan
     kerahasiaan apiKey.

     Jadi memindahkan nilai ini ke .env TIDAK membuatnya lebih aman dari
     pengunjung situs. Manfaatnya: repo bisa dibagikan tanpa menunjuk ke
     project Firebase yang hidup, dan kredensial asli (service account)
     tidak pernah masuk repo.

   Kalau .env belum diisi, skrip ini berhenti dan memberi tahu variabel
   mana yang kurang — bukan diam-diam membuat konfigurasi kosong.
   ========================================================================== */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { loadEnv, ENV_PATH } = require("../server/env");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "js", "firebase-config.js");

const env = loadEnv();

/* Kalau .env belum ada tapi js/firebase-config.js sudah pernah dibuat,
   jangan gagal — cukup beri peringatan. Ini supaya `npm start` tetap jalan
   bagi orang yang baru meng-clone repo. */
function bailIfNoOutput(message) {
  if (fs.existsSync(OUT)) {
    console.warn(`[config] ${message}`);
    console.warn("[config] Memakai js/firebase-config.js yang sudah ada.");
    process.exit(0);
  }
  console.error(`\n[config] ${message}`);
  console.error("[config] Salin contohnya dulu:  cp .env.example .env");
  console.error("[config] Lalu isi nilainya, kemudian jalankan: npm run config\n");
  process.exit(1);
}

if (!env.loaded) {
  bailIfNoOutput(`File .env tidak ditemukan di: ${ENV_PATH}`);
}

/** Ambil variabel wajib; kumpulkan yang kosong supaya bisa dilaporkan. */
const missing = [];
function need(name, fallback = "") {
  const value = String(process.env[name] || "").trim();
  if (!value && !fallback) missing.push(name);
  return value || fallback;
}

const config = {
  apiKey: need("FIREBASE_API_KEY"),
  authDomain: need("FIREBASE_AUTH_DOMAIN"),
  projectId: need("FIREBASE_PROJECT_ID"),
  storageBucket: need("FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: need("FIREBASE_MESSAGING_SENDER_ID"),
  appId: need("FIREBASE_APP_ID"),
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "",
};

const databaseId = process.env.FIREBASE_DATABASE_ID || "(default)";
const collection = process.env.FIREBASE_COLLECTION || "reports";
const enabled = String(process.env.FIREBASE_ENABLED || "true").toLowerCase() !== "false";

/* Kata sandi demo untuk mode lokal. SENGAJA dibiarkan kosong kalau tidak
   diisi di .env — login demo jadi mati, bukan memakai nilai bawaan. */
const demoPassword = String(process.env.FIREBASE_DEMO_PASSWORD || "");

if (missing.length) {
  const detail = `Variabel berikut belum diisi di .env: ${missing.join(", ")}`;
  if (fs.existsSync(OUT)) {
    console.warn(`[config] ${detail}`);
    console.warn("[config] Memakai js/firebase-config.js yang sudah ada.");
    process.exit(0);
  }
  console.error(`\n[config] ${detail}`);
  console.error("\n[config] Buka .env lalu isi nilainya dari:");
  console.error("  https://console.firebase.google.com/project/_/settings/general");
  console.error("  (bagian \"Your apps\" → konfigurasi SDK Firebase)\n");
  process.exit(1);
}

/** Tulis nilai sebagai literal JS yang aman. */
function js(value) {
  return JSON.stringify(String(value));
}

const output = `/* ==========================================================================
   TemuBalik — Konfigurasi Firebase

   ⚠️  FILE INI DIHASILKAN OTOMATIS — JANGAN DIEDIT TANGAN.
       Sumber sebenarnya ada di file .env (tidak ikut di-commit).
       Untuk mengubah nilai: edit .env lalu jalankan  npm run config

   File ini dibuat oleh scripts/gen-firebase-config.js

   Catatan keamanan: apiKey Firebase Web memang dirancang publik (ikut
   terkirim ke browser). Yang melindungi data Anda adalah *Security Rules*
   di firestore.rules — bukan kerahasiaan apiKey ini.
   ========================================================================== */

window.TEMUBALIK_FIREBASE = {
  /* Ubah ke false kalau ingin kembali 100% memakai localStorage. */
  enabled: ${enabled},

  /* Nama koleksi Firestore tempat laporan disimpan. */
  collection: ${js(collection)},

  /* ID database Firestore.
     Database yang dibuat lewat Firebase Console ber-ID "(default)".
     Yang dibuat lewat Google Cloud Console ber-ID "default" (tanpa kurung).
     Keduanya database berbeda — isi persis seperti yang tampil di:
       https://console.firebase.google.com/project/${config.projectId}/firestore */
  databaseId: ${js(databaseId)},

  /* Analytics hanya jalan di http(s). Di file:// otomatis dilewati. */
  enableAnalytics: ${Boolean(config.measurementId)},

  /* Kata sandi demo untuk mode lokal (hanya berlaku di localhost/127.0.0.1).
     Berasal dari FIREBASE_DEMO_PASSWORD di .env. Kosong = login demo mati. */
  demoPassword: ${js(demoPassword)},

  /* Jumlah maksimum dokumen yang diambil sekali muat. */
  maxDocs: ${Number(process.env.FIREBASE_MAX_DOCS || 500)},

  config: {
    apiKey: ${js(config.apiKey)},
    authDomain: ${js(config.authDomain)},
    projectId: ${js(config.projectId)},
    storageBucket: ${js(config.storageBucket)},
    messagingSenderId: ${js(config.messagingSenderId)},
    appId: ${js(config.appId)},
${config.measurementId ? `    measurementId: ${js(config.measurementId)},\n` : ""}  },
};
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, output, "utf8");

console.log(`[config] js/firebase-config.js dibuat dari .env`);
console.log(`[config] project: ${config.projectId} | database: ${databaseId}`);
