/* ==========================================================================
   TemuBalik — Autentikasi admin (sederhana, tanpa dependency)

   Isi modul ini:
     1. Cek kata sandi admin terhadap hash (sha256) yang disimpan di env.
     2. Terbitkan token acak setelah login, simpan di memori dengan masa
        berlaku (default 2 jam).
     3. Batasi percobaan login yang gagal (rate limit per IP).

   CATATAN KEAMANAN
   Token disimpan di memori, jadi:
     - hilang saat server di-restart (semua admin harus login ulang);
     - tidak cocok kalau nanti server dijalankan beberapa proses sekaligus.
   Untuk produksi, ganti dengan sesi di database (atau JWT bertanda tangan).

   Variabel lingkungan yang dipakai:
     ADMIN_PASSWORD_HASH   sha256 hex dari kata sandi (cara yang disarankan)
     ADMIN_PASSWORD        kata sandi teks biasa (khusus pengembangan lokal)
     ADMIN_TOKEN_TTL_MS    masa berlaku token, default 2 jam
   ========================================================================== */

"use strict";

const crypto = require("node:crypto");

const { HttpError } = require("./http");

/* Kata sandi demo. Sama dengan yang dipakai panel admin front-end
   (js/admin.js) supaya mudah dicoba, tapi TIDAK untuk produksi. */
const DEMO_PASSWORD = "admin123";

const TOKEN_TTL_MS = (() => {
  const raw = Number(process.env.ADMIN_TOKEN_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 2 * 60 * 60 * 1000;
})();

/* Rate limit login: maksimal 5 percobaan gagal per 10 menit per IP. */
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

/* ----------------------------- Kata sandi ----------------------------- */

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

/**
 * Tentukan hash kata sandi admin dari env, dengan fallback ke kata sandi
 * demo supaya proyek tetap bisa dicoba tanpa konfigurasi apa pun.
 * @returns {{ hash: string, source: string }}
 */
function resolvePasswordHash() {
  const fromEnv = String(process.env.ADMIN_PASSWORD_HASH || "")
    .trim()
    .toLowerCase();

  if (/^[a-f0-9]{64}$/.test(fromEnv)) {
    return { hash: fromEnv, source: "ADMIN_PASSWORD_HASH" };
  }
  if (fromEnv) {
    console.warn(
      "[auth] ADMIN_PASSWORD_HASH diabaikan: harus sha256 hex (64 karakter). " +
        "Buat dengan: node -e \"console.log(require('node:crypto').createHash('sha256').update('sandi').digest('hex'))\""
    );
  }

  const plain = process.env.ADMIN_PASSWORD;
  if (plain) {
    console.warn("[auth] Memakai ADMIN_PASSWORD (teks biasa). Sebaiknya pakai ADMIN_PASSWORD_HASH.");
    return { hash: sha256(plain), source: "ADMIN_PASSWORD" };
  }

  console.warn(
    `[auth] ADMIN_PASSWORD_HASH belum diatur — memakai kata sandi demo "${DEMO_PASSWORD}". ` +
      "Ganti sebelum dipakai di luar lokal."
  );
  return { hash: sha256(DEMO_PASSWORD), source: "demo" };
}

const passwordConfig = resolvePasswordHash();

/** Bandingkan dua string hex dengan waktu tetap (anti timing attack). */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** @returns {boolean} true kalau kata sandi cocok. */
function checkPassword(candidate) {
  if (typeof candidate !== "string" || !candidate) return false;
  return safeEqual(sha256(candidate), passwordConfig.hash);
}

/* ------------------------------- Token ------------------------------- */

/** token -> { token, issuedAt, expiresAt, ip } */
const sessions = new Map();

function purgeExpired(now = Date.now()) {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

/** Terbitkan token baru (32 byte acak → 64 karakter hex). */
function issueToken(ip = "-") {
  purgeExpired();
  const token = crypto.randomBytes(32).toString("hex");
  const issuedAt = Date.now();
  const session = { token, issuedAt, expiresAt: issuedAt + TOKEN_TTL_MS, ip };
  sessions.set(token, session);
  return { ...session };
}

/** Cari sesi yang masih berlaku; null kalau tidak ada / kedaluwarsa. */
function findSession(token) {
  if (!token) return null;
  const session = sessions.get(String(token));
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(session.token);
    return null;
  }
  return session;
}

function revokeToken(token) {
  if (!token) return false;
  return sessions.delete(String(token));
}

function revokeAll() {
  const count = sessions.size;
  sessions.clear();
  return count;
}

/** Ambil token dari header "Authorization: Bearer <token>". */
function parseBearer(header) {
  const value = String(header || "").trim();
  if (!value) return null;
  const match = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/i.exec(value);
  return match ? match[1] : null;
}

/**
 * Wajibkan token admin yang sah pada request.
 * @throws {HttpError} 401 kalau header tidak ada / token tidak berlaku
 * @returns {{ token: string, issuedAt: number, expiresAt: number, ip: string }}
 */
function requireAdmin(req) {
  const raw = req.headers.authorization;
  if (!raw) {
    throw new HttpError(
      401,
      "UNAUTHORIZED",
      "Endpoint ini butuh token admin. Kirim header Authorization: Bearer <token>."
    );
  }

  const token = parseBearer(raw);
  if (!token) {
    throw new HttpError(401, "UNAUTHORIZED", 'Format header Authorization harus "Bearer <token>".');
  }

  const session = findSession(token);
  if (!session) {
    throw new HttpError(401, "UNAUTHORIZED", "Token tidak berlaku atau sudah kedaluwarsa. Silakan login ulang.");
  }

  return session;
}

/* ----------------------------- Rate limit ----------------------------- */

/** ip -> { count, firstAt } */
const attempts = new Map();

function attemptKey(req) {
  // Di belakang proxy, ganti dengan header X-Forwarded-For yang sudah dipercaya.
  return String(req.socket?.remoteAddress || "-");
}

function isBlocked(ip) {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > ATTEMPT_WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED_ATTEMPTS;
}

function registerFailure(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now - entry.firstAt > ATTEMPT_WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAt: now });
    return 1;
  }

  entry.count += 1;
  return entry.count;
}

function clearFailures(ip) {
  attempts.delete(ip);
}

/* Bersihkan sesi kedaluwarsa secara berkala; unref() supaya tidak menahan
   proses tetap hidup (penting untuk tests yang mematikan server). */
const sweeper = setInterval(() => purgeExpired(), 10 * 60 * 1000);
if (typeof sweeper.unref === "function") sweeper.unref();

module.exports = {
  TOKEN_TTL_MS,
  MAX_FAILED_ATTEMPTS,
  ATTEMPT_WINDOW_MS,
  passwordSource: passwordConfig.source,
  checkPassword,
  issueToken,
  findSession,
  revokeToken,
  revokeAll,
  parseBearer,
  requireAdmin,
  attemptKey,
  isBlocked,
  registerFailure,
  clearFailures,
  sha256,
};
