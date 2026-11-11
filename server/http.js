/* ==========================================================================
   TemuBalik — Helper HTTP
   Dipakai oleh server.js dan semua file di routes/.
   ========================================================================== */

"use strict";

/* Foto dikirim sebagai base64 di dalam JSON, jadi body dilonggarkan.
   TODO (produksi): kalau nanti upload pakai multipart, angka ini bisa dikecilkan. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, code, message, fields = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function baseHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    // TODO (produksi): jangan "*". Batasi ke origin frontend yang sebenarnya,
    // misalnya "http://localhost:3000".
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...baseHeaders(),
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** Kirim error dalam bentuk { error: { code, message, fields? } }. */
function sendError(res, err) {
  if (err instanceof HttpError) {
    sendJson(res, err.status, {
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    });
    return;
  }

  // Error tak terduga: jangan bocorkan stack ke klien.
  console.error("[server] error tak tertangani:", err);
  sendJson(res, 500, {
    error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan pada server." },
  });
}

/** Baca body JSON. Body kosong dianggap {}. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(
          new HttpError(413, "PAYLOAD_TOO_LARGE", "Body permintaan terlalu besar (maksimal 8MB).")
        );
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("error", reject);

    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "BAD_JSON", "Body permintaan bukan JSON yang valid."));
      }
    });
  });
}

/**
 * Buang sisa body tanpa menyimpannya.
 * Dipakai saat request ditolak lebih awal (mis. token admin tidak sah):
 * kalau body dibiarkan mengalir, koneksi keep-alive bisa kacau untuk
 * request berikutnya di socket yang sama.
 */
function drainBody(req) {
  if (req.readableEnded || req.destroyed) return;
  req.on("error", () => {});
  req.resume();
}

module.exports = { HttpError, sendJson, sendError, readJsonBody, drainBody, MAX_BODY_BYTES };
