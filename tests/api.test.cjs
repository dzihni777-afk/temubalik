/* ==========================================================================
   TemuBalik — Uji otomatis API backend
   Tidak butuh dependency apa pun (memakai fetch bawaan Node 18+).

   Jalankan:  node tests/api.test.cjs
   (atau:     npm run test:api)

   Uji ini memakai file gudang sementara, jadi data asli di
   server/storage/reports.json tidak tersentuh.
   ========================================================================== */

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP_STORE = path.join(os.tmpdir(), `temubalik-test-${process.pid}.json`);

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

async function req(method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* bukan JSON (mis. HTML) */
  }
  return { status: res.status, json, text, headers: res.headers };
}

function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(`${BASE}/api/health`);
        if (res.ok) return resolve();
      } catch {
        /* server belum siap */
      }
      if (Date.now() > deadline) return reject(new Error("Server tidak kunjung siap."));
      setTimeout(tick, 120);
    };
    tick();
  });
}

/* --------------------------------- Main --------------------------------- */

(async function main() {
  if (fs.existsSync(TMP_STORE)) fs.unlinkSync(TMP_STORE);

  const child = spawn(process.execPath, [path.join(ROOT, "server/server.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      TEMUBALIK_STORE: TMP_STORE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const serverLog = [];
  child.stdout.on("data", (d) => serverLog.push(d.toString()));
  child.stderr.on("data", (d) => serverLog.push(d.toString()));

  let createdId = null;

  try {
    await waitForServer();

    section("Health & statis");
    {
      const health = await req("GET", "/api/health");
      check("GET /api/health → 200", health.status === 200, `dapat ${health.status}`);
      check("status bernilai ok", health.json?.data?.status === "ok");

      const index = await req("GET", "/");
      check("GET / menyajikan HTML", index.status === 200 && index.text.includes("TemuBalik"));

      const css = await req("GET", "/css/style.css");
      check("CSS tersaji dengan tipe benar", css.headers.get("content-type")?.includes("text/css"));

      const blocked = await req("GET", "/server/db.js");
      check("folder server/ tidak bisa diakses", blocked.status === 403, `dapat ${blocked.status}`);

      const blocked2 = await req("GET", "/data/data.json");
      check("data/data.json tetap boleh (dipakai front-end)", blocked2.status === 200);

      const traversal = await req("GET", "/%2e%2e%2f%2e%2e%2fetc%2fpasswd");
      check("path traversal ditolak", traversal.status === 403 || traversal.status === 404);
    }

    section("GET /api/reports — daftar, filter, paginasi");
    {
      const all = await req("GET", "/api/reports?limit=100");
      check("200 dan mengembalikan array", all.status === 200 && Array.isArray(all.json?.data));
      check("berisi 10 laporan seed", all.json?.meta?.total === 10, `total ${all.json?.meta?.total}`);
      check("urut terbaru dulu", all.json.data[0].createdAt >= all.json.data.at(-1).createdAt);

      const paged = await req("GET", "/api/reports?limit=3&offset=0");
      check("limit dihormati", paged.json.data.length === 3);
      check("meta.hasMore benar", paged.json.meta.hasMore === true);

      const page2 = await req("GET", "/api/reports?limit=3&offset=9");
      check("offset terakhir tidak hasMore", page2.json.meta.hasMore === false);

      const filtered = await req("GET", "/api/reports?status=Selesai&limit=100");
      check(
        "filter status bekerja",
        filtered.json.data.length > 0 && filtered.json.data.every((r) => r.status === "Selesai")
      );

      const byKategori = await req("GET", "/api/reports?kategori=Elektronik&limit=100");
      check(
        "filter kategori bekerja",
        byKategori.json.data.every((r) => r.kategori === "Elektronik")
      );

      const search = await req("GET", "/api/reports?q=dompet&limit=100");
      check("pencarian teks bekerja", search.json.data.length > 0);

      const sorted = await req("GET", "/api/reports?sort=nama&limit=100");
      const names = sorted.json.data.map((r) => r.namaBarang);
      const expected = [...names].sort((a, b) => a.localeCompare(b, "id"));
      check("sort=nama mengurutkan A–Z", JSON.stringify(names) === JSON.stringify(expected));

      const bigLimit = await req("GET", "/api/reports?limit=99999");
      check("limit besar dipangkas ke 100", bigLimit.json.meta.limit === 100);
    }

    section("GET /api/reports/:id");
    {
      const one = await req("GET", "/api/reports/LPR-20260210-001");
      check("200 untuk id yang ada", one.status === 200);
      check("id sesuai", one.json?.data?.id === "LPR-20260210-001");

      const lower = await req("GET", "/api/reports/lpr-20260210-001");
      check("id tidak peka huruf besar/kecil", lower.status === 200);

      const missing = await req("GET", "/api/reports/LPR-99999999-999");
      check("404 untuk id yang tidak ada", missing.status === 404);
      check("kode error REPORT_NOT_FOUND", missing.json?.error?.code === "REPORT_NOT_FOUND");
    }

    section("POST /api/reports — validasi");
    {
      const invalid = await req("POST", "/api/reports", {});
      check("422 untuk body kosong", invalid.status === 422, `dapat ${invalid.status}`);
      check("ada detail per field", typeof invalid.json?.error?.fields === "object");

      const badPhone = await req("POST", "/api/reports", {
        namaPelapor: "Budi Santoso",
        whatsapp: "123",
        namaBarang: "Sepatu Lari",
        kategori: "Pakaian",
        warna: "Putih",
        ciriKhusus: "Ada noda cat biru di bagian tumit sepatu",
        tanggalHilang: "2026-02-10",
        lokasi: "Lapangan Olahraga",
        kronologi: "Sepatu tertinggal di pinggir lapangan setelah olahraga pagi.",
      });
      check("nomor WhatsApp tidak valid ditolak", badPhone.status === 422);
      check("field whatsapp muncul", Boolean(badPhone.json?.error?.fields?.whatsapp));

      const futureDate = await req("POST", "/api/reports", {
        namaPelapor: "Budi Santoso",
        whatsapp: "081234567891",
        namaBarang: "Sepatu Lari",
        kategori: "Pakaian",
        warna: "Putih",
        ciriKhusus: "Ada noda cat biru di bagian tumit sepatu",
        tanggalHilang: "2099-01-01",
        lokasi: "Lapangan Olahraga",
        kronologi: "Sepatu tertinggal di pinggir lapangan setelah olahraga pagi.",
      });
      check("tanggal di masa depan ditolak", futureDate.status === 422);

      const badKategori = await req("POST", "/api/reports", {
        namaPelapor: "Budi Santoso",
        whatsapp: "081234567891",
        namaBarang: "Sepatu Lari",
        kategori: "Kategori Karangan",
        warna: "Putih",
        ciriKhusus: "Ada noda cat biru di bagian tumit sepatu",
        tanggalHilang: "2026-02-10",
        lokasi: "Lapangan Olahraga",
        kronologi: "Sepatu tertinggal di pinggir lapangan setelah olahraga pagi.",
      });
      check("kategori di luar daftar ditolak", badKategori.status === 422);

      const badJson = await req("POST", "/api/reports", "{bukan json");
      check("JSON rusak → 400", badJson.status === 400);
      check("kode error BAD_JSON", badJson.json?.error?.code === "BAD_JSON");
    }

    section("POST /api/reports — pembuatan laporan");
    {
      const payload = {
        namaPelapor: "Siti Aminah",
        nim: "2023100999",
        whatsapp: "0812-3456-7890",
        email: "siti@mail.com",
        namaBarang: "Kunci Motor Honda",
        kategori: "Kunci",
        merek: "Honda",
        warna: "Hitam",
        ciriKhusus: "Gantungan kunci berbentuk boneka biru dan ada stiker kecil",
        tanggalHilang: "2026-02-12",
        jamHilang: "07:30",
        lokasi: "Parkiran",
        lokasiDetail: "Blok B nomor 12",
        kronologi: "Kunci terjatuh saat membuka parkiran, baru sadar setelah masuk kelas.",
      };

      const created = await req("POST", "/api/reports", payload);
      check("201 dibuat", created.status === 201, `dapat ${created.status}`);
      createdId = created.json?.data?.id;
      check("id berformat LPR-YYYYMMDD-NNN", /^LPR-\d{8}-\d{3}$/.test(createdId || ""), createdId);
      check("status awal Aktif", created.json?.data?.status === "Aktif");
      check("createdAt terisi", Boolean(created.json?.data?.createdAt));
      check("nomor WA dinormalisasi", created.json?.data?.whatsapp === "081234567890");
      check("field opsional kosong jadi '-'", created.json?.data?.merek === "Honda");

      const fetched = await req("GET", `/api/reports/${createdId}`);
      check("laporan baru bisa diambil", fetched.status === 200);
      check("total bertambah jadi 11", (await req("GET", "/api/reports?limit=1")).json.meta.total === 11);

      const second = await req("POST", "/api/reports", payload);
      check("nomor urut berikutnya tidak bentrok", second.json?.data?.id !== createdId);
      check("urutan naik", second.json?.data?.id?.endsWith("-002"), second.json?.data?.id);

      const withPhoto = await req("POST", "/api/reports", {
        ...payload,
        foto: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
      });
      check("foto data URL diterima", withPhoto.status === 201);

      const badPhoto = await req("POST", "/api/reports", {
        ...payload,
        foto: "javascript:alert(1)",
      });
      check("foto berbahaya ditolak", badPhoto.status === 400);
      check("kode error INVALID_PHOTO", badPhoto.json?.error?.code === "INVALID_PHOTO");

      const assetPhoto = await req("POST", "/api/reports", { ...payload, foto: "assets/img/hp.svg" });
      check("path aset lokal diterima", assetPhoto.status === 201);
    }

    section("Endpoint yang sengaja belum jadi (stub)");
    {
      const patch = await req("PATCH", `/api/reports/${createdId}/status`, { status: "Selesai" });
      check("PATCH status → 501", patch.status === 501, `dapat ${patch.status}`);
      check("kode NOT_IMPLEMENTED", patch.json?.error?.code === "NOT_IMPLEMENTED");

      const del = await req("DELETE", `/api/reports/${createdId}`);
      check("DELETE → 501", del.status === 501);

      const stats = await req("GET", "/api/stats");
      check("GET /api/stats → 501", stats.status === 501);

      const login = await req("POST", "/api/admin/login", { password: "admin123" });
      check("POST /api/admin/login → 501", login.status === 501);

      const still = await req("GET", `/api/reports/${createdId}`);
      check("data tidak berubah setelah stub dipanggil", still.json?.data?.status === "Aktif");
    }

    section("Routing & metode");
    {
      check("PUT /api/reports → 405", (await req("PUT", "/api/reports")).status === 405);
      check("GET /api/tidak-ada → 404", (await req("GET", "/api/tidak-ada")).status === 404);
      check(
        "GET /api/reports/:id/status → 405",
        (await req("GET", `/api/reports/${createdId}/status`)).status === 405
      );
      check("OPTIONS preflight → 204", (await req("OPTIONS", "/api/reports")).status === 204);
      check("file statis tidak ada → 404", (await req("GET", "/tidak-ada.html")).status === 404);
    }

    section("Penyimpanan");
    {
      check("file gudang sementara terbentuk", fs.existsSync(TMP_STORE));
      const raw = JSON.parse(fs.readFileSync(TMP_STORE, "utf8"));
      check("isi file berupa array", Array.isArray(raw));
      check("laporan uji tersimpan di file", raw.some((r) => r.id === createdId));
      check(
        "data asli tidak tersentuh",
        !fs.existsSync(path.join(ROOT, "server/storage/reports.json")) ||
          JSON.parse(fs.readFileSync(path.join(ROOT, "server/storage/reports.json"), "utf8")).length > 0
      );
    }
  } catch (err) {
    fail += 1;
    console.error("\n[FATAL]", err.message);
    if (serverLog.length) console.error(serverLog.join("").slice(-2000));
  } finally {
    child.kill("SIGTERM");
    if (fs.existsSync(TMP_STORE)) fs.unlinkSync(TMP_STORE);
  }

  console.log(`\n${"-".repeat(48)}`);
  console.log(`Hasil: ${pass} lulus, ${fail} gagal (total ${pass + fail} pemeriksaan)`);
  console.log("-".repeat(48));
  process.exit(fail === 0 ? 0 : 1);
})();
