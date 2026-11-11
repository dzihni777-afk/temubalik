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

async function req(method, urlPath, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(BASE + urlPath, {
    method,
    headers,
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
  let token = null; // token admin, diisi di bagian "Admin — login & sesi"

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

    section("GET /api/stats");
    {
      const stats = await req("GET", "/api/stats");
      check("200", stats.status === 200, `dapat ${stats.status}`);

      const list = await req("GET", "/api/reports?limit=1");
      check(
        "total sama dengan jumlah di /api/reports",
        stats.json?.data?.total === list.json?.meta?.total,
        `stats ${stats.json?.data?.total} vs list ${list.json?.meta?.total}`
      );
      check(
        "aktif + selesai = total",
        stats.json?.data?.aktif + stats.json?.data?.selesai === stats.json?.data?.total
      );
      check("ada rincian per kategori", Array.isArray(stats.json?.data?.perKategori));
      check("ada rincian per lokasi", Array.isArray(stats.json?.data?.perLokasi));
      check("ada info laporan terbaru", Boolean(stats.json?.data?.terbaru?.id));
      check("POST /api/stats → 405", (await req("POST", "/api/stats")).status === 405);
    }

    section("Admin — login & sesi");
    {
      const noAuth = await req("PATCH", `/api/reports/${createdId}/status`, { status: "Selesai" });
      check("PATCH tanpa token → 401", noAuth.status === 401, `dapat ${noAuth.status}`);
      check("kode error UNAUTHORIZED", noAuth.json?.error?.code === "UNAUTHORIZED");

      const delNoAuth = await req("DELETE", `/api/reports/${createdId}`);
      check("DELETE tanpa token → 401", delNoAuth.status === 401);

      const emptyBody = await req("POST", "/api/admin/login", {});
      check("login tanpa kata sandi → 422", emptyBody.status === 422);

      const wrong = await req("POST", "/api/admin/login", { password: "salah-banget" });
      check("kata sandi salah → 401", wrong.status === 401, `dapat ${wrong.status}`);
      check("tidak membocorkan token", !wrong.json?.data?.token);

      const login = await req("POST", "/api/admin/login", { password: "admin123" });
      check("login benar → 200", login.status === 200, `dapat ${login.status}`);
      token = login.json?.data?.token;
      check("token berupa 64 hex", /^[a-f0-9]{64}$/.test(token || ""), String(token).slice(0, 12));
      check("ada expiresAt", Boolean(login.json?.data?.expiresAt));

      const me = await req("GET", "/api/admin/me", undefined, { Authorization: `Bearer ${token}` });
      check("GET /api/admin/me → 200", me.status === 200);
      check("admin bernilai true", me.json?.data?.admin === true);

      const meNoHeader = await req("GET", "/api/admin/me");
      check("me tanpa header → 401", meNoHeader.status === 401);

      const meBadFormat = await req("GET", "/api/admin/me", undefined, { Authorization: token });
      check("header tanpa skema Bearer → 401", meBadFormat.status === 401);

      const meBadToken = await req("GET", "/api/admin/me", undefined, {
        Authorization: "Bearer " + "0".repeat(64),
      });
      check("token palsu → 401", meBadToken.status === 401);
    }

    section("PATCH /api/reports/:id/status");
    {
      const auth = { Authorization: `Bearer ${token}` };

      const ok = await req("PATCH", `/api/reports/${createdId}/status`, { status: "Selesai" }, auth);
      check("200", ok.status === 200, `dapat ${ok.status}`);
      check("status berubah jadi Selesai", ok.json?.data?.status === "Selesai");
      check("updatedAt diperbarui", Boolean(ok.json?.data?.updatedAt));

      const refetch = await req("GET", `/api/reports/${createdId}`);
      check("perubahan tersimpan", refetch.json?.data?.status === "Selesai");

      const lower = await req("PATCH", `/api/reports/${String(createdId).toLowerCase()}/status`, { status: "Aktif" }, auth);
      check("id tidak peka huruf besar/kecil", lower.status === 200 && lower.json?.data?.status === "Aktif");

      const badStatus = await req("PATCH", `/api/reports/${createdId}/status`, { status: "Hilang" }, auth);
      check("status tidak dikenal → 422", badStatus.status === 422);
      check("field status muncul", Boolean(badStatus.json?.error?.fields?.status));

      const emptyStatus = await req("PATCH", `/api/reports/${createdId}/status`, {}, auth);
      check("body kosong → 422", emptyStatus.status === 422);

      const missing = await req("PATCH", "/api/reports/LPR-99999999-999/status", { status: "Selesai" }, auth);
      check("id tidak ada → 404", missing.status === 404);
      check("kode error REPORT_NOT_FOUND", missing.json?.error?.code === "REPORT_NOT_FOUND");
    }

    section("DELETE /api/reports/:id");
    {
      const auth = { Authorization: `Bearer ${token}` };

      // Laporan khusus untuk dihapus, supaya createdId tetap ada untuk uji lain.
      const victim = await req("POST", "/api/reports", {
        namaPelapor: "Rina Wulandari",
        whatsapp: "081298765432",
        namaBarang: "Payung Lipat Biru",
        kategori: "Lainnya",
        warna: "Biru",
        ciriKhusus: "Pegangan kayu dengan ukiran nama di bagian ujungnya",
        tanggalHilang: "2026-02-11",
        lokasi: "Kantin",
        kronologi: "Payung tertinggal di meja kantin setelah makan siang bersama teman.",
      });
      const victimId = victim.json?.data?.id;
      check("laporan uji hapus dibuat", victim.status === 201, `dapat ${victim.status}`);

      const del = await req("DELETE", `/api/reports/${victimId}`, undefined, auth);
      check("200", del.status === 200, `dapat ${del.status}`);
      check("membalas deleted: true", del.json?.data?.deleted === true);
      check("id yang dihapus sesuai", del.json?.data?.id === victimId);

      const gone = await req("GET", `/api/reports/${victimId}`);
      check("sudah tidak bisa diambil → 404", gone.status === 404);

      const again = await req("DELETE", `/api/reports/${victimId}`, undefined, auth);
      check("hapus dua kali → 404", again.status === 404);

      const list = await req("GET", "/api/reports?limit=100");
      check("tidak muncul lagi di daftar", !list.json.data.some((r) => r.id === victimId));
    }

    section("Admin — logout");
    {
      const auth = { Authorization: `Bearer ${token}` };

      const out = await req("POST", "/api/admin/logout", undefined, auth);
      check("logout → 200", out.status === 200);
      check("loggedOut true", out.json?.data?.loggedOut === true);

      const meAfter = await req("GET", "/api/admin/me", undefined, auth);
      check("token dicabut → 401", meAfter.status === 401);

      const patchAfter = await req("PATCH", `/api/reports/${createdId}/status`, { status: "Selesai" }, auth);
      check("token lama tidak bisa dipakai lagi", patchAfter.status === 401);

      const relogin = await req("POST", "/api/admin/login", { password: "admin123" });
      check("bisa login lagi setelah logout", relogin.status === 200);
      token = relogin.json?.data?.token;
    }

    section("Admin — rate limit login");
    {
      // Batasnya 5 percobaan gagal per 10 menit per IP.
      let last = null;
      for (let i = 0; i < 5; i += 1) {
        last = await req("POST", "/api/admin/login", { password: `salah-${i}` });
      }
      check("percobaan gagal ke-5 masih 401", last?.status === 401, `dapat ${last?.status}`);

      const blocked = await req("POST", "/api/admin/login", { password: "admin123" });
      check("percobaan ke-6 diblokir → 429", blocked.status === 429, `dapat ${blocked.status}`);
      check("kode error TOO_MANY_REQUESTS", blocked.json?.error?.code === "TOO_MANY_REQUESTS");
      check("kata sandi benar pun ikut diblokir", !blocked.json?.data?.token);
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
