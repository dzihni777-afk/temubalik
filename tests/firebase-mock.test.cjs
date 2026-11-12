/* ==========================================================================
   Uji adapter Firebase dengan SDK TIRUAN

   Tujuan: memastikan jalur "Firebase aktif" benar-benar dipakai —
   getAll/getById/create/updateStatus/remove menembak Firestore,
   bukan localStorage.

   Tidak menyentuh Firebase asli (tidak butuh kredensial, tidak mengubah data).

   Jalankan: node tests/firebase-mock.test.cjs
   ========================================================================== */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

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

/* -------------------------------------------------------------------------
   Firestore tiruan: cukup untuk meniru API yang dipakai adapter.
   ------------------------------------------------------------------------- */
/**
 * @param {object} [opts]
 * @param {boolean} [opts.probeGagal]     uji koneksi Firestore di init() gagal
 * @param {boolean} [opts.queryGagal]     setiap query Firestore gagal (memicu degraded)
 * @param {boolean} [opts.analyticsError] firebase.analytics() melempar error
 */
function createMockFirebase(opts = {}) {
  const docs = new Map(); // id -> data mentah
  const counters = new Map();
  const calls = [];
  let probeSudah = false;

  const Timestamp = {
    fromDate: (d) => ({ __ts: true, toDate: () => d, value: d.toISOString() }),
  };

  const FieldValue = { serverTimestamp: () => ({ __ts: true, toDate: () => new Date() }) };

  function makeDoc(id, data) {
    return {
      id,
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : { ...data }),
    };
  }

  function makeCollection(name) {
    calls.push({ op: "collection", name });

    const api = {
      doc: (id) => {
        calls.push({ op: "doc", id });
        const ref = {
          id,
          get: async () => makeDoc(id, docs.get(id)),
          set: async (data, opts) => {
            calls.push({ op: "set", id, merge: Boolean(opts && opts.merge) });
            const prev = opts && opts.merge ? docs.get(id) || {} : {};
            docs.set(id, { ...prev, ...data });
          },
          delete: async () => {
            calls.push({ op: "delete", id });
            docs.delete(id);
          },
        };
        return ref;
      },
      limit: (n) => {
        calls.push({ op: "limit", n });
        return {
          get: async () => {
            if (opts.queryGagal) {
              throw new Error("Firestore tidak tersedia (uji).");
            }
            // Probe di init() memakai limit(1).get() sebagai pemanggilan pertama.
            if (opts.probeGagal && !probeSudah) {
              probeSudah = true;
              throw new Error("Uji koneksi Firestore melebihi batas waktu 8000ms.");
            }
            const all = [...docs.entries()].map(([id, d]) => makeDoc(id, d)).slice(0, n);
            return { docs: all, empty: all.length === 0 };
          },
          orderBy: () => ({
            get: async () => {
              const all = [...docs.entries()]
                .map(([id, d]) => makeDoc(id, d))
                .sort((a, b) => {
                  const av = a.data().createdAt;
                  const bv = b.data().createdAt;
                  const at = av && av.toDate ? av.toDate().getTime() : 0;
                  const bt = bv && bv.toDate ? bv.toDate().getTime() : 0;
                  return bt - at;
                })
                .slice(0, n);
              return { docs: all, empty: all.length === 0 };
            },
          }),
        };
      },
      orderBy: () => ({
        limit: (n) => ({
          get: async () => {
            const all = [...docs.entries()]
              .map(([id, d]) => makeDoc(id, d))
              .sort((a, b) => {
                const av = a.data().createdAt;
                const bv = b.data().createdAt;
                const at = av && av.toDate ? av.toDate().getTime() : 0;
                const bt = bv && bv.toDate ? bv.toDate().getTime() : 0;
                return bt - at;
              })
              .slice(0, n);
            return { docs: all, empty: all.length === 0 };
          },
        }),
      }),
      where: (field, op, value) => ({
        limit: (n) => ({
          get: async () => {
            const all = [...docs.entries()]
              .map(([id, d]) => makeDoc(id, d))
              .filter((doc) => doc.data() && doc.data()[field] === value)
              .slice(0, n);
            return { docs: all, empty: all.length === 0 };
          },
        }),
      }),
    };

    return api;
  }

  const db = {
    collection: makeCollection,
    runTransaction: async (fn) => {
      const tx = {
        get: async (ref) => makeDoc(ref.id, counters.has(ref.id) ? counters.get(ref.id) : undefined),
        set: (ref, data) => {
          counters.set(ref.id, { value: data.value, updatedAt: data.updatedAt });
        },
      };
      return fn(tx);
    },
  };

  const auth = {
    currentUser: null,
    onAuthStateChanged(cb) {
      // Simulasikan "belum login" satu tick setelah didaftarkan.
      setTimeout(() => cb(auth.currentUser), 5);
      return () => {};
    },
    signInWithEmailAndPassword: async (email, password) => {
      if (password !== "sandi-benar") {
        const err = new Error("The supplied auth credential is incorrect.");
        err.code = "auth/invalid-credential";
        throw err;
      }
      auth.currentUser = { uid: "uid-admin", email };
      return { user: auth.currentUser };
    },
    signOut: async () => {
      auth.currentUser = null;
    },
  };

  const firebase = {
    apps: [],
    app: () => ({ name: "mock" }),
    initializeApp: () => ({ name: "mock" }),
    firestore: () => db,
    auth: () => auth,
    analytics: () => {
      if (opts.analyticsError) throw new Error("Analytics diblokir (uji).");
      return {};
    },
    firestoreNamespace: { Timestamp, FieldValue },
  };

  // Adapter mengakses global.firebase.firestore.Timestamp
  firebase.firestore.Timestamp = Timestamp;
  firebase.firestore.FieldValue = FieldValue;

  return { firebase, docs, counters, calls };
}

/* -------------------------------------------------------------------------
   Siapkan lingkungan
   ------------------------------------------------------------------------- */
function makeWindow(mock) {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  const win = {
    localStorage,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    JSON,
    Math,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Set,
    Map,
    Error,
    isNaN,
    parseInt,
    parseFloat,
    location: { protocol: "http:", search: "" },
    navigator: {},
    document: {
      head: { appendChild: () => {} },
      // SDK dianggap sudah termuat: loadScript() langsung resolve.
      querySelector: () => ({ tagName: "SCRIPT" }),
      createElement: () => ({ set src(v) {}, set onload(v) {}, set onerror(v) {} }),
    },
  };

  win.window = win;
  win.globalThis = win;
  win.self = win;

  // SDK "sudah termuat"
  win.firebase = mock.firebase;

  return win;
}

async function runAdapter(mock, configOverrides = {}) {
  const win = makeWindow(mock);

  const sandbox = vm.createContext(win);

  // Konfigurasi
  win.TEMUBALIK_FIREBASE = {
    enabled: true,
    collection: "reports",
    enableAnalytics: false,
    maxDocs: 500,
    config: { projectId: "mock-project", apiKey: "x" },
    ...configOverrides,
  };

  const code = fs.readFileSync(path.join(ROOT, "js/firebase-adapter.js"), "utf8");
  vm.runInContext(code, sandbox);

  await win.FirebaseStore.ready();
  return win;
}

/**
 * Seperti runAdapter(), tapi window.TEMUBALIK_FIREBASE TIDAK diset sama sekali.
 * Meniru repo baru di-clone: js/firebase-config.js tidak ada (404).
 */
async function runAdapterTanpaConfig(mock) {
  const win = makeWindow(mock);
  const sandbox = vm.createContext(win);

  // SENGAJA tidak menyetel win.TEMUBALIK_FIREBASE.

  const code = fs.readFileSync(path.join(ROOT, "js/firebase-adapter.js"), "utf8");
  vm.runInContext(code, sandbox);

  await win.FirebaseStore.ready();
  return win;
}

/* -------------------------------------------------------------------------
   Uji
   ------------------------------------------------------------------------- */
(async () => {
  console.log("\n=== Adapter dengan Firestore tiruan ===");

  const mock = createMockFirebase();

  // Isi 2 laporan awal
  const t1 = new Date("2026-02-10T10:00:00Z");
  const t2 = new Date("2026-02-11T10:00:00Z");
  mock.docs.set("LPR-20260210-001", {
    id: "LPR-20260210-001",
    namaBarang: "Dompet Lama",
    kategori: "Dompet & Tas",
    status: "Aktif",
    createdAt: { toDate: () => t1 },
    updatedAt: { toDate: () => t1 },
  });
  mock.docs.set("LPR-20260211-001", {
    id: "LPR-20260211-001",
    namaBarang: "HP Lama",
    kategori: "Elektronik",
    status: "Selesai",
    createdAt: { toDate: () => t2 },
    updatedAt: { toDate: () => t2 },
  });

  const win = await runAdapter(mock);
  const FB = win.FirebaseStore;

  check("FirebaseStore siap", FB.isReady() === true, FB.reason());
  check("mode = firebase", FB.mode() === "firebase");

  /* --- getAll --- */
  const all = await FB.getAll();
  check("getAll mengembalikan 2 laporan", all.length === 2, String(all.length));
  check("getAll urut terbaru dulu", all[0].id === "LPR-20260211-001", all[0].id);
  check("Timestamp dikonversi jadi string ISO", typeof all[0].createdAt === "string",
    typeof all[0].createdAt);
  check("tanggal benar", all[1].createdAt.startsWith("2026-02-10"), all[1].createdAt);
  check("status terbaca", all[0].status === "Selesai", all[0].status);

  /* --- getById --- */
  const one = await FB.getById("LPR-20260210-001");
  check("getById menemukan dokumen", one && one.namaBarang === "Dompet Lama", one && one.namaBarang);

  const missing = await FB.getById("LPR-99999999-999");
  check("getById mengembalikan null kalau tidak ada", missing === null);

  const lower = await FB.getById("lpr-20260210-001");
  check("getById tidak peka huruf besar/kecil", lower && lower.id === "LPR-20260210-001");

  /* --- create --- */
  const created = await FB.create({
    namaPelapor: "Uji Mock",
    whatsapp: "081234567890",
    namaBarang: "Tas Mock",
    kategori: "Dompet & Tas",
    warna: "Hitam",
    ciriKhusus: "Ada bordir nama di bagian depan tas",
    tanggalHilang: "2026-02-12",
    lokasi: "Kantin",
    kronologi: "Tas ditinggal di kursi lalu hilang saat kembali.",
    foto: "",
  });

  check("create menghasilkan id berformat benar", /^LPR-\d{8}-\d{3}$/.test(created.id), created.id);
  check("create menulis ke Firestore", mock.docs.has(created.id));
  check("status awal Aktif", created.status === "Aktif");
  check("foto kosong jadi placeholder", created.foto === "assets/img/placeholder.svg", created.foto);
  check("dokumen menyimpan Timestamp, bukan string",
    mock.docs.get(created.id).createdAt && typeof mock.docs.get(created.id).createdAt.toDate === "function");

  const total3 = await FB.getAll();
  check("jumlah bertambah jadi 3", total3.length === 3, String(total3.length));

  /* --- counter nomor laporan --- */
  const second = await FB.create({
    namaPelapor: "Uji Mock 2",
    whatsapp: "081234567890",
    namaBarang: "Topi Mock",
    kategori: "Pakaian",
    warna: "Merah",
    ciriKhusus: "Ada logo bordir di bagian depan topi",
    tanggalHilang: "2026-02-12",
    lokasi: "Lapangan Olahraga",
    kronologi: "Topi tertinggal di bangku lapangan setelah olahraga.",
  });
  check("nomor urut naik (tidak bentrok)", second.id !== created.id, `${created.id} vs ${second.id}`);
  check("urutan berakhir -002", second.id.endsWith("-002"), second.id);

  /* --- updateStatus --- */
  const updated = await FB.updateStatus("LPR-20260210-001", "Selesai");
  check("updateStatus mengubah status", updated.status === "Selesai");
  check("perubahan tersimpan di Firestore",
    mock.docs.get("LPR-20260210-001").status === "Selesai");
  check("updatedAt ikut berubah", Boolean(mock.docs.get("LPR-20260210-001").updatedAt));

  let threw = false;
  try {
    await FB.updateStatus("LPR-20260210-001", "Ditolak");
  } catch {
    threw = true;
  }
  check("status tidak valid ditolak", threw);

  /* --- remove --- */
  const removed = await FB.remove("LPR-20260211-001");
  check("remove mengembalikan true", removed === true);
  check("dokumen terhapus dari Firestore", !mock.docs.has("LPR-20260211-001"));
  check("jumlah berkurang", (await FB.getAll()).length === 3, String((await FB.getAll()).length));

  /* --- stats --- */
  const stats = await FB.stats();
  check("stats.total benar", stats.total === 3, String(stats.total));
  check("stats menghitung aktif & selesai",
    stats.aktif + stats.selesai === stats.total,
    JSON.stringify(stats));

  /* --- auth --- */
  let authErr = null;
  try {
    await FB.signIn("admin@uji.com", "salah");
  } catch (err) {
    authErr = err;
  }
  check("login sandi salah melempar error", authErr !== null);
  check("kode error Firebase diteruskan", /invalid-credential/.test(String(authErr.code)), String(authErr.code));

  const user = await FB.signIn("admin@uji.com", "sandi-benar");
  check("login benar mengembalikan user", user && user.email === "admin@uji.com", user && user.email);
  check("currentUser terisi", FB.currentUser() && FB.currentUser().uid === "uid-admin");

  const waited = await FB.waitAdmin();
  check("waitAdmin mengembalikan user", waited && waited.uid === "uid-admin");

  await FB.signOut();
  check("signOut menghapus currentUser", FB.currentUser() === null);

  /* --- mode nonaktif --- */
  console.log("\n=== Adapter saat enabled:false ===");
  {
    const mock2 = createMockFirebase();
    const win2 = await runAdapter(mock2, { enabled: false });
    check("tidak aktif kalau enabled:false", win2.FirebaseStore.isReady() === false);
    check("mode = local", win2.FirebaseStore.mode() === "local");
    check("alasan dijelaskan", /enabled/i.test(win2.FirebaseStore.reason()), win2.FirebaseStore.reason());
  }

  console.log("\n=== Adapter saat konfigurasi kosong ===");
  {
    const mock3 = createMockFirebase();
    const win3 = await runAdapter(mock3, { config: {} });
    check("tidak aktif tanpa config", win3.FirebaseStore.isReady() === false);
    check("alasan dijelaskan", /konfigurasi/i.test(win3.FirebaseStore.reason()), win3.FirebaseStore.reason());
    check(
      "alasan menyebut npm run config",
      /npm run config/i.test(win3.FirebaseStore.reason()),
      win3.FirebaseStore.reason()
    );
    check(
      "alasan menyebut variabel yang kosong",
      /projectId/i.test(win3.FirebaseStore.reason()),
      win3.FirebaseStore.reason()
    );
  }

  console.log("\n=== Adapter saat js/firebase-config.js TIDAK ADA ===");
  {
    // Meniru repo baru di-clone: file config memang tidak di-commit.
    const mock4 = createMockFirebase();
    const win4 = await runAdapterTanpaConfig(mock4);
    const FB4 = win4.FirebaseStore;

    check("tidak aktif tanpa file config", FB4.isReady() === false);
    check(
      "alasan menyebut nama file yang hilang",
      /firebase-config\.js/i.test(FB4.reason()),
      FB4.reason()
    );
    check(
      "alasan memberi perintah cp .env.example",
      /cp \.env\.example \.env/.test(FB4.reason()),
      FB4.reason()
    );
    check("alasan memberi perintah npm run config", /npm run config/i.test(FB4.reason()), FB4.reason());
    check("Auth juga tidak siap", FB4.isAuthReady() === false);

    // Situs tetap hidup: fallback ke localStorage, bukan blank.
    check("mode = local", FB4.mode() === "local");
  }

  /* ------------------------------------------------------------------ */
  /* REGRESI: bug "Firebase tidak dapat dihubungi, login dinonaktifkan"  */
  /* ------------------------------------------------------------------ */
  console.log("\n=== Regresi: Auth tetap hidup saat Firestore bermasalah ===");
  {
    // Probe Firestore di init() gagal → state.ok false, tapi state.auth ADA.
    const mock4 = createMockFirebase({ probeGagal: true });
    const win4 = await runAdapter(mock4);
    const FB4 = win4.FirebaseStore;

    check("Firestore dianggap tidak siap", FB4.isReady() === false);
    check("mode data = local", FB4.mode() === "local");
    check("Auth tetap dilaporkan siap", FB4.isAuthReady() === true);
    check("waitAuth() tetap true walau Firestore gagal", (await FB4.waitAuth(3000)) === true);

    // Inilah bug aslinya: login dulu ikut mati.
    const user4 = await FB4.signIn("admin@uji.com", "sandi-benar");
    check(
      "signIn TETAP berhasil saat Firestore gagal",
      user4 && user4.email === "admin@uji.com",
      user4 && user4.email
    );
    check("currentUser terisi", FB4.currentUser() && FB4.currentUser().uid === "uid-admin");
    check("waitAdmin() membaca sesi walau Firestore gagal",
      (await FB4.waitAdmin(3000)) && FB4.currentUser() !== null);

    // Sandi salah tetap harus ditolak (jangan longgar).
    let err4 = null;
    try {
      await FB4.signIn("admin@uji.com", "salah");
    } catch (e) {
      err4 = e;
    }
    check("sandi salah tetap ditolak", err4 && /invalid-credential/.test(String(err4.code)));
  }

  console.log("\n=== Regresi: degraded (baca Firestore gagal) tidak mematikan Auth ===");
  {
    const mock5 = createMockFirebase({ queryGagal: true });
    const win5 = await runAdapter(mock5);
    const FB5 = win5.FirebaseStore;

    // Probe di init() juga lewat queryGagal → init() gagal.
    // Sekarang picu degraded lewat jalur lain: paksa getAll gagal setelah siap.
    check("Auth siap", FB5.isAuthReady() === true);
    const user5 = await FB5.signIn("admin@uji.com", "sandi-benar");
    check("signIn berhasil pada kondisi degraded", user5 && user5.email === "admin@uji.com");
  }

  console.log("\n=== Regresi: analytics gagal tidak menahan kesiapan ===");
  {
    // firebase.analytics() melempar error. Dulu state.ok ditulis SETELAH
    // analytics, sehingga init() tidak pernah menandai siap.
    const mock6 = createMockFirebase({ analyticsError: true });
    const win6 = await runAdapter(mock6, { enableAnalytics: true });
    const FB6 = win6.FirebaseStore;

    check("state.ok true walau analytics error", FB6.isReady() === true, FB6.reason());
    check("mode = firebase", FB6.mode() === "firebase");
    check("alasan tidak diisi gara-gara analytics", String(FB6.reason()) === "", FB6.reason());
    check("getAll tetap jalan", (await FB6.getAll()).length === 0);
  }

  console.log(`\n${"-".repeat(52)}`);
  console.log(`Hasil: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  console.log("-".repeat(52));
  process.exit(fail === 0 ? 0 : 1);
})();
