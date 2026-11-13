/* ==========================================================================
   TemuBalik — Server backend + penyaji file statis

   Jalankan:
     node server/server.js
     # atau
     npm start

   Lalu buka http://localhost:3000

   Server ini juga menyajikan file front-end (index.html, css/, js/, assets/)
   supaya tidak perlu server terpisah dan tidak ada masalah CORS.
   ========================================================================== */

"use strict";

// Muat .env SEBELUM modul lain membacanya (server/auth.js membaca
// ADMIN_PASSWORD_HASH saat pertama kali di-require).
require("./env").loadEnv();

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const { sendJson, sendError, HttpError, drainBody } = require("./http");
const reportsRoute = require("./routes/reports");
const miscRoute = require("./routes/misc");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

/* Folder yang tidak boleh diakses lewat HTTP. */
const BLOCKED_PREFIXES = ["/server", "/.git", "/node_modules", "/tests"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

/* ------------------------------ Statis ------------------------------ */

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "Hanya GET/HEAD yang didukung untuk file statis.");
  }

  // Cegah path traversal: normalisasi dulu, lalu pastikan masih di dalam ROOT.
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === "/" ? "/index.html" : decoded;
  const target = path.resolve(ROOT, "." + relative);

  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    throw new HttpError(403, "FORBIDDEN", "Akses ditolak.");
  }

  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    // Samakan dengan perilaku Firebase Hosting (`cleanUrls: true`):
    // /admin → admin.html. Tanpa ini, URL yang sama berfungsi di live
    // tetapi 404 di lokal, membingungkan saat mengembangkan.
    if (!path.extname(target)) {
      const withHtml = target + ".html";
      try {
        const st2 = await fs.stat(withHtml);
        if (st2.isFile()) {
          return sendFile(req, res, withHtml);
        }
      } catch {
        /* bukan berkas .html — lanjut 404 di bawah */
      }
    }
    throw new HttpError(404, "NOT_FOUND", `File "${relative}" tidak ditemukan.`);
  }

  // Kalau yang diminta folder, layani index.html di dalamnya.
  if (stat.isDirectory()) {
    const file = path.join(target, "index.html");
    try {
      await fs.access(file);
    } catch {
      throw new HttpError(404, "NOT_FOUND", `Folder "${relative}" tidak punya index.html.`);
    }
    return sendFile(req, res, file);
  }

  return sendFile(req, res, target);
}

/** Kirim satu berkas dengan header yang sesuai. */
async function sendFile(req, res, file) {
  const body = await fs.readFile(file);
  const ext = path.extname(file).toLowerCase();

  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300",
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

/* ------------------------------- API ------------------------------- */

async function handleApi(req, res, pathname, url) {
  if (pathname === "/api/health" || pathname === "/api/health/") {
    if (req.method !== "GET") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Gunakan GET untuk /api/health.");
    }
    sendJson(res, 200, {
      data: { status: "ok", time: new Date().toISOString(), uptime: Math.round(process.uptime()) },
    });
    return;
  }

  if (await reportsRoute.handle(req, res, pathname, url)) return;
  if (await miscRoute.handle(req, res, pathname)) return;

  throw new HttpError(404, "NOT_FOUND", `Endpoint ${pathname} tidak ditemukan.`);
}

/* ------------------------------ Server ------------------------------ */

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  res.on("finish", () => {
    const ms = Date.now() - started;
    console.log(`${req.method} ${pathname} → ${res.statusCode} (${ms}ms)`);
  });

  // Preflight CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  try {
    if (BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      throw new HttpError(403, "FORBIDDEN", "Path ini tidak boleh diakses.");
    }

    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname, url);
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (err) {
    // Body yang belum dibaca harus dibuang, kalau tidak koneksi keep-alive
    // bisa tertahan menunggu data yang tidak akan pernah dikonsumsi.
    drainBody(req);
    sendError(res, err);
  }
});

server.on("clientError", (err, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("  TemuBalik backend siap.");
  console.log(`  Web    : http://${HOST}:${PORT}`);
  console.log(`  API    : http://${HOST}:${PORT}/api/reports`);
  console.log(`  Health : http://${HOST}:${PORT}/api/health`);
  console.log("");
  console.log("  Ctrl+C untuk berhenti.");
  console.log("");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`\n[server] menerima ${signal}, menutup server...`);
    server.close(() => process.exit(0));
    // Jangan menggantung kalau ada koneksi keep-alive yang belum selesai.
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

module.exports = server;
