/* ==========================================================================
   TemuBalik — Adapter Firebase (Firestore + Auth)

   Tugas file ini:
   1. Memuat SDK Firebase dari CDN (tanpa build step, tanpa npm).
   2. Menyediakan window.FirebaseStore dengan bentuk fungsi yang SAMA dengan
      Store di js/storage.js: getAll, getById, create, updateStatus, remove,
      stats, getMine.
   3. Kalau apa pun gagal (offline, Firestore belum diaktifkan, rules menolak),
      adapter menonaktifkan dirinya sendiri dan situs otomatis memakai
      localStorage seperti sebelumnya. Jadi halaman tidak pernah blank.

   Dimuat SETELAH js/utils.js dan SEBELUM js/storage.js? Tidak — dimuat
   setelah storage.js, karena storage.js yang memutuskan mau pakai yang mana.
   ========================================================================== */

(function (global) {
  "use strict";

  const CFG = global.TEMUBALIK_FIREBASE || {};
  const SDK_VERSION = "10.12.2";

  /* Kunci localStorage untuk memaksa mode penyimpanan.
     Berguna saat mengembangkan tanpa internet, dan dipakai uji otomatis:
       localStorage.setItem("temubalik.storage", "local")    → paksa lokal
       localStorage.setItem("temubalik.storage", "firebase") → paksa Firebase
     Kalau tidak diisi, ikuti js/firebase-config.js. */
  const MODE_KEY = "temubalik.storage";

  function forcedMode() {
    try {
      const value = global.localStorage && global.localStorage.getItem(MODE_KEY);
      return value === "local" || value === "firebase" ? value : null;
    } catch {
      return null;
    }
  }

  /* Batas waktu. Kalau Firestore tidak menjawab (mis. API belum diaktifkan
     atau jaringan buruk), jangan biarkan halaman menggantung lama. */
  const SDK_TIMEOUT_MS = 9000;
  const OP_TIMEOUT_MS = 8000;

  const state = {
    enabled: CFG.enabled !== false,
    ready: null,        // Promise<boolean>
    ok: false,          // true kalau FIRESTORE siap dipakai (untuk data)
    authReady: false,   // true kalau FIREBASE AUTH siap (untuk login admin)
    reason: "",         // alasan kalau gagal
    app: null,
    db: null,
    auth: null,
    user: null,
    verified: false,    // sudah pernah sukses baca dari Firestore?
    degraded: false,    // pernah gagal → langsung pakai lokal berikutnya
    authReadyResolve: null,      // penunggu status login (waitAdmin)
    authReadyResolveAuth: null,  // penunggu Auth siap (waitAuth / login)
  };

  const listeners = new Set();
  const statusListeners = new Set();

  /* ------------------------------------------------------------------ */
  /* Utilitas                                                            */
  /* ------------------------------------------------------------------ */
  function log(...args) {
    if (global.console) console.info("[firebase]", ...args);
  }

  function warn(...args) {
    if (global.console) console.warn("[firebase]", ...args);
  }

  /** Bungkus promise dengan batas waktu. */
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label || "Operasi"} melebihi batas waktu ${ms}ms.`)),
          ms
        )
      ),
    ]);
  }

  /** Muat satu file SDK. Resolve kalau sudah ada / berhasil. */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Gagal memuat ${src}`));
      document.head.appendChild(el);
    });
  }

  async function loadSdk() {
    const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
    await withTimeout(loadScript(`${base}/firebase-app-compat.js`), SDK_TIMEOUT_MS, "Muat SDK app");
    await withTimeout(loadScript(`${base}/firebase-firestore-compat.js`), SDK_TIMEOUT_MS, "Muat SDK firestore");
    await withTimeout(loadScript(`${base}/firebase-auth-compat.js`), SDK_TIMEOUT_MS, "Muat SDK auth");

    if (!global.firebase) throw new Error("SDK Firebase tidak tersedia.");
  }

  /* ------------------------------------------------------------------ */
  /* Normalisasi dokumen                                                 */
  /* ------------------------------------------------------------------ */
  /** Firestore menyimpan Timestamp; halaman butuh string ISO. */
  function toIso(value, fallback = "") {
    if (!value) return fallback;
    if (typeof value === "string") return value;
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    return fallback;
  }

  /** Dokumen Firestore → objek laporan seperti yang dipakai halaman. */
  function fromDoc(doc) {
    const data = doc.data() || {};
    return {
      id: data.id || doc.id,
      namaBarang: data.namaBarang || "-",
      kategori: data.kategori || "Lainnya",
      merek: data.merek || "-",
      warna: data.warna || "-",
      ciriKhusus: data.ciriKhusus || "-",
      tanggalHilang: data.tanggalHilang || "",
      jamHilang: data.jamHilang || "",
      lokasi: data.lokasi || "-",
      lokasiDetail: data.lokasiDetail || "-",
      kronologi: data.kronologi || "-",
      foto: data.foto || "assets/img/placeholder.svg",
      namaPelapor: data.namaPelapor || "-",
      nim: data.nim || "-",
      whatsapp: data.whatsapp || "",
      email: data.email || "",
      status: data.status === "Selesai" ? "Selesai" : "Aktif",
      createdAt: toIso(data.createdAt, new Date(0).toISOString()),
      updatedAt: toIso(data.updatedAt, toIso(data.createdAt, new Date(0).toISOString())),
    };
  }

  /** Objek laporan → isi dokumen. createdAt/updatedAt disimpan sebagai Timestamp. */
  function toDocData(report) {
    const F = global.firebase.firestore;
    return {
      ...report,
      createdAt: F.Timestamp.fromDate(new Date(report.createdAt)),
      updatedAt: F.Timestamp.fromDate(new Date(report.updatedAt)),
    };
  }

  function sortDesc(rows) {
    return rows.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /* ------------------------------------------------------------------ */
  /* ID database Firestore                                               */
  /* ------------------------------------------------------------------ */
  /**
   * SDK web Firebase selalu memakai database bernama `(default)`.
   * Padahal database yang dibuat lewat Google Cloud Console bisa ber-ID
   * `default` (tanpa tanda kurung). Keduanya database yang BERBEDA.
   *
   * Fungsi ini mengarahkan instance Firestore ke ID yang tertulis di
   * js/firebase-config.js. Kalau ID-nya memang `(default)`, tidak ada
   * yang diubah — jadi perilaku normal tetap sama.
   */
  function applyDatabaseId(db) {
    const wanted = String(CFG.databaseId || "").trim();
    if (!wanted || wanted === "(default)") return;

    try {
      const internal = db && db._delegate;
      if (internal && internal._databaseId) {
        internal._databaseId = {
          projectId: internal._databaseId.projectId,
          database: wanted,
        };
        log(`database dipakai: ${wanted}`);
      }
    } catch {
      /* kalau struktur internal SDK berubah, biarkan default apa adanya */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Inisialisasi                                                        */
  /* ------------------------------------------------------------------ */
  async function init() {
    if (!state.enabled) {
      state.reason = "Dinonaktifkan lewat js/firebase-config.js (enabled: false).";
      return false;
    }

    // Mode dipaksa lewat localStorage (untuk pengembangan / pengujian).
    if (forcedMode() === "local") {
      state.reason = 'Mode lokal dipaksa (localStorage "temubalik.storage" = "local").';
      log(state.reason);
      notifyStatus();
      return false;
    }

    // Konfigurasi bermasalah. Dua sebab yang sangat berbeda, jangan disamakan —
    // keduanya dulu hanya berbunyi "Konfigurasi Firebase kosong." sehingga
    // orang tidak tahu apa yang harus dilakukan.
    //
    // Catatan: CFG = global.TEMUBALIK_FIREBASE || {}, jadi kita perlu melihat
    // global aslinya untuk membedakan "file tidak ada" dari "file ada tapi kosong".
    const adaConfigFile = Boolean(global.TEMUBALIK_FIREBASE);

    if (!adaConfigFile) {
      // js/firebase-config.js tidak ada atau gagal dimuat sama sekali.
      // Penyebab tersering: repo baru di-clone, dan file itu memang tidak
      // di-commit (dihasilkan dari .env).
      state.reason =
        "File js/firebase-config.js tidak ditemukan. Jalankan " +
        '"cp .env.example .env", isi variabel FIREBASE_*, lalu "npm run config".';
      return false;
    }

    if (!CFG.config || !CFG.config.projectId) {
      const wajib = ["apiKey", "authDomain", "projectId", "appId"];
      const kosong = CFG.config ? wajib.filter((k) => !CFG.config[k]) : wajib;
      state.reason =
        "Konfigurasi Firebase tidak lengkap" +
        (kosong.length ? ` (${kosong.join(", ")} kosong)` : "") +
        '. Isi variabel FIREBASE_* di .env lalu jalankan "npm run config".';
      return false;
    }

    try {
      await loadSdk();

      state.app = global.firebase.apps.length
        ? global.firebase.app()
        : global.firebase.initializeApp(CFG.config);

      state.db = global.firebase.firestore();
      applyDatabaseId(state.db);
      state.auth = global.firebase.auth();

      // Auth siap SEJAK AWAL, terpisah dari Firestore.
      // Login admin hanya butuh Auth, tidak butuh baca Firestore. Jadi kalau
      // probe Firestore di bawah gagal/timeout, login tetap bisa dipakai.
      state.authReady = true;

      // Beri tahu siapa pun yang sedang menunggu Auth (Store.signInAdmin).
      if (state.authReadyResolveAuth) {
        const done = state.authReadyResolveAuth;
        state.authReadyResolveAuth = null;
        done();
      }

      state.auth.onAuthStateChanged((user) => {
        state.user = user || null;

        // Sinyalkan bahwa status login sudah diketahui (dipakai Store.waitAdmin).
        if (state.authReadyResolve) {
          state.authReadyResolve(state.user);
          state.authReadyResolve = null;
        }

        listeners.forEach((fn) => {
          try {
            fn(state.user);
          } catch {
            /* jangan sampai satu listener merusak yang lain */
          }
        });
      });

      // Uji ringan: pastikan Firestore benar-benar bisa diakses.
      // Kalau Firestore belum diaktifkan di Console atau jaringan buruk,
      // error muncul di sini dan situs memakai localStorage.
      await withTimeout(
        state.db.collection(CFG.collection || "reports").limit(1).get(),
        OP_TIMEOUT_MS,
        "Uji koneksi Firestore"
      );

      state.verified = true;

      // PENTING: tandai siap SEBELUM memuat analytics.
      // Analytics opsional. Kalau skripnya diblokir pemblokir iklan atau
      // lambat, dulu init() tidak pernah selesai sehingga login admin ikut
      // mati — padahal Firebase sendiri sehat.
      state.ok = true;
      log(`aktif — project ${CFG.config.projectId}`);
      notifyStatus();

      // Analytics dimuat tanpa ditunggu, dengan batas waktu sendiri.
      if (CFG.enableAnalytics && /^https?:$/.test(location.protocol)) {
        withTimeout(
          loadScript(
            `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-analytics-compat.js`
          ).then(() => global.firebase.analytics()),
          SDK_TIMEOUT_MS,
          "Muat analytics"
        ).catch(() => {
          /* opsional — gagal pun tidak boleh mengganggu apa pun */
        });
      }

      return true;
    } catch (err) {
      state.ok = false;
      state.reason = err && err.message ? err.message : String(err);
      // Lepas penunggu Auth supaya tidak menggantung kalau Auth belum sempat dibuat.
      if (state.authReadyResolveAuth) {
        const done = state.authReadyResolveAuth;
        state.authReadyResolveAuth = null;
        done();
      }
      warn("gagal aktif, memakai localStorage.", state.reason);
      notifyStatus();
      return false;
    }
  }

  function notifyStatus() {
    statusListeners.forEach((fn) => {
      try {
        fn(state.ok);
      } catch {
        /* abaikan */
      }
    });
  }

  function onStatus(callback) {
    statusListeners.add(callback);
    return () => statusListeners.delete(callback);
  }

  function ready() {
    if (!state.ready) {
      state.ready = init();

      // Kalau pemeriksaan koneksi kelamaan, beri alasan yang jelas supaya
      // pengguna/dev tahu kenapa halaman sementara memakai data lokal.
      setTimeout(() => {
        if (!state.ok && !state.reason) {
          state.reason =
            "Pemeriksaan koneksi Firestore masih berjalan (jaringan lambat atau Firestore belum diaktifkan). Sementara memakai data lokal.";
        }
      }, OP_TIMEOUT_MS + 1000);
    }
    return state.ready;
  }

  /** true kalau Firebase sempat gagal — halaman sebaiknya pakai lokal saja. */
  function isDegraded() {
    return state.degraded;
  }

  /**
   * Jalankan operasi Firestore dengan batas waktu.
   * Kalau gagal/timeout, tandai degraded supaya pemanggilan berikutnya
   * langsung memakai localStorage (tidak menunggu lama berulang kali).
   */
  async function guarded(label, task) {
    try {
      return await withTimeout(task(), OP_TIMEOUT_MS, label);
    } catch (err) {
      if (/melebihi batas waktu|unavailable|offline|network/i.test(String(err && err.message))) {
        state.degraded = true;
        warn(`${label} gagal, beralih ke localStorage:`, err.message);
      }
      throw err;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Operasi data                                                        */
  /* ------------------------------------------------------------------ */
  function requireDb() {
    if (!state.ok || !state.db) throw new Error("Firebase belum siap.");
    return state.db;
  }

  function collection() {
    return requireDb().collection(CFG.collection || "reports");
  }

  const MAX_DOCS = Number(CFG.maxDocs) || 500;

  async function getAll() {
    const snap = await guarded("Ambil daftar laporan", () =>
      collection().orderBy("createdAt", "desc").limit(MAX_DOCS).get()
    );
    return sortDesc(snap.docs.map(fromDoc));
  }

  async function getById(id) {
    if (!id) return null;
    const key = String(id).trim().toUpperCase();

    // Coba langsung lewat doc id (paling cepat).
    const direct = await guarded("Ambil laporan", () => collection().doc(key).get());
    if (direct.exists) return fromDoc(direct);

    // Kalau id dokumen tidak sama dengan field id, cari lewat query.
    const q = await guarded("Cari laporan", () =>
      collection().where("id", "==", key).limit(1).get()
    );
    if (!q.empty) return fromDoc(q.docs[0]);

    return null;
  }

  /** Nomor laporan memakai counter dokumen agar tidak bentrok antar pengguna. */
  async function nextId() {
    const db = requireDb();
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const prefix = `LPR-${y}${m}${d}-`;

    const counterRef = db.collection("meta").doc(`counter-${y}${m}${d}`);

    return guarded("Ambil nomor laporan", () => db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const last = snap.exists ? Number(snap.data().value) || 0 : 0;
      const next = last + 1;

      tx.set(counterRef, { value: next, updatedAt: global.firebase.firestore.FieldValue.serverTimestamp() });
      return `${prefix}${String(next).padStart(3, "0")}`;
    }));
  }

  async function create(payload) {
    const id = await nextId();
    const now = new Date().toISOString();

    const report = {
      id,
      namaBarang: payload.namaBarang || "-",
      kategori: payload.kategori || "Lainnya",
      merek: payload.merek || "-",
      warna: payload.warna || "-",
      ciriKhusus: payload.ciriKhusus || "-",
      tanggalHilang: payload.tanggalHilang || "",
      jamHilang: payload.jamHilang || "",
      lokasi: payload.lokasi || "-",
      lokasiDetail: payload.lokasiDetail || "-",
      kronologi: payload.kronologi || "-",
      foto: payload.foto || "assets/img/placeholder.svg",
      namaPelapor: payload.namaPelapor || "-",
      nim: payload.nim || "-",
      whatsapp: payload.whatsapp || "",
      email: payload.email || "",
      status: "Aktif",
      createdAt: now,
      updatedAt: now,
      ownerUid: state.user ? state.user.uid : null,
    };

    await guarded("Simpan laporan", () => collection().doc(id).set(toDocData(report)));

    // "Laporan saya" tetap per perangkat.
    const mine = readMine();
    if (!mine.includes(id)) {
      mine.push(id);
      writeMine(mine);
    }

    return report;
  }

  async function updateStatus(id, status) {
    if (!["Aktif", "Selesai"].includes(status)) {
      throw new Error("Status tidak valid.");
    }

    const report = await getById(id);
    if (!report) throw new Error(`Laporan "${id}" tidak ditemukan.`);

    const updatedAt = new Date().toISOString();
    await guarded("Ubah status", () =>
      collection().doc(report.id).set(
        { status, updatedAt: global.firebase.firestore.Timestamp.fromDate(new Date(updatedAt)) },
        { merge: true }
      )
    );

    return { ...report, status, updatedAt };
  }

  async function remove(id) {
    const report = await getById(id);
    if (!report) throw new Error(`Laporan "${id}" tidak ditemukan.`);

    await guarded("Hapus laporan", () => collection().doc(report.id).delete());

    writeMine(readMine().filter((x) => x !== report.id));
    return true;
  }

  async function stats() {
    const all = await getAll();
    return {
      total: all.length,
      aktif: all.filter((r) => r.status === "Aktif").length,
      selesai: all.filter((r) => r.status === "Selesai").length,
    };
  }

  /* ---------------------- "Laporan saya" (lokal) ---------------------- */
  const MINE_KEY = "temubalik.mine";

  function readMine() {
    try {
      const raw = global.localStorage.getItem(MINE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeMine(ids) {
    try {
      global.localStorage.setItem(MINE_KEY, JSON.stringify(ids));
    } catch {
      /* kuota penuh: abaikan */
    }
  }

  async function getMine() {
    const ids = readMine();
    if (!ids.length) return [];

    const rows = [];
    for (const id of ids) {
      const r = await getById(id);
      if (r) rows.push(r);
    }
    return sortDesc(rows);
  }

  /* ------------------------------------------------------------------ */
  /* Auth admin                                                          */
  /* ------------------------------------------------------------------ */
  /**
   * Tunggu sampai Firebase Auth siap dipakai.
   *
   * BEDA dengan ready(): ready() menandakan FIRESTORE siap. Login admin
   * hanya butuh Auth, jadi jangan sampai login ikut mati hanya karena
   * probe Firestore timeout atau state.degraded.
   *
   * @returns {Promise<boolean>} true kalau state.auth tersedia
   */
  function waitAuth(timeoutMs = 20000) {
    if (state.auth) return Promise.resolve(true);
    if (!state.enabled) return Promise.resolve(false);

    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        resolve(ok);
      };

      // init() memanggil state.authReadyResolveAuth begitu state.auth terisi,
      // yaitu SEBELUM probe Firestore. Jadi login tidak menunggu Firestore.
      const prev = state.authReadyResolveAuth;
      state.authReadyResolveAuth = () => {
        if (prev) prev();
        finish(Boolean(state.auth));
      };

      // Kalau init() ternyata gagal total, jangan menggantung.
      ready()
        .then(() => finish(Boolean(state.auth)))
        .catch(() => finish(Boolean(state.auth)));

      // Batas waktu keras.
      setTimeout(() => finish(Boolean(state.auth)), timeoutMs);
    });
  }

  async function signIn(email, password) {
    const ok = await waitAuth();
    if (!ok || !state.auth) {
      throw new Error(
        state.reason
          ? `Firebase Auth tidak dapat dihubungi: ${state.reason}`
          : "Firebase Auth tidak dapat dihubungi. Periksa koneksi internet Anda."
      );
    }
    const cred = await state.auth.signInWithEmailAndPassword(String(email).trim(), String(password));
    applyUser(cred.user);
    return state.user;
  }

  /**
   * Login dengan Google (popup).
   * Popup bisa diblokir browser → beri pesan yang jelas, jangan gagal diam.
   */
  async function signInWithGoogle() {
    const ok = await waitAuth();
    if (!ok || !state.auth) {
      throw new Error(
        state.reason
          ? `Firebase Auth tidak dapat dihubungi: ${state.reason}`
          : "Firebase Auth tidak dapat dihubungi. Periksa koneksi internet Anda."
      );
    }

    const provider = new global.firebase.auth.GoogleAuthProvider();
    const cred = await state.auth.signInWithPopup(provider);
    applyUser(cred.user);
    return state.user;
  }

  /** Samakan state.user dengan hasil login, lalu beri tahu pendengar. */
  function applyUser(user) {
    state.user = user || null;

    if (state.authReadyResolve) {
      state.authReadyResolve(state.user);
      state.authReadyResolve = null;
    }

    listeners.forEach((fn) => {
      try {
        fn(state.user);
      } catch {
        /* abaikan */
      }
    });
  }

  async function signOut() {
    if (state.auth) await state.auth.signOut();
    applyUser(null);
  }

  function currentUser() {
    return state.user;
  }

  /**
   * Tunggu sampai Firebase Auth selesai memulihkan sesi lama.
   * Tanpa ini, halaman bisa sempat menganggap admin belum login
   * (tombol ubah status berkedip hilang lalu muncul lagi).
   */
  function waitAdmin(timeoutMs = 4000) {
    return new Promise((resolve) => {
      // Syaratnya Auth siap, BUKAN Firestore siap. Sesi admin tetap harus
      // terbaca walaupun probe Firestore sempat gagal.
      if (!state.authReady || !state.auth) {
        resolve(null);
        return;
      }
      if (state.user) {
        resolve(state.user);
        return;
      }

      let done = false;
      const finish = (user) => {
        if (done) return;
        done = true;
        resolve(user);
      };

      state.authReadyResolve = finish;

      state.auth.onAuthStateChanged((user) => {
        if (user) finish(user);
      });

      setTimeout(() => finish(state.user), timeoutMs);
    });
  }

  function onAuth(callback) {
    listeners.add(callback);
    // Auth siap → beri keadaan sekarang. Jangan pakai state.ok (Firestore),
    // supaya panel admin tidak "berkedip" ke halaman login saat Firestore
    // sedang bermasalah.
    if (state.authReady) callback(state.user);
    return () => listeners.delete(callback);
  }

  /* ------------------------------------------------------------------ */
  /* Ekspor                                                             */
  /* ------------------------------------------------------------------ */
  global.FirebaseStore = {
    ready,
    isEnabled: () => state.enabled,
    isReady: () => state.ok,
    isAuthReady: () => state.authReady,
    isDegraded,
    onStatus,
    reason: () => state.reason,
    mode: () => (state.ok ? "firebase" : "local"),

    getAll,
    getById,
    create,
    updateStatus,
    remove,
    stats,
    getMine,

    signIn,
    signInWithGoogle,
    signOut,
    currentUser,
    waitAdmin,
    waitAuth,
    onAuth,
  };

  // Mulai memuat SDK lebih awal supaya tidak menunggu saat halaman dibuka.
  ready();
})(window);
