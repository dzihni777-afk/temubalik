/* ==========================================================================
   TemuBalik — Lapisan data backend
   Penyimpanan: satu file JSON (server/storage/reports.json).

   Kenapa file JSON? Supaya tidak perlu install apa pun dan mudah dibaca
   saat belajar. Kalau nanti pindah ke SQLite/Postgres, cukup ganti isi
   modul ini — routes/ tidak perlu diubah.
   ========================================================================== */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SEED_FILE = path.join(ROOT, "data", "data.json");
const STORE_DIR = path.join(__dirname, "storage");

/* Bisa diarahkan ke file lain lewat env — dipakai tests/api.test.cjs supaya
   pengujian tidak menyentuh data asli. */
const STORE_FILE = process.env.TEMUBALIK_STORE
  ? path.resolve(process.env.TEMUBALIK_STORE)
  : path.join(STORE_DIR, "reports.json");

/* --------------------------------------------------------------------------
   Antrian sederhana: semua operasi tulis dijalankan satu per satu supaya
   dua request yang datang bersamaan tidak saling menimpa file.
   (Ini bukan pengganti transaksi database, hanya cukup untuk skala belajar.)
   -------------------------------------------------------------------------- */
let chain = Promise.resolve();

function serialize(task) {
  const next = chain.then(task, task);
  // Rantai tidak boleh "putus" hanya karena satu task gagal.
  chain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function readFileJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    if (err instanceof SyntaxError) {
      throw new Error(`File data rusak dan tidak bisa dibaca: ${path.basename(file)}`);
    }
    throw err;
  }
}

/** Tulis atomik: tulis ke file sementara dulu, baru di-rename. */
async function writeFileJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

/** Baca isi gudang; kalau belum ada, salin dari data/data.json (seed). */
async function readRaw() {
  let rows = await readFileJson(STORE_FILE);

  if (rows === null) {
    const seed = (await readFileJson(SEED_FILE)) || [];
    rows = Array.isArray(seed) ? seed : [];
    await writeFileJson(STORE_FILE, rows);
    console.log(`[db] gudang kosong, ${rows.length} laporan contoh disalin dari data/data.json`);
  }

  if (!Array.isArray(rows)) {
    throw new Error("Isi server/storage/reports.json harus berupa array.");
  }
  return rows;
}

function sortByCreatedDesc(rows) {
  return [...rows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/* ---------------------------- API publik ---------------------------- */

/** Semua laporan, terbaru di atas. */
async function readAll() {
  return serialize(async () => sortByCreatedDesc(await readRaw()));
}

/** Cari satu laporan (tidak peka huruf besar/kecil pada id). */
async function findById(id) {
  const key = String(id || "").trim().toUpperCase();
  if (!key) return null;
  const rows = await readAll();
  return rows.find((r) => String(r.id).toUpperCase() === key) || null;
}

/**
 * Jalankan perubahan pada daftar laporan lalu simpan.
 * `mutator(rows)` boleh mengubah array dan mengembalikan nilai apa pun.
 */
async function mutate(mutator) {
  return serialize(async () => {
    const rows = await readRaw();
    const result = await mutator(rows);
    await writeFileJson(STORE_FILE, rows);
    return result;
  });
}

/** Buat nomor laporan: LPR-YYYYMMDD-NNN (urutan per hari). */
function nextId(rows, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const prefix = `LPR-${y}${m}${d}-`;

  const existing = new Set(rows.map((r) => String(r.id).toUpperCase()));
  const todayCount = [...existing].filter((id) => id.startsWith(prefix)).length;

  let seq = todayCount + 1;
  let candidate = `${prefix}${String(seq).padStart(3, "0")}`;
  while (existing.has(candidate)) {
    seq += 1;
    candidate = `${prefix}${String(seq).padStart(3, "0")}`;
  }
  return candidate;
}

module.exports = {
  STORE_FILE,
  readAll,
  findById,
  mutate,
  nextId,
};
