/* ==========================================================================
   TemuBalik — Uji otomatis `npm run doctor` (scripts/doctor.js)

   Jalankan:  node tests/doctor.test.cjs
   (atau:     npm run test:doctor)

   Yang diuji:
     1. doctor.js lolos `node --check` (tidak ada salah sintaks)
     2. Laporan menyebut keempat bagian pemeriksaan
     3. Keluar dengan kode 0 saat konfigurasi lengkap
     4. Keluar dengan kode 1 saat .env hilang  → kegagalan terdeteksi
     5. Keluar dengan kode 1 saat firebase-config.js hilang
     6. Tidak membocorkan apiKey utuh ke layar (hanya status, bukan nilai)

   Uji 4 & 5 memakai folder tiruan sementara, jadi .env dan
   js/firebase-config.js yang asli TIDAK disentuh sama sekali.
   ========================================================================== */

"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DOCTOR = path.join(ROOT, "scripts", "doctor.js");

let pass = 0;
let fail = 0;

function check(name, condition, extra = "") {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/** Jalankan doctor.js di folder tertentu (memakai salinan di folder itu). */
function runDoctor(cwd, env = {}) {
  const salinan = path.join(cwd, "scripts", "doctor.js");
  const skrip = fs.existsSync(salinan) ? salinan : DOCTOR;
  const r = spawnSync(process.execPath, [skrip], {
    cwd,
    env: { ...process.env, ...env, NO_COLOR: "1" },
    encoding: "utf8",
    timeout: 60000,
  });
  return {
    status: r.status,
    out: String(r.stdout || "") + String(r.stderr || ""),
  };
}

/**
 * Buat folder proyek tiruan berisi scripts/doctor.js + isi yang diberikan.
 * Dipakai untuk menguji jalur gagal tanpa merusak file asli.
 */
function buatProyekTiruan({ env = null, config = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "temubalik-doctor-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "js"), { recursive: true });
  fs.copyFileSync(DOCTOR, path.join(dir, "scripts", "doctor.js"));

  if (env !== null) fs.writeFileSync(path.join(dir, ".env"), env, "utf8");
  if (config !== null) fs.writeFileSync(path.join(dir, "js", "firebase-config.js"), config, "utf8");
  return dir;
}

/* --------------------------------- Main --------------------------------- */

(function main() {
  section("1. Berkas doctor.js");
  {
    check("scripts/doctor.js ada", fs.existsSync(DOCTOR));

    const syntax = spawnSync(process.execPath, ["--check", DOCTOR], { encoding: "utf8" });
    check(
      "lolos pemeriksaan sintaks",
      syntax.status === 0,
      String(syntax.stderr || "").split("\n")[0]
    );

    const src = fs.readFileSync(DOCTOR, "utf8");
    check("mendefinisikan pemeriksaan Node.js", /cekNode/.test(src));
    check("mendefinisikan pemeriksaan .env", /cekEnv/.test(src));
    check("mendefinisikan pemeriksaan firebase-config.js", /cekConfigFile/.test(src));
    check("mendefinisikan pemeriksaan koneksi", /cekKoneksi/.test(src));
    check("mengembalikan kode keluar 1 saat gagal", /process\.exit\(/.test(src));
  }

  section("2. Laporan pada proyek ini (konfigurasi lengkap)");
  {
    const r = runDoctor(ROOT);

    check("menyebut Node.js", /Node\.js v\d+/.test(r.out), r.out.split("\n")[0]);
    check("menyebut bagian .env", /File \.env/.test(r.out));
    check("menyebut bagian firebase-config.js", /js\/firebase-config\.js/.test(r.out));
    check("menyebut bagian koneksi", /Koneksi ke Firebase/.test(r.out));
    check("mencetak ringkasan", /Ringkasan/.test(r.out));

    // Kode keluar bergantung isi .env mesin ini. Yang penting: konsisten
    // dengan ringkasan yang dicetak.
    const adaPenghalang = /masalah menghalangi/.test(r.out);
    check(
      "kode keluar sesuai ringkasan",
      adaPenghalang ? r.status === 1 : r.status === 0,
      `status ${r.status}`
    );

    const apiKey = (fs.existsSync(path.join(ROOT, ".env"))
      ? fs.readFileSync(path.join(ROOT, ".env"), "utf8").match(/^FIREBASE_API_KEY=(.+)$/m)
      : null);
    if (apiKey && apiKey[1].trim()) {
      check(
        "apiKey tidak dicetak utuh",
        !r.out.includes(apiKey[1].trim()),
        "kunci bocor ke layar"
      );
    }
  }

  section("3. Jalur gagal — .env tidak ada");
  {
    const dir = buatProyekTiruan({ config: null, env: null });
    try {
      const r = runDoctor(dir);
      check(".env tidak ditemukan dilaporkan", /\.env tidak ditemukan/.test(r.out));
      check("menyarankan cp .env.example .env", /cp \.env\.example \.env/.test(r.out));
      check("keluar dengan kode 1", r.status === 1, `status ${r.status}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  section("4. Jalur gagal — .env ada tapi kosong");
  {
    const envKosong = [
      "FIREBASE_API_KEY=",
      "FIREBASE_AUTH_DOMAIN=",
      "FIREBASE_PROJECT_ID=",
      "FIREBASE_STORAGE_BUCKET=",
      "FIREBASE_MESSAGING_SENDER_ID=",
      "FIREBASE_APP_ID=",
      "",
    ].join("\n");
    const dir = buatProyekTiruan({ env: envKosong, config: null });
    try {
      const r = runDoctor(dir);
      check("variabel wajib kosong dilaporkan", /variabel wajib masih kosong/.test(r.out));
      check("menyebut npm run config", /npm run config/.test(r.out));
      check("keluar dengan kode 1", r.status === 1, `status ${r.status}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  section("5. Jalur gagal — firebase-config.js belum dihasilkan");
  {
    const envLengkap = [
      "FIREBASE_API_KEY=kunci-uji",
      "FIREBASE_AUTH_DOMAIN=uji.firebaseapp.com",
      "FIREBASE_PROJECT_ID=uji",
      "FIREBASE_STORAGE_BUCKET=uji.appspot.com",
      "FIREBASE_MESSAGING_SENDER_ID=123",
      "FIREBASE_APP_ID=1:123:web:abc",
      "",
    ].join("\n");
    const dir = buatProyekTiruan({ env: envLengkap, config: null });
    try {
      const r = runDoctor(dir);
      check(
        "config hilang dilaporkan",
        /js\/firebase-config\.js tidak ditemukan/.test(r.out),
        r.out
      );
      check("menjelaskan file tidak di-commit", /tidak di-commit/.test(r.out));
      check("keluar dengan kode 1", r.status === 1, `status ${r.status}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  section("6. Jalur gagal — config ada tapi projectId kosong");
  {
    const envLengkap = "FIREBASE_API_KEY=kunci-uji\nFIREBASE_PROJECT_ID=uji\n";
    const configKosong = [
      "window.TEMUBALIK_FIREBASE = {",
      "  enabled: true,",
      "  collection: \"reports\",",
      "  config: { apiKey: \"kunci-uji\", projectId: \"\" },",
      "};",
      "",
    ].join("\n");
    const dir = buatProyekTiruan({ env: envLengkap, config: configKosong });
    try {
      const r = runDoctor(dir);
      check("projectId kosong dilaporkan", /projectId kosong/.test(r.out));
      check("keluar dengan kode 1", r.status === 1, `status ${r.status}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  section("7. Peringatan databaseId \"(default)\"");
  {
    const envLengkap = [
      "FIREBASE_API_KEY=kunci-uji",
      "FIREBASE_AUTH_DOMAIN=uji.firebaseapp.com",
      "FIREBASE_PROJECT_ID=uji",
      "FIREBASE_STORAGE_BUCKET=uji.appspot.com",
      "FIREBASE_MESSAGING_SENDER_ID=123",
      "FIREBASE_APP_ID=1:123:web:abc",
      "",
    ].join("\n");
    const configSalah = [
      "window.TEMUBALIK_FIREBASE = {",
      "  enabled: true,",
      "  collection: \"reports\",",
      "  databaseId: \"(default)\",",
      "  config: {",
      "    apiKey: \"kunci-uji\",",
      "    authDomain: \"uji.firebaseapp.com\",",
      "    projectId: \"uji\",",
      "    storageBucket: \"uji.appspot.com\",",
      "    messagingSenderId: \"123\",",
      "    appId: \"1:123:web:abc\",",
      "  },",
      "};",
      "",
    ].join("\n");
    const dir = buatProyekTiruan({ env: envLengkap, config: configSalah });
    try {
      const r = runDoctor(dir);
      check("databaseId (default) diperingatkan", /databaseId = "\(default\)"/.test(r.out));
      check(
        "menjelaskan proyek ini memakai \"default\"",
        /tanpa tanda kurung/.test(r.out)
      );
      // Peringatan saja, bukan penghalang: kode keluar tetap 0.
      check("bukan penghalang (kode 0)", r.status === 0, `status ${r.status}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  /* ------------------------------ Ringkasan ------------------------------ */
  console.log(`\n${"=".repeat(46)}`);
  console.log(`Lulus: ${pass}   Gagal: ${fail}`);
  if (fail > 0) {
    console.log("ADA YANG GAGAL");
    process.exit(1);
  }
  console.log("SEMUA TES DOCTOR LULUS");
})();
