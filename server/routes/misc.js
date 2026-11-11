/* ==========================================================================
   TemuBalik — Route: /api/stats dan /api/admin/*

   [PUBLIK]  GET  /api/stats          ringkasan jumlah laporan
   [PUBLIK]  POST /api/admin/login    tukar kata sandi dengan token
   [ADMIN]   GET  /api/admin/me       cek token masih berlaku
   [ADMIN]   POST /api/admin/logout   cabut token (opsional, untuk tombol keluar)

   Endpoint [ADMIN] butuh header: Authorization: Bearer <token>
   ========================================================================== */

"use strict";

const db = require("../db");
const { HttpError, sendJson, readJsonBody, drainBody } = require("../http");
const { KATEGORI, LOKASI } = require("../validate");
const auth = require("../auth");

/* ------------------------------ /api/stats ------------------------------ */

/** GET /api/stats */
async function getStats(req, res) {
  void req;

  const all = await db.readAll();

  const aktif = all.filter((r) => r.status === "Aktif").length;
  const selesai = all.filter((r) => r.status === "Selesai").length;

  // Rincian per kategori & lokasi, urut dari yang paling banyak.
  const perKategori = KATEGORI.map((nama) => ({
    kategori: nama,
    jumlah: all.filter((r) => r.kategori === nama).length,
  })).sort((a, b) => b.jumlah - a.jumlah);

  const perLokasi = LOKASI.map((nama) => ({
    lokasi: nama,
    jumlah: all.filter((r) => r.lokasi === nama).length,
  })).sort((a, b) => b.jumlah - a.jumlah);

  const terbaru = all[0] || null;

  sendJson(res, 200, {
    data: {
      total: all.length,
      aktif,
      selesai,
      perKategori,
      perLokasi,
      terbaru: terbaru ? { id: terbaru.id, namaBarang: terbaru.namaBarang, createdAt: terbaru.createdAt } : null,
    },
  });
}

/* -------------------------- /api/admin/login -------------------------- */

/** POST /api/admin/login — body: { password } */
async function adminLogin(req, res) {
  const ip = auth.attemptKey(req);

  if (auth.isBlocked(ip)) {
    drainBody(req);
    throw new HttpError(
      429,
      "TOO_MANY_REQUESTS",
      `Terlalu banyak percobaan login gagal. Coba lagi dalam ${Math.round(
        auth.ATTEMPT_WINDOW_MS / 60000
      )} menit.`
    );
  }

  const body = await readJsonBody(req);
  const password = typeof body.password === "string" ? body.password : "";

  if (!password) {
    throw new HttpError(422, "VALIDATION_ERROR", "Kata sandi wajib diisi.", {
      password: "Kata sandi wajib diisi.",
    });
  }

  if (!auth.checkPassword(password)) {
    const failed = auth.registerFailure(ip);
    console.warn(`[auth] login gagal dari ${ip} (percobaan ${failed}/${auth.MAX_FAILED_ATTEMPTS})`);

    throw new HttpError(401, "UNAUTHORIZED", "Kata sandi salah.", {
      password: "Kata sandi salah.",
    });
  }

  auth.clearFailures(ip);

  const session = auth.issueToken(ip);

  sendJson(res, 200, {
    data: {
      token: session.token,
      tokenType: "Bearer",
      issuedAt: new Date(session.issuedAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      expiresIn: Math.round((session.expiresAt - Date.now()) / 1000),
    },
  });
}

/* ---------------------------- /api/admin/me ---------------------------- */

/** GET /api/admin/me */
async function adminMe(req, res) {
  let session;
  try {
    session = auth.requireAdmin(req);
  } catch (err) {
    drainBody(req);
    throw err;
  }

  sendJson(res, 200, {
    data: {
      admin: true,
      issuedAt: new Date(session.issuedAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      expiresIn: Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000)),
    },
  });
}

/* -------------------------- /api/admin/logout -------------------------- */

/** POST /api/admin/logout — cabut token yang sedang dipakai. */
async function adminLogout(req, res) {
  let session;
  try {
    session = auth.requireAdmin(req);
  } catch (err) {
    drainBody(req);
    throw err;
  }

  auth.revokeToken(session.token);
  sendJson(res, 200, { data: { admin: false, loggedOut: true } });
}

/* ------------------------------- Router ------------------------------- */

async function handle(req, res, pathname) {
  const seg = pathname.split("/").filter(Boolean).slice(1); // buang "api"
  const method = req.method;

  if (seg[0] === "stats" && seg.length === 1) {
    if (method !== "GET") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Gunakan GET untuk /api/stats.");
    }
    await getStats(req, res);
    return true;
  }

  if (seg[0] === "admin") {
    if (seg[1] === "login" && seg.length === 2) {
      if (method !== "POST") {
        throw new HttpError(405, "METHOD_NOT_ALLOWED", "Gunakan POST untuk /api/admin/login.");
      }
      await adminLogin(req, res);
      return true;
    }
    if (seg[1] === "me" && seg.length === 2) {
      if (method !== "GET") {
        throw new HttpError(405, "METHOD_NOT_ALLOWED", "Gunakan GET untuk /api/admin/me.");
      }
      await adminMe(req, res);
      return true;
    }
    if (seg[1] === "logout" && seg.length === 2) {
      if (method !== "POST") {
        throw new HttpError(405, "METHOD_NOT_ALLOWED", "Gunakan POST untuk /api/admin/logout.");
      }
      await adminLogout(req, res);
      return true;
    }
    throw new HttpError(404, "NOT_FOUND", "Endpoint admin tidak ditemukan.");
  }

  return false;
}

module.exports = { handle };
