/* ==========================================================================
   TemuBalik — Route: /api/reports
   ==========================================================================

   Daftar endpoint:

   [PUBLIK]  GET    /api/reports             daftar + filter + pencarian + paginasi
   [PUBLIK]  GET    /api/reports/:id         ambil satu laporan
   [PUBLIK]  POST   /api/reports             buat laporan baru (validasi + nomor otomatis)
   [ADMIN]   PATCH  /api/reports/:id/status  ubah status Aktif/Selesai
   [ADMIN]   DELETE /api/reports/:id         hapus laporan

   Endpoint bertanda [ADMIN] wajib menyertakan header:
     Authorization: Bearer <token>
   Token didapat dari POST /api/admin/login (lihat routes/misc.js).
   ========================================================================== */

"use strict";

const db = require("../db");
const { HttpError, sendJson, readJsonBody, drainBody } = require("../http");
const { validateCreate, validateStatus } = require("../validate");
const { requireAdmin } = require("../auth");

const PAGE_SIZE_DEFAULT = 9;
const PAGE_SIZE_MAX = 100;

/* ---------------------------- Helper ---------------------------- */

/** Pecah path menjadi segmen: "/api/reports/x/status" -> ["reports","x","status"] */
function segments(pathname) {
  return pathname.split("/").filter(Boolean).slice(1); // buang "api"
}

/** Normalisasi foto: hanya izinkan data URL gambar atau path aset lokal. */
function normalizeFoto(foto) {
  const value = String(foto || "").trim();

  if (!value) return "assets/img/placeholder.svg";

  if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(value)) {
    // Batasi ~3MB base64 supaya file JSON tidak membengkak tanpa kendali.
    if (value.length > 4 * 1024 * 1024) {
      throw new HttpError(413, "PHOTO_TOO_LARGE", "Ukuran foto terlalu besar (maksimal ~3MB).");
    }
    return value;
  }

  // Path aset bawaan, contoh: assets/img/hp.svg
  if (/^assets\/img\/[A-Za-z0-9._-]+\.(svg|png|jpe?g|webp)$/.test(value)) return value;

  // Selain itu jangan disimpan: bisa jadi URL eksternal atau skrip.
  throw new HttpError(400, "INVALID_PHOTO", "Format foto tidak dikenali.");
}

/* ---------------------------- Handlers ---------------------------- */

/** GET /api/reports */
async function listReports(url, res) {
  const all = await db.readAll();

  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const kategori = (url.searchParams.get("kategori") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();
  const lokasi = (url.searchParams.get("lokasi") || "").trim();
  const sort = (url.searchParams.get("sort") || "terbaru").trim();

  const limitRaw = Number(url.searchParams.get("limit") || PAGE_SIZE_DEFAULT);
  const offsetRaw = Number(url.searchParams.get("offset") || 0);

  const limit = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : PAGE_SIZE_DEFAULT)
  );
  const offset = Math.max(0, Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0);

  let rows = all.filter((r) => {
    if (kategori && r.kategori !== kategori) return false;
    if (status && r.status !== status) return false;
    if (lokasi && r.lokasi !== lokasi) return false;

    if (q) {
      const haystack = [
        r.namaBarang, r.lokasi, r.id, r.kategori,
        r.merek, r.warna, r.ciriKhusus, r.namaPelapor, r.lokasiDetail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  if (sort === "terlama") {
    rows = rows.slice().reverse(); // readAll sudah terbaru-dulu
  } else if (sort === "nama") {
    rows = rows
      .slice()
      .sort((a, b) => String(a.namaBarang).localeCompare(String(b.namaBarang), "id"));
  }

  const total = rows.length;
  const page = rows.slice(offset, offset + limit);

  sendJson(res, 200, {
    data: page,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + page.length < total,
    },
  });
}

/** GET /api/reports/:id */
async function getReport(id, res) {
  const report = await db.findById(id);
  if (!report) {
    throw new HttpError(404, "REPORT_NOT_FOUND", `Laporan dengan kode "${id}" tidak ditemukan.`);
  }
  sendJson(res, 200, { data: report });
}

/** POST /api/reports */
async function createReport(req, res) {
  const body = await readJsonBody(req);
  const { ok, errors, value } = validateCreate(body);

  if (!ok) {
    throw new HttpError(422, "VALIDATION_ERROR", "Data laporan belum lengkap atau tidak valid.", errors);
  }

  value.foto = normalizeFoto(value.foto);

  const report = await db.mutate((rows) => {
    const now = new Date().toISOString();
    const record = {
      id: db.nextId(rows),
      ...value,
      merek: value.merek || "-",
      nim: value.nim || "-",
      lokasiDetail: value.lokasiDetail || "-",
      foto: value.foto || "assets/img/placeholder.svg",
      status: "Aktif",
      createdAt: now,
      updatedAt: now,
    };
    rows.push(record);
    return record;
  });

  sendJson(res, 201, { data: report });
}

/** PATCH /api/reports/:id/status — ubah status (butuh token admin) */
async function updateStatus(id, req, res) {
  try {
    requireAdmin(req);
  } catch (err) {
    drainBody(req);
    throw err;
  }

  const body = await readJsonBody(req);
  const { ok, errors, value } = validateStatus(body);

  if (!ok) {
    throw new HttpError(422, "VALIDATION_ERROR", "Status yang dikirim tidak valid.", errors);
  }

  const updated = await db.mutate((rows) => {
    const key = String(id).trim().toUpperCase();
    const row = rows.find((r) => String(r.id).toUpperCase() === key);
    if (!row) {
      throw new HttpError(404, "REPORT_NOT_FOUND", `Laporan dengan kode "${id}" tidak ditemukan.`);
    }

    row.status = value.status;
    row.updatedAt = new Date().toISOString();
    return { ...row };
  });

  sendJson(res, 200, { data: updated });
}

/** DELETE /api/reports/:id — hapus laporan (butuh token admin) */
async function deleteReport(id, req, res) {
  try {
    requireAdmin(req);
  } catch (err) {
    drainBody(req);
    throw err;
  }

  const deleted = await db.mutate((rows) => {
    const key = String(id).trim().toUpperCase();
    const idx = rows.findIndex((r) => String(r.id).toUpperCase() === key);
    if (idx < 0) {
      throw new HttpError(404, "REPORT_NOT_FOUND", `Laporan dengan kode "${id}" tidak ditemukan.`);
    }

    const [removed] = rows.splice(idx, 1);
    return { id: removed.id, deleted: true, namaBarang: removed.namaBarang || "-" };
  });

  sendJson(res, 200, { data: deleted });
}

/* ---------------------------- Router ---------------------------- */

async function handle(req, res, pathname, url) {
  const seg = segments(pathname); // ["reports", id?, "status"?]

  if (seg[0] !== "reports") return false;

  const id = seg[1] ? decodeURIComponent(seg[1]) : null;
  const sub = seg[2] || null;
  const method = req.method;

  // /api/reports
  if (!id) {
    if (method === "GET") {
      await listReports(url, res);
      return true;
    }
    if (method === "POST") {
      await createReport(req, res);
      return true;
    }
    throw new HttpError(405, "METHOD_NOT_ALLOWED", `Metode ${method} tidak didukung untuk /api/reports.`);
  }

  // /api/reports/:id
  if (!sub) {
    if (method === "GET") {
      await getReport(id, res);
      return true;
    }
    if (method === "DELETE") {
      await deleteReport(id, req, res);
      return true;
    }
    throw new HttpError(405, "METHOD_NOT_ALLOWED", `Metode ${method} tidak didukung untuk endpoint ini.`);
  }

  // /api/reports/:id/status
  if (sub === "status") {
    if (method === "PATCH") {
      await updateStatus(id, req, res);
      return true;
    }
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "Gunakan PATCH untuk mengubah status.");
  }

  throw new HttpError(404, "NOT_FOUND", "Endpoint tidak ditemukan.");
}

module.exports = { handle };
