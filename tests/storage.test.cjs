/* Uji logika storage.js tanpa browser */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const dir = process.env.TB_ROOT || path.resolve(__dirname, "..");

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

  console.log("\n=== utils ===");
  check("formatTanggal", formatTanggal("2026-02-14") === "14 Februari 2026", formatTanggal("2026-02-14"));
  check("formatTanggal invalid", formatTanggal("bukan-tanggal") === "-");
  check("maskPhone", maskPhone("081234567890") === "0812*****890", maskPhone("081234567890"));
  check("escapeHtml script", escapeHtml('<script>alert("x")</script>') === "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  check("waLink 08 -> 62", waLink("081234567890") === "https://wa.me/6281234567890", waLink("081234567890"));

  console.log(`\n===== HASIL: ${pass} pass, ${fail} fail =====\n`);
  process.exit(fail ? 1 : 0);
})();
