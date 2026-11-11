/* ==========================================================================
   TemuBalik — Route: /api/stats dan /api/admin/*
   ==========================================================================

   [BELUM]  GET  /api/stats          ringkasan jumlah laporan
   [BELUM]  POST /api/admin/login    tukar kata sandi dengan token
   [BELUM]  GET  /api/admin/me       cek token masih berlaku

   Ketiganya masih stub. Front-end sekarang belum memanggil endpoint ini,
   jadi aman dibiarkan kosong sambil dikerjakan bertahap.
   ========================================================================== */

"use strict";

const { HttpError } = require("../http");

const NOT_DONE = (name) =>
  new HttpError(
    501,
    "NOT_IMPLEMENTED",
    `${name} belum diimplementasikan (lihat TODO di server/routes/misc.js).`
  );

/** GET /api/stats */
async function getStats(req, res) {
  /* TODO: hitung dari db.readAll():
       const all = await db.readAll();
       const aktif = all.filter(r => r.status === "Aktif").length;
       const selesai = all.filter(r => r.status === "Selesai").length;
       sendJson(res, 200, { data: { total: all.length, aktif, selesai } }); */
  void req;
  void res;
  throw NOT_DONE("Endpoint statistik");
}

/** POST /api/admin/login */
async function adminLogin(req, res) {
  /* TODO: jangan simpan kata sandi di kode seperti demo front-end.
     Rencana:
       1. Simpan hash di environment variable, mis. ADMIN_PASSWORD_HASH.
          Buat hash dengan: node -e "console.log(require('node:crypto')
            .createHash('sha256').update('sandi').digest('hex'))"
       2. Bandingkan dengan timingSafeEqual.
       3. Kalau cocok, terbitkan token acak (crypto.randomBytes(32).toString('hex'))
          dan simpan di memori dengan masa berlaku, misalnya 2 jam.
       4. Kirim { data: { token, expiresAt } }. */
  void req;
  void res;
  throw NOT_DONE("Endpoint login admin");
}

/** GET /api/admin/me */
async function adminMe(req, res) {
  /* TODO: baca header Authorization: Bearer <token>, cocokkan dengan daftar
     token aktif di memori, lalu kirim { data: { admin: true } }. */
  void req;
  void res;
  throw NOT_DONE("Endpoint cek sesi admin");
}

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
    throw new HttpError(404, "NOT_FOUND", "Endpoint admin tidak ditemukan.");
  }

  return false;
}

module.exports = { handle };
