/* Uji logika storage.js tanpa browser */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const dir = process.env.TB_ROOT || path.resolve(__dirname, "..");

/**
 * Kata sandi demo dibaca dari js/firebase-config.js (hasil generate .env),
 * BUKAN di-hardcode. Kalau FIREBASE_DEMO_PASSWORD diubah, tes ikut menyesuaikan.
 */
function readDemoPassword() {
  try {
    const src = fs.readFileSync(path.join(dir, "js/firebase-config.js"), "utf8");
    const m = src.match(/demoPassword\s*:\s*"((?:[^"\\]|\\.)*)"/);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

const DEMO_PASSWORD = readDemoPassword();

/* --- Stub browser env --- */
const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const sandbox = {
  console,
  localStorage,
  window: {},
  document: { createElement: () => ({}) },
  fetch: async () => {
    throw new Error("no network in test");
  },
  setTimeout,
  clearTimeout,
  Date,
  JSON,
  Math,
  Promise,
  Image: function () {},
  FileReader: function () {},
};
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);

// muat seed
const seedCode = fs.readFileSync(path.join(dir, "data/data-seed.js"), "utf8");
vm.runInContext(seedCode, ctx);

// muat utils + storage
vm.runInContext(fs.readFileSync(path.join(dir, "js/utils.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, "js/storage.js"), "utf8"), ctx);

(async () => {
  const grab = (expr) => vm.runInContext(expr, ctx);
  const Store = grab("Store");
  const formatTanggal = grab("formatTanggal");
  const maskPhone = grab("maskPhone");
  const escapeHtml = grab("escapeHtml");
  const waLink = grab("waLink");

  let pass = 0, fail = 0;
  const check = (name, cond, extra = "") => {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
  };

  console.log("\n=== Store.getAll (seed) ===");
  const all = await Store.getAll();
  check("jumlah seed = 10", all.length === 10, `dapat ${all.length}`);
  check("urut terbaru dulu", all[0].id === "LPR-20260215-001", all[0].id);
  check("semua punya id", all.every((r) => r.id));

  console.log("\n=== nextId ===");
  const id1 = await Store.nextId();
  check("format LPR-YYYYMMDD-NNN", /^LPR-\d{8}-\d{3}$/.test(id1), id1);

  console.log("\n=== create ===");
  const created = await Store.create({
    namaBarang: "Uji Coba Barang",
    kategori: "Elektronik",
    warna: "Hitam",
    ciriKhusus: "Ada tanda khusus untuk pengujian otomatis",
    tanggalHilang: "2026-02-15",
    lokasi: "Gedung A",
    kronologi: "Kronologi pengujian otomatis dengan panjang memadai.",
    namaPelapor: "Penguji",
    whatsapp: "081234567890",
    foto: "",
  });
  check("id terbentuk", !!created.id, created.id);
  check("status default Aktif", created.status === "Aktif");
  check("foto fallback placeholder", created.foto === "assets/img/placeholder.svg", created.foto);

  const afterCreate = await Store.getAll();
  check("total jadi 11", afterCreate.length === 11, String(afterCreate.length));
  check("laporan baru di urutan teratas", afterCreate[0].id === created.id, afterCreate[0].id);

  console.log("\n=== getById ===");
  const found = await Store.getById(created.id);
  check("getById menemukan laporan", found && found.id === created.id);
  const notFound = await Store.getById("LPR-99999999-999");
  check("getById id palsu = null", notFound === null);

  console.log("\n=== updateStatus (lokal) ===");
  const upd = await Store.updateStatus(created.id, "Selesai");
  check("status jadi Selesai", upd.status === "Selesai", upd.status);
  const stats1 = await Store.stats();
  check("stats.selesai naik", stats1.selesai >= 3, JSON.stringify(stats1));

  console.log("\n=== updateStatus (seed via override) ===");
  const seedId = "LPR-20260210-001";
  const seedBefore = await Store.getById(seedId);
  check("seed awal Aktif", seedBefore.status === "Aktif", seedBefore.status);
  await Store.updateStatus(seedId, "Selesai");
  const seedAfter = await Store.getById(seedId);
  check("seed jadi Selesai", seedAfter.status === "Selesai", seedAfter.status);
  check("data seed lain utuh", seedAfter.namaBarang === seedBefore.namaBarang);

  console.log("\n=== status invalid ditolak ===");
  let threw = false;
  try { await Store.updateStatus(created.id, "Ditolak"); } catch { threw = true; }
  check("status tak valid melempar error", threw);

  console.log("\n=== getMine ===");
  const mine = await Store.getMine();
  check("getMine memuat laporan buatan", mine.some((r) => r.id === created.id));

  console.log("\n=== remove ===");
  await Store.remove(created.id);
  const afterDel = await Store.getAll();
  check("total kembali 10", afterDel.length === 10, String(afterDel.length));
  check("laporan terhapus tidak ada", !afterDel.some((r) => r.id === created.id));
  const mineAfter = await Store.getMine();
  check("hilang dari getMine", !mineAfter.some((r) => r.id === created.id));

  console.log("\n=== remove seed ===");
  await Store.remove("LPR-20260211-002");
  const afterSeedDel = await Store.getAll();
  check("seed terhapus dari daftar", !afterSeedDel.some((r) => r.id === "LPR-20260211-002"));
  check("total jadi 9", afterSeedDel.length === 9, String(afterSeedDel.length));

  console.log("\n=== draft ===");
  Store.saveDraft({ namaBarang: "Draft Uji" });
  const draft = Store.loadDraft();
  check("draft tersimpan", draft && draft.namaBarang === "Draft Uji");
  Store.clearDraft();
  check("draft terhapus", Store.loadDraft() === null);

  /* ------------------------------------------------------------------ */
  /* REGRESI: login admin tidak boleh mati saat Firestore bermasalah      */
  /* ------------------------------------------------------------------ */
  console.log("\n=== Regresi: signInAdmin lewat Auth, bukan Firestore ===");

  const setLocation = (hostname) => {
    sandbox.location = { hostname, protocol: "https:" };
    vm.runInContext("", ctx);
  };

  // (1) Firestore TIDAK siap (degraded) tapi Auth siap → login harus jalan.
  setLocation("temubalik-26f80.web.app");
  sandbox.window.FirebaseStore = {
    isReady: () => false,          // Firestore mati
    isAuthReady: () => true,       // Auth sehat
    isDegraded: () => true,        // sudah pernah gagal baca
    reason: () => "Uji koneksi Firestore melebihi batas waktu 8000ms.",
    waitAuth: async () => true,
    currentUser: () => ({ email: "r9723419@gmail.com" }),
    signIn: async (email) => ({ email }),
    signInWithGoogle: async () => ({ email: "google@uji.com" }),
    onAuth: () => () => {},
    waitAdmin: async () => {},
  };

  let r1 = null, e1 = null;
  try {
    r1 = await Store.signInAdmin("r9723419@gmail.com", "apa-saja");
  } catch (err) {
    e1 = err;
  }
  check(
    "login berhasil walau Firestore degraded",
    r1 && r1.email === "r9723419@gmail.com",
    e1 && e1.message
  );
  check("tidak melempar 'tidak dapat dihubungi'", !e1);
  check("usingAuth() true", Store.usingAuth() === true);
  check("isAdmin() membaca sesi Auth", Store.isAdmin() === true);
  check("adminEmail() dari Auth", Store.adminEmail() === "r9723419@gmail.com");

  // (2) Auth BELUM siap saat dipanggil, baru siap ~600ms kemudian.
  //     Versi lama (batas 6 detik + fb() null) langsung menolak.
  let authSiap = false;
  sandbox.window.FirebaseStore = {
    isReady: () => false,
    isAuthReady: () => authSiap,
    isDegraded: () => false,
    reason: () => "",
    waitAuth: (ms) =>
      new Promise((resolve) => {
        setTimeout(() => {
          authSiap = true;
          resolve(true);
        }, 600);
      }),
    currentUser: () => ({ email: "r9723419@gmail.com" }),
    signIn: async (email) => ({ email }),
    onAuth: () => () => {},
    waitAdmin: async () => {},
  };

  let r2 = null, e2 = null;
  try {
    r2 = await Store.signInAdmin("r9723419@gmail.com", "apa-saja");
  } catch (err) {
    e2 = err;
  }
  check("login menunggu Auth siap (bukan menyerah cepat)", r2 !== null, e2 && e2.message);
  check("pesan 'tidak dapat dihubungi' tidak muncul saat cuma lambat", !e2);

  /* ------------------------------------------------------------------ */
  /* REGRESI: fail-closed tetap terjaga (jangan sampai celah terbuka)     */
  /* ------------------------------------------------------------------ */
  console.log("\n=== Fail-closed: sandi demo tetap hanya untuk localhost ===");

  // (3) Domain publik + Firebase mati total → wajib MENOLAK.
  //     Pakai sandi demo yang BENAR (dibaca dari config) supaya tes ini
  //     membuktikan penolakan datang dari guard host, bukan dari sandi salah.
  setLocation("temubalik-26f80.web.app");
  delete sandbox.window.FirebaseStore;

  let e3 = null;
  try {
    await Store.signInAdmin("admin@uji.com", DEMO_PASSWORD || "apa-saja");
  } catch (err) {
    e3 = err;
  }
  check("domain publik + Firebase mati → ditolak", e3 !== null, "seharusnya melempar");
  check(
    "pesan menyebut tidak dapat terhubung",
    e3 && /tidak dapat terhubung|tidak dapat dihubungi/i.test(e3.message),
    e3 && e3.message
  );

  // (4) Domain publik + Auth tidak pernah siap → sandi demo BENAR pun ditolak.
  sandbox.window.FirebaseStore = {
    isReady: () => false,
    isAuthReady: () => false,
    isDegraded: () => false,
    reason: () => "Firebase Auth tidak dapat dihubungi.",
    waitAuth: async () => false,
    currentUser: () => null,
    signIn: async () => {
      throw new Error("Firebase Auth tidak dapat dihubungi.");
    },
    onAuth: () => () => {},
    waitAdmin: async () => {},
  };

  let e4 = null;
  try {
    await Store.signInAdmin("admin@uji.com", DEMO_PASSWORD || "apa-saja");
  } catch (err) {
    e4 = err;
  }
  check("domain publik + Auth gagal → sandi demo ditolak", e4 !== null);

  // (5) localhost tanpa Firebase → sandi demo (dari .env) tetap berlaku.
  setLocation("localhost");
  sandbox.window.TEMUBALIK_FIREBASE = { demoPassword: "sandi-demo-uji" };
  delete sandbox.window.FirebaseStore;

  let r5 = null, e5 = null;
  try {
    r5 = await Store.signInAdmin("", "sandi-demo-uji");
  } catch (err) {
    e5 = err;
  }
  check("localhost: sandi demo benar diterima", r5 && r5.email === "demo@local", e5 && e5.message);

  // (6) localhost + sandi demo SALAH → tetap ditolak.
  let e6 = null;
  try {
    await Store.signInAdmin("", "sandi-keliru");
  } catch (err) {
    e6 = err;
  }
  check("localhost: sandi demo salah ditolak", e6 !== null);

  // (7) sandi demo kosong di .env → login demo mati (fail-closed).
  //     Kirim sandi demo yang benar (kalau ada) — tetap harus ditolak.
  sandbox.window.TEMUBALIK_FIREBASE = { demoPassword: "" };
  let e7 = null;
  try {
    await Store.signInAdmin("", DEMO_PASSWORD || "apa-saja");
  } catch (err) {
    e7 = err;
  }
  check("demoPassword kosong → login demo mati", e7 !== null);

  // (8) pulihkan keadaan supaya tidak mengganggu bagian berikutnya
  setLocation("localhost");
  sandbox.window.TEMUBALIK_FIREBASE = {};
  Store.signOutAdmin();

  console.log("\n=== utils ===");
  check("formatTanggal", formatTanggal("2026-02-14") === "14 Februari 2026", formatTanggal("2026-02-14"));
  check("formatTanggal invalid", formatTanggal("bukan-tanggal") === "-");
  check("maskPhone", maskPhone("081234567890") === "0812*****890", maskPhone("081234567890"));
  check("escapeHtml script", escapeHtml('<script>alert("x")</script>') === "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  check("waLink 08 -> 62", waLink("081234567890") === "https://wa.me/6281234567890", waLink("081234567890"));

  console.log(`\n===== HASIL: ${pass} pass, ${fail} fail =====\n`);
  process.exit(fail ? 1 : 0);
})();
