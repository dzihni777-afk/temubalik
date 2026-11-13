#!/usr/bin/env node
/* ==========================================================================
   TemuBalik — Pemeriksa kesehatan konfigurasi ("doctor")

   Tujuan: satu perintah untuk menjawab "kenapa Firebase/login tidak jalan?"
   tanpa harus membuka Console browser dan menebak-nebak.

   Cara pakai:
     npm run doctor
     node scripts/doctor.js

   Yang diperiksa:
     1. Versi Node.js
     2. File .env  (ada? lengkap?)
     3. File js/firebase-config.js (ada? projectId terisi?)
     4. Kecocokan .env ↔ firebase-config.js (sudah `npm run config`?)
     5. Koneksi ke Firestore & Firebase Auth (opsional, pakai apiKey)
     6. Hal-hal yang sering salah (databaseId, sandi demo, dsb.)

   Keluar dengan kode 1 kalau ada masalah yang menghalangi login admin.
   ========================================================================== */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const CONFIG_PATH = path.join(ROOT, "js", "firebase-config.js");

/* ---------------------------- tampilan ---------------------------- */

const pakaiWarna = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  reset: pakaiWarna ? "\x1b[0m" : "",
  bold: pakaiWarna ? "\x1b[1m" : "",
  dim: pakaiWarna ? "\x1b[2m" : "",
  red: pakaiWarna ? "\x1b[31m" : "",
  green: pakaiWarna ? "\x1b[32m" : "",
  yellow: pakaiWarna ? "\x1b[33m" : "",
  cyan: pakaiWarna ? "\x1b[36m" : "",
};

let gagal = 0; // masalah yang menghalangi
let saran = 0; // bukan penghalang, tapi sebaiknya diperbaiki

function judul(teks) {
  console.log(`\n${c.bold}${teks}${c.reset}`);
}

function ok(pesan, detail = "") {
  console.log(`  ${c.green}✔${c.reset} ${pesan}${detail ? ` ${c.dim}${detail}${c.reset}` : ""}`);
}

function warn(pesan, detail = "") {
  saran += 1;
  console.log(`  ${c.yellow}!${c.reset} ${pesan}${detail ? ` ${c.dim}${detail}${c.reset}` : ""}`);
}

function err(pesan, detail = "") {
  gagal += 1;
  console.log(`  ${c.red}✘${c.reset} ${pesan}${detail ? ` ${c.dim}${detail}${c.reset}` : ""}`);
}

function info(pesan) {
  console.log(`  ${c.dim}${pesan}${c.reset}`);
}

/* --------------------------- pembacaan ---------------------------- */

/** Baca .env sederhana (tanpa dependency, sama seperti server/env.js). */
function bacaEnv(file) {
  if (!fs.existsSync(file)) return null;
  const hasil = {};
  const isi = fs.readFileSync(file, "utf8");
  for (const baris of isi.split(/\r?\n/)) {
    const m = baris.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let nilai = m[2].trim();
    // Buang tanda kutip pembungkus.
    if (
      (nilai.startsWith('"') && nilai.endsWith('"')) ||
      (nilai.startsWith("'") && nilai.endsWith("'"))
    ) {
      nilai = nilai.slice(1, -1);
    }
    hasil[m[1]] = nilai;
  }
  return hasil;
}

/** Baca nilai dari js/firebase-config.js tanpa mengeksekusinya. */
function bacaConfigJs(file) {
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, "utf8");

  const ambil = (kunci) => {
    const m = src.match(new RegExp(kunci + '\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
    return m ? m[1] : "";
  };
  const ambilBool = (kunci) => {
    const m = src.match(new RegExp(kunci + "\\s*:\\s*(true|false)"));
    return m ? m[1] === "true" : null;
  };
  const ambilAngka = (kunci) => {
    const m = src.match(new RegExp(kunci + "\\s*:\\s*(\\d+)"));
    return m ? Number(m[1]) : null;
  };

  return {
    enabled: ambilBool("enabled"),
    collection: ambil("collection"),
    databaseId: ambil("databaseId"),
    demoPassword: ambil("demoPassword"),
    maxDocs: ambilAngka("maxDocs"),
    enableAnalytics: ambilBool("enableAnalytics"),
    config: {
      apiKey: ambil("apiKey"),
      authDomain: ambil("authDomain"),
      projectId: ambil("projectId"),
      storageBucket: ambil("storageBucket"),
      messagingSenderId: ambil("messagingSenderId"),
      appId: ambil("appId"),
      measurementId: ambil("measurementId"),
    },
  };
}

/* ------------------------------ cek ------------------------------ */

function cekNode() {
  judul("1. Node.js");
  const v = process.versions.node;
  const mayor = Number(v.split(".")[0]);
  if (mayor >= 18) {
    ok(`Node.js v${v}`);
  } else {
    err(`Node.js v${v} terlalu lama`, "butuh >= 18");
  }
}

function cekEnv() {
  judul("2. File .env");

  if (!fs.existsSync(ENV_PATH)) {
    err(".env tidak ditemukan", ENV_PATH);
    info('Perbaiki: cp .env.example .env  → lalu isi nilainya');
    return null;
  }
  ok(".env ditemukan");

  const env = bacaEnv(ENV_PATH) || {};
  const wajib = [
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_STORAGE_BUCKET",
    "FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_APP_ID",
  ];

  const kosong = wajib.filter((k) => !String(env[k] || "").trim());
  if (kosong.length) {
    err("variabel wajib masih kosong", kosong.join(", "));
    info('Perbaiki: isi variabel di atas, lalu jalankan "npm run config"');
  } else {
    ok("semua variabel wajib terisi", `(project: ${env.FIREBASE_PROJECT_ID})`);
  }

  // Jebakan nama variabel yang pernah menyebabkan 25 tes gagal.
  if (env.ADMIN_PASSWORD) {
    warn(
      "ADMIN_PASSWORD diisi",
      "ini kata sandi panel BACKEND, bukan akun admin Firebase"
    );
    info("Kalau maksudnya akun Firebase, ganti nama jadi FIREBASE_ADMIN_PASSWORD.");
  }

  if (!env.FIREBASE_DEMO_PASSWORD) {
    warn(
      "FIREBASE_DEMO_PASSWORD kosong",
      "login demo lokal mati (ini benar untuk server publik)"
    );
  }

  return env;
}

function cekConfigFile(env) {
  judul("3. File js/firebase-config.js");

  if (!fs.existsSync(CONFIG_PATH)) {
    err("js/firebase-config.js tidak ditemukan", CONFIG_PATH);
    info("File ini dihasilkan dari .env dan memang tidak di-commit.");
    info('Perbaiki: npm run config');
    return null;
  }
  ok("js/firebase-config.js ada");

  const cfg = bacaConfigJs(CONFIG_PATH);
  if (!cfg) {
    err("js/firebase-config.js tidak bisa dibaca");
    return null;
  }

  if (!cfg.config || !cfg.config.projectId) {
    err("projectId kosong di js/firebase-config.js");
    info('Perbaiki: npm run config');
    return cfg;
  }
  ok("projectId terisi", cfg.config.projectId);

  if (cfg.enabled === false) {
    warn("Firebase dimatikan (enabled: false)", "situs hanya memakai localStorage");
  }

  // databaseId: jebakan yang pernah membuat situs jatuh ke mode lokal.
  const dbId = String(cfg.databaseId || "");
  if (dbId === "(default)") {
    warn(
      'databaseId = "(default)"',
      "kalau database Anda dibuat lewat Google Cloud Console, ini salah"
    );
    info('Proyek ini memakai "default" tanpa tanda kurung.');
  } else if (dbId) {
    ok("databaseId", dbId);
  }

  // Kecocokan .env ↔ config: kalau beda, config belum di-generate ulang.
  if (env) {
    const pasangan = [
      ["FIREBASE_API_KEY", cfg.config.apiKey],
      ["FIREBASE_AUTH_DOMAIN", cfg.config.authDomain],
      ["FIREBASE_PROJECT_ID", cfg.config.projectId],
      ["FIREBASE_APP_ID", cfg.config.appId],
    ];
    const beda = pasangan.filter(([k, v]) => env[k] && String(env[k]) !== String(v));
    if (beda.length) {
      warn(
        "js/firebase-config.js tidak sama dengan .env",
        beda.map(([k]) => k).join(", ")
      );
      info('Perbaiki: npm run config  (lalu deploy ulang)');
    } else {
      ok("js/firebase-config.js sesuai dengan .env");
    }
  }

  if (cfg.demoPassword) {
    warn("sandi demo tertulis di js/firebase-config.js", "hanya berlaku di localhost");
  }

  return cfg;
}

/** Uji koneksi Firestore & Auth memakai REST (tanpa SDK). */
async function cekKoneksi(cfg) {
  judul("4. Koneksi ke Firebase");

  if (!cfg || !cfg.config || !cfg.config.apiKey || !cfg.config.projectId) {
    info("Dilewati: konfigurasi belum lengkap.");
    return;
  }

  const key = cfg.config.apiKey;
  const proyek = cfg.config.projectId;
  const dbId = String(cfg.databaseId || "(default)");

  const coba = async (nama, url, opsi = {}) => {
    const kontrol = new AbortController();
    const timer = setTimeout(() => kontrol.abort(), 10000);
    try {
      const r = await fetch(url, { ...opsi, signal: kontrol.signal });
      clearTimeout(timer);
      return { nama, status: r.status, ok: true };
    } catch (e) {
      clearTimeout(timer);
      return { nama, ok: false, pesan: e && e.message ? e.message : String(e) };
    }
  };

  // Firestore: query ringan ke koleksi laporan.
  const urlFs = `https://firestore.googleapis.com/v1/projects/${proyek}/databases/${encodeURIComponent(
    dbId
  )}/documents:runQuery?key=${key}`;

  const fs1 = await coba("Firestore", urlFs, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: cfg.collection || "reports" }], limit: 1 },
    }),
  });

  if (!fs1.ok) {
    err("Firestore tidak dapat dihubungi", fs1.pesan);
    info("Periksa koneksi internet / apakah Firestore sudah dibuat.");
  } else if (fs1.status === 200) {
    ok("Firestore dapat dibaca", `database "${dbId}"`);
  } else if (fs1.status === 403) {
    warn("Firestore menolak (403)", "Security Rules mungkin membatasi");
  } else if (fs1.status === 404) {
    err(`database "${dbId}" tidak ditemukan`, "cek FIREBASE_DATABASE_ID");
  } else {
    warn(`Firestore menjawab ${fs1.status}`);
  }

  // Auth: cek konfigurasi provider. Endpoint ini publik (cukup apiKey) dan
  // menjawab 200 kalau Identity Toolkit aktif untuk project ini.
  const urlAuth = `https://identitytoolkit.googleapis.com/v1/projects/${proyek}/defaultSupportedIdpConfigs?key=${key}`;
  const au = await coba("Auth", urlAuth);
  if (!au.ok) {
    err("Firebase Auth tidak dapat dihubungi", au.pesan);
  } else if (au.status === 200) {
    ok("Firebase Auth dapat dihubungi");
  } else if (au.status === 403 || au.status === 401) {
    warn("Firebase Auth menolak kunci", `status ${au.status}`);
    info("Pastikan FIREBASE_API_KEY benar dan Identity Toolkit sudah aktif.");
  } else if (au.status === 404) {
    // 404 di sini biasanya berarti daftar provider tidak dapat dibaca dengan
    // apiKey saja. Itu bukan penghalang: login tetap diuji di browser.
    warn("Daftar provider Auth tidak dapat dibaca dengan apiKey", "bukan penghalang");
  } else {
    warn(`Firebase Auth menjawab ${au.status}`);
  }
}

/* ------------------------------ main ------------------------------ */

(async () => {
  console.log(`${c.bold}TemuBalik — pemeriksaan konfigurasi${c.reset}`);
  console.log(`${c.dim}Folder proyek: ${ROOT}${c.reset}`);

  cekNode();
  const env = cekEnv();
  const cfg = cekConfigFile(env);
  await cekKoneksi(cfg);

  judul("Ringkasan");
  if (gagal === 0 && saran === 0) {
    console.log(`  ${c.green}${c.bold}Semua baik.${c.reset} Login admin seharusnya bisa dipakai.`);
  } else if (gagal === 0) {
    console.log(
      `  ${c.green}${c.bold}Tidak ada penghalang.${c.reset} ` +
        `${saran} hal sebaiknya diperbaiki (lihat tanda "!").`
    );
  } else {
    console.log(`  ${c.red}${c.bold}${gagal} masalah menghalangi.${c.reset} Perbaiki dulu yang bertanda "✘".`);
  }

  console.log(
    `\n${c.dim}Kalau masih bermasalah, buka /admin lalu jalankan di Console browser:${c.reset}`
  );
  console.log(`${c.dim}  FirebaseStore.isReady()   FirebaseStore.isAuthReady()   FirebaseStore.reason()${c.reset}\n`);

  process.exit(gagal > 0 ? 1 : 0);
})();
