/* ==========================================================================
   TemuBalik — Pembaca file .env sederhana (tanpa dependency)

   Node 18 belum punya `--env-file` (baru ada di Node 20.6+), jadi file ini
   membaca .env sendiri. Format yang didukung:

       NAMA=nilai
       NAMA="nilai dengan spasi"
       NAMA='nilai'
       # komentar
       (baris kosong diabaikan)

   Aturan penting:
   - Variabel yang SUDAH ada di process.env TIDAK ditimpa. Jadi Anda tetap
     bisa menang set variabel dari shell, dan .env hanya jadi nilai bawaan.
   - Kalau file .env tidak ada, tidak ada yang gagal — server tetap jalan
     memakai nilai bawaan masing-masing modul.
   ========================================================================== */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

/** Lokasi .env: di root proyek (satu tingkat di atas folder server/). */
const ENV_PATH = path.resolve(__dirname, "..", ".env");

/** Buang tanda kutip pembungkus kalau ada. */
function unquote(value) {
  const v = value.trim();
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return v.slice(1, -1);
    }
  }
  return v;
}

/**
 * Baca .env lalu isi process.env.
 * @returns {{ loaded: boolean, count: number, path: string }}
 */
function loadEnv() {
  let text;
  try {
    text = fs.readFileSync(ENV_PATH, "utf8");
  } catch {
    return { loaded: false, count: 0, path: ENV_PATH };
  }

  let count = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // Pisahkan hanya pada tanda "=" pertama, supaya nilai boleh memuat "=".
    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    // Jangan timpa variabel yang sudah diset dari shell.
    if (process.env[key] !== undefined) continue;

    process.env[key] = unquote(line.slice(eq + 1));
    count++;
  }

  return { loaded: true, count, path: ENV_PATH };
}

module.exports = { loadEnv, ENV_PATH };
