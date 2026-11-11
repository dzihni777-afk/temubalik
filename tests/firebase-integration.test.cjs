/* ==========================================================================
   Uji integrasi Firebase TANPA Firestore asli.

   Cara kerja: SDK Firebase asli dimuat dari CDN, tapi koneksi Firestore-nya
   diarahkan ke server tiruan lokal lewat `db.useEmulator`-style stub.
   Ini menguji jalur kode adapter (query, Timestamp, counter, auth)
   tanpa menyentuh project Firebase Anda.

   Jalankan: node tests/firebase-integration.test.cjs
   ========================================================================== */

"use strict";

const { JSDOM, ResourceLoader } = require("jsdom");
const http = require("node:http");

const PORT = 3555;
const BASE = `http://127.0.0.1:${PORT}/`;

let pass = 0;
let fail = 0;

const check = (name, cond, extra = "") => {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------
   Halaman uji: memuat SDK Firebase asli, lalu mengganti Firestore & Auth
   dengan tiruan SEBELUM adapter dipakai.
   ------------------------------------------------------------------------- */
const TEST_HTML = `<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8" /><title>uji</title></head>
<body>
<div id="out"></div>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script>
  // ---- Ganti Firestore dengan tiruan ----
  const docs = new Map();
  const counters = new Map();
  window.__mockDocs = docs;

  function ts(d) { return { toDate: () => d, __ts: true }; }

  function makeDoc(id, data) {
    return { id, exists: data !== undefined, data: () => data };
  }

  function makeQuery(items) {
    return {
      get: async () => ({ docs: items.map(([id, d]) => makeDoc(id, d)), empty: items.length === 0 }),
      limit: (n) => makeQuery(items.slice(0, n)),
      orderBy: () => makeQuery(items),
      where: (f, op, v) => makeQuery(items.filter(([, d]) => d && d[f] === v)),
    };
  }

  const fakeFirestore = () => ({
    collection: (name) => {
      const items = () => [...docs.entries()].filter(([, d]) => d && d.__col === name)
        .sort((a, b) => (b[1].createdAt?.toDate?.() || 0) - (a[1].createdAt?.toDate?.() || 0));

      const api = {
        doc: (id) => ({
          id,
          get: async () => makeDoc(id, docs.get(id)),
          set: async (data, opts) => {
            const prev = opts && opts.merge ? docs.get(id) || {} : {};
            docs.set(id, { ...prev, ...data, __col: name });
          },
          delete: async () => { docs.delete(id); },
        }),
        limit: (n) => makeQuery(items().slice(0, n)),
        orderBy: () => makeQuery(items()),
        where: (f, op, v) => makeQuery(items().filter(([, d]) => d && d[f] === v)),
      };
      return api;
    },
    runTransaction: async (fn) => fn({
      get: async (ref) => makeDoc(ref.id, counters.has(ref.id) ? { value: counters.get(ref.id) } : undefined),
      set: (ref, data) => counters.set(ref.id, data.value),
    }),
  });

  const fakeAuth = () => {
    const state = { user: null, cbs: [] };
    return {
      get currentUser() { return state.user; },
      onAuthStateChanged(cb) { state.cbs.push(cb); setTimeout(() => cb(state.user), 1); return () => {}; },
      signInWithEmailAndPassword: async (email, password) => {
        if (password !== "sandi-admin") {
          const e = new Error("The supplied auth credential is incorrect.");
          e.code = "auth/invalid-credential";
          throw e;
        }
        state.user = { uid: "uid-1", email };
        state.cbs.forEach((c) => c(state.user));
        return { user: state.user };
      },
      signOut: async () => { state.user = null; state.cbs.forEach((c) => c(null)); },
    };
  };

  firebase.firestore = fakeFirestore;
  firebase.firestore.Timestamp = { fromDate: (d) => ts(d) };
  firebase.firestore.FieldValue = { serverTimestamp: () => ts(new Date()) };
  firebase.auth = fakeAuth;

  window.__seed = (id, data) => docs.set(id, { ...data, __col: "reports" });
</script>
<script src="/js/firebase-config.js"></script>
<script src="/js/firebase-adapter.js"></script>
<script src="/js/storage.js"></script>
</body>
</html>`;

/* -------------------------------------------------------------------------
   Server statis sederhana
   ------------------------------------------------------------------------- */
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (url === "/" || url === "/test.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(TEST_HTML);
    return;
  }

  const file = path.join(ROOT, url);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = path.extname(file);
    const type = ext === ".js" ? "text/javascript" : ext === ".json" ? "application/json" : "text/plain";
    res.writeHead(200, { "Content-Type": type + "; charset=utf-8" });
    res.end(data);
  });
});

/* -------------------------------------------------------------------------
   Uji
   ------------------------------------------------------------------------- */
(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  console.log("\n=== Adapter + SDK Firebase asli + Firestore tiruan ===");

  const dom = await JSDOM.fromURL(BASE + "test.html", {
    runScripts: "dangerously",
    resources: new ResourceLoader(),
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem("temubalik.storage", "firebase");
    },
  });

  await new Promise((r) => {
    if (dom.window.document.readyState === "complete") r();
    else dom.window.addEventListener("load", r);
  });

  const w = dom.window;

  // Tunggu adapter siap
  const ok = await w.FirebaseStore.ready();
  check("adapter siap dengan SDK asli", ok === true, w.FirebaseStore.reason());
  check("mode = firebase", w.FirebaseStore.mode() === "firebase");

  /* --- create lewat Store (bukan adapter langsung) --- */
  const created = await w.eval(`(async () => Store.create({
    namaPelapor: "Integrasi Uji",
    whatsapp: "081234567890",
    namaBarang: "Tas Integrasi",
    kategori: "Dompet & Tas",
    warna: "Hitam",
    ciriKhusus: "Ada bordir nama di bagian depan tas ini",
    tanggalHilang: "2026-02-12",
    lokasi: "Kantin",
    kronologi: "Tas ditinggal di kursi kantin lalu hilang saat kembali."
  }))()`);

  check("Store.create lewat Firebase", /^LPR-\d{8}-\d{3}$/.test(created.id), created.id);
  check("tersimpan di Firestore tiruan", w.__mockDocs.has(created.id));
  check("createdAt jadi Timestamp",
    typeof w.__mockDocs.get(created.id).createdAt.toDate === "function");

  /* --- getAll --- */
  const all = await w.eval("Store.getAll()");
  check("Store.getAll membaca dari Firestore", all.length === 1, String(all.length));
  check("createdAt dikembalikan sebagai ISO string", typeof all[0].createdAt === "string");
  check("namaBarang utuh", all[0].namaBarang === "Tas Integrasi", all[0].namaBarang);

  /* --- getById --- */
  const one = await w.eval(`Store.getById(${JSON.stringify(created.id)})`);
  check("Store.getById menemukan laporan", one && one.id === created.id);

  /* --- counter kedua --- */
  const second = await w.eval(`(async () => Store.create({
    namaPelapor: "Integrasi Uji 2",
    whatsapp: "081234567890",
    namaBarang: "Topi Integrasi",
    kategori: "Pakaian",
    warna: "Merah",
    ciriKhusus: "Ada logo bordir di bagian depan topi",
    tanggalHilang: "2026-02-12",
    lokasi: "Lapangan Olahraga",
    kronologi: "Topi tertinggal di bangku lapangan setelah olahraga."
  }))()`);
  check("nomor urut tidak bentrok", second.id !== created.id, `${created.id} vs ${second.id}`);

  /* --- auth lewat Store --- */
  let loginErr = null;
  try {
    await w.eval(`Store.signInAdmin("admin@uji.com", "salah")`);
  } catch (err) {
    loginErr = err;
  }
  check("login salah ditolak", loginErr !== null);

  const user = await w.eval(`Store.signInAdmin("admin@uji.com", "sandi-admin")`);
  check("login benar berhasil", user && user.email === "admin@uji.com", user && user.email);
  check("Store.isAdmin() true setelah login", (await w.eval("Store.isAdmin()")) === true);
  check("Store.adminEmail() terisi", (await w.eval("Store.adminEmail()")) === "admin@uji.com");

  /* --- updateStatus --- */
  const updated = await w.eval(`Store.updateStatus(${JSON.stringify(created.id)}, "Selesai")`);
  check("Store.updateStatus berhasil", updated.status === "Selesai", updated.status);
  check("status tersimpan", w.__mockDocs.get(created.id).status === "Selesai");

  /* --- remove --- */
  const removed = await w.eval(`Store.remove(${JSON.stringify(second.id)})`);
  check("Store.remove berhasil", removed === true);
  check("dokumen hilang", !w.__mockDocs.has(second.id));

  /* --- logout --- */
  await w.eval("Store.signOutAdmin()");
  check("Store.isAdmin() false setelah logout", (await w.eval("Store.isAdmin()")) === false);

  dom.window.close();
  server.close();

  console.log(`\n${"-".repeat(52)}`);
  console.log(`Hasil: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  console.log("-".repeat(52));
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error("[FATAL]", err);
  server.close();
  process.exit(1);
});
