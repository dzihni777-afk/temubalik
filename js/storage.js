/* ==========================================================================
   TemuBalik — Storage Layer
   Semua akses data lewat modul ini.

   Sumber data (dipilih otomatis):
   1. Firebase Firestore      → kalau js/firebase-adapter.js berhasil aktif
   2. data/data.json + localStorage → cadangan kalau Firebase gagal/offline

   Halaman TIDAK perlu tahu sedang memakai yang mana: nama fungsinya sama.
   ========================================================================== */

const KEYS = {
  LOCAL: "temubalik.local",       // laporan baru dari browser ini
  OVERRIDES: "temubalik.overrides", // perubahan status pada laporan seed
  DELETED: "temubalik.deleted",   // id laporan yang dihapus
  DRAFT: "temubalik.draft",       // draft form
  ADMIN: "temubalik.admin",       // sesi admin
};

const SEED_URL = "data/data.json";
const SEED_SCRIPT = "data/data-seed.js";

let seedCache = null;

/* ---------- Low level ---------- */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    if (err && (err.name === "QuotaExceededError" || err.code === 22)) {
      throw new Error("Penyimpanan browser penuh. Hapus beberapa laporan lama lalu coba lagi.");
    }
    throw err;
  }
}

/* ---------- Seed loading ---------- */
function loadSeedViaScript() {
  return new Promise((resolve) => {
    if (Array.isArray(window.SEED_REPORTS)) {
      resolve(window.SEED_REPORTS);
      return;
    }
    const s = document.createElement("script");
    s.src = SEED_SCRIPT;
    s.onload = () => resolve(Array.isArray(window.SEED_REPORTS) ? window.SEED_REPORTS : []);
    s.onerror = () => resolve([]);
    document.head.appendChild(s);
  });
}

async function getSeed() {
  if (seedCache) return seedCache;

  try {
    const res = await fetch(SEED_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("not ok");
    const data = await res.json();
    seedCache = Array.isArray(data) ? data : [];
  } catch {
    // Fallback untuk mode file:// (fetch diblokir CORS)
    seedCache = await loadSeedViaScript();
  }

  return seedCache;
}

/* ---------- Public API (implementasi lokal) ---------- */
const LocalStore = {
  /**
   * Semua laporan (seed + lokal), sudah difilter yang dihapus.
   *
   * Tiap laporan diberi penanda `_contoh: true` kalau berasal dari data
   * contoh (data/data.json), supaya tampilan bisa memberi label "Contoh".
   * Laporan yang dibuat pengguna sendiri TIDAK diberi penanda ini.
   */
  async getAll() {
    const seed = await getSeed();
    const local = readJSON(KEYS.LOCAL, []);
    const overrides = readJSON(KEYS.OVERRIDES, {});
    const deleted = new Set(readJSON(KEYS.DELETED, []));

    // Id data contoh, dipakai untuk menandai hasil gabungan.
    const seedIds = new Set(seed.map((r) => r && r.id).filter(Boolean));

    const merged = [...seed, ...local]
      .filter((r) => r && r.id && !deleted.has(r.id))
      .map((r) => {
        const row = overrides[r.id] ? { ...r, ...overrides[r.id] } : r;
        return seedIds.has(r.id) ? { ...row, _contoh: true } : row;
      });

    return merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  /** Ambil satu laporan berdasarkan id. */
  async getById(id) {
    if (!id) return null;
    const all = await this.getAll();
    return all.find((r) => r.id === id) || null;
  },

  /** Buat nomor laporan: LPR-YYYYMMDD-NNN */
  async nextId() {
    const all = await this.getAll();
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const prefix = `LPR-${y}${m}${d}-`;

    const todayCount = all.filter((r) => String(r.id).startsWith(prefix)).length;
    let seq = todayCount + 1;

    // Pastikan tidak bentrok walau ada penghapusan
    let candidate = `${prefix}${String(seq).padStart(3, "0")}`;
    const existing = new Set(all.map((r) => r.id));
    while (existing.has(candidate)) {
      seq += 1;
      candidate = `${prefix}${String(seq).padStart(3, "0")}`;
    }
    return candidate;
  },

  /** Simpan laporan baru. Mengembalikan objek laporan. */
  async create(payload) {
    const id = await this.nextId();
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
    };

    const local = readJSON(KEYS.LOCAL, []);
    local.push(report);
    writeJSON(KEYS.LOCAL, local);

    // Catat di "laporan saya"
    const mine = readJSON("temubalik.mine", []);
    if (!mine.includes(id)) {
      mine.push(id);
      writeJSON("temubalik.mine", mine);
    }

    return report;
  },

  /** Ubah status laporan (Aktif / Selesai). */
  async updateStatus(id, status) {
    if (!["Aktif", "Selesai"].includes(status)) {
      throw new Error("Status tidak valid.");
    }

    const patch = { status, updatedAt: new Date().toISOString() };
    const local = readJSON(KEYS.LOCAL, []);
    const idx = local.findIndex((r) => r.id === id);

    if (idx >= 0) {
      local[idx] = { ...local[idx], ...patch };
      writeJSON(KEYS.LOCAL, local);
    } else {
      // Laporan seed → simpan sebagai override
      const overrides = readJSON(KEYS.OVERRIDES, {});
      overrides[id] = { ...(overrides[id] || {}), ...patch };
      writeJSON(KEYS.OVERRIDES, overrides);
    }

    return this.getById(id);
  },

  /** Hapus laporan. */
  async remove(id) {
    const local = readJSON(KEYS.LOCAL, []);
    const idx = local.findIndex((r) => r.id === id);

    if (idx >= 0) {
      local.splice(idx, 1);
      writeJSON(KEYS.LOCAL, local);
    }

    const deleted = readJSON(KEYS.DELETED, []);
    if (!deleted.includes(id)) {
      deleted.push(id);
      writeJSON(KEYS.DELETED, deleted);
    }

    // Bersihkan dari daftar "laporan saya"
    const mine = readJSON("temubalik.mine", []).filter((x) => x !== id);
    writeJSON("temubalik.mine", mine);

    return true;
  },

  /** Statistik ringkas. */
  async stats() {
    const all = await this.getAll();
    const aktif = all.filter((r) => r.status === "Aktif").length;
    const selesai = all.filter((r) => r.status === "Selesai").length;
    return { total: all.length, aktif, selesai };
  },

  /* ---------- Draft form ---------- */
  saveDraft(data) {
    try {
      localStorage.setItem(KEYS.DRAFT, JSON.stringify(data));
    } catch {
      /* diamkan: draft opsional */
    }
  },

  loadDraft() {
    return readJSON(KEYS.DRAFT, null);
  },

  clearDraft() {
    localStorage.removeItem(KEYS.DRAFT);
  },

  /* ---------- "Laporan saya" ---------- */
  async getMine() {
    const ids = readJSON("temubalik.mine", []);
    if (!ids.length) return [];
    const all = await this.getAll();
    return all.filter((r) => ids.includes(r.id));
  },

  /* ---------- Admin session (fallback lokal, bukan keamanan sungguhan) ---------- */
  setAdminSession(on) {
    if (on) localStorage.setItem(KEYS.ADMIN, "1");
    else localStorage.removeItem(KEYS.ADMIN);
  },

  isAdmin() {
    return localStorage.getItem(KEYS.ADMIN) === "1";
  },
};

/* ==========================================================================
   Pemilih sumber data

   Kalau Firebase siap → semua operasi data diteruskan ke FirebaseStore.
   Kalau tidak (offline, Firestore belum diaktifkan, rules menolak) →
   otomatis memakai LocalStore. Halaman tidak perlu diubah sama sekali.
   ========================================================================== */

const FIREBASE_TIMEOUT_MS = 6000;

/* Untuk operasi BACA, jangan tunggu lama: halaman harus langsung terisi.
   Kalau Firebase belum siap dalam jendela ini, pakai data lokal dulu. */
const FIREBASE_FAST_MS = 900;

/** Tunggu Firebase siap, tapi jangan sampai halaman menggantung selamanya. */
function firebaseReady(timeoutMs = FIREBASE_TIMEOUT_MS) {
  const fb = typeof window !== "undefined" ? window.FirebaseStore : null;
  if (!fb || typeof fb.ready !== "function") return Promise.resolve(false);

  return Promise.race([
    fb.ready().catch(() => false),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

/** Ambil FirebaseStore hanya kalau benar-benar siap dipakai (untuk DATA). */
function fb() {
  const store = typeof window !== "undefined" ? window.FirebaseStore : null;
  if (!store || !store.isReady || !store.isReady()) return null;
  // Sudah pernah gagal → jangan coba lagi di halaman ini.
  if (typeof store.isDegraded === "function" && store.isDegraded()) return null;
  return store;
}

/**
 * Ambil FirebaseStore untuk urusan AUTH (login admin), tanpa syarat Firestore.
 *
 * Kenapa dipisah: login admin hanya butuh Firebase Auth. Kalau probe Firestore
 * sempat timeout (state.degraded), fb() mengembalikan null — dulu itu membuat
 * login admin mati total padahal Auth sehat. Auth dan Firestore adalah dua
 * layanan berbeda; kegagalan salah satunya tidak boleh mematikan yang lain.
 */
function fbAuth() {
  const store = typeof window !== "undefined" ? window.FirebaseStore : null;
  if (!store) return null;
  const authReady =
    typeof store.isAuthReady === "function" ? store.isAuthReady() : store.isReady();
  return authReady ? store : null;
}

/**
 * Tunggu Firebase AUTH siap (bukan Firestore).
 *
 * Login adalah tindakan sengaja yang dipicu klik, jadi wajar menunggu lebih
 * lama daripada pemuatan daftar. Versi lama memakai firebaseReady() dengan
 * batas 6 detik sementara adapter memberi izin probe Firestore 8 detik —
 * akibatnya login menyerah lebih dulu padahal Firebase baru saja siap.
 */
async function firebaseAuthReady(timeoutMs = 20000) {
  const store = typeof window !== "undefined" ? window.FirebaseStore : null;
  if (!store) return false;

  // Sudah siap? langsung pakai.
  if (typeof store.isAuthReady === "function" && store.isAuthReady()) return true;

  if (typeof store.waitAuth === "function") {
    return Promise.race([
      store.waitAuth(timeoutMs).catch(() => false),
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs + 1000)),
    ]);
  }

  return firebaseReady(timeoutMs);
}

/**
 * Kata sandi demo untuk mode lokal.
 * Nilainya TIDAK ditulis di kode: berasal dari js/firebase-config.js yang
 * dihasilkan dari .env (FIREBASE_DEMO_PASSWORD). Kosong = login demo mati.
 */
function demoPassword() {
  const cfg = (typeof window !== "undefined" && window.TEMUBALIK_FIREBASE) || {};
  return String(cfg.demoPassword || "");
}

/**
 * Apakah situs sedang dibuka dari komputer sendiri?
 * Dipakai untuk membatasi fitur demo (mis. kata sandi demo)
 * supaya tidak ikut terbuka saat situs sudah online.
 */
function isLocalHost() {
  try {
    const host = String(location.hostname || "");
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "" || // file://
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

const Store = {
  /** "firebase" atau "local" — dipakai untuk menampilkan info di UI. */
  async mode() {
    await firebaseReady();
    return fb() ? "firebase" : "local";
  },

  /**
   * Panggil Firebase dulu; kalau gagal, pakai lokal.
   * Halaman jadi tidak pernah kosong gara-gara jaringan.
   *
   * @param {Function} remoteCall
   * @param {Function} localCall
   * @param {"fast"|"wait"} speed  "fast" untuk baca, "wait" untuk tulis.
   */
  async _run(remoteCall, localCall, speed = "wait") {
    await firebaseReady(speed === "fast" ? FIREBASE_FAST_MS : FIREBASE_TIMEOUT_MS);
    const remote = fb();

    if (remote) {
      try {
        return await remoteCall(remote);
      } catch (err) {
        console.warn("[store] Firebase gagal, memakai data lokal:", err && err.message);
      }
    }
    return localCall();
  },

  async getAll() {
    return this._run(
      (remote) => remote.getAll(),
      () => LocalStore.getAll(),
      "fast"
    );
  },

  async getById(id) {
    return this._run(
      (remote) => remote.getById(id),
      () => LocalStore.getById(id),
      "fast"
    );
  },

  async nextId() {
    // Firestore memakai counter transaksi sendiri di dalam create().
    await firebaseReady();
    return fb() ? null : LocalStore.nextId();
  },

  async create(payload) {
    return this._run(
      (remote) => remote.create(payload),
      () => LocalStore.create(payload)
    );
  },

  async updateStatus(id, status) {
    return this._run(
      (remote) => remote.updateStatus(id, status),
      () => LocalStore.updateStatus(id, status)
    );
  },

  async remove(id) {
    return this._run(
      (remote) => remote.remove(id),
      () => LocalStore.remove(id)
    );
  },

  async stats() {
    return this._run(
      (remote) => remote.stats(),
      () => LocalStore.stats(),
      "fast"
    );
  },

  async getMine() {
    return this._run(
      (remote) => remote.getMine(),
      () => LocalStore.getMine(),
      "fast"
    );
  },

  /* ---------- Draft selalu lokal (tidak perlu ke server) ---------- */
  saveDraft: (data) => LocalStore.saveDraft(data),
  loadDraft: () => LocalStore.loadDraft(),
  clearDraft: () => LocalStore.clearDraft(),

  /* ---------- Admin ---------- */

  /** Login admin: Firebase Auth kalau aktif, kalau tidak mode demo lokal. */
  async signInAdmin(email, password) {
    // Tunggu FIREBASE AUTH (bukan Firestore). Login hanya butuh Auth.
    const authOk = await firebaseAuthReady();
    const remote = authOk ? fbAuth() : null;
    if (remote) return remote.signIn(email, password);

    // --- Mode demo (hanya saat Firebase benar-benar tidak tersedia) ---
    // PENTING: kata sandi demo ini HANYA boleh berlaku di komputer sendiri.
    // Kalau situs sudah online lalu Firebase gagal (jaringan buruk, kuota
    // habis, salah konfigurasi), tanpa batas ini siapa pun bisa masuk admin
    // dengan kata sandi demo. Jadi di domain publik login demo ditolak.
    if (!isLocalHost()) {
      const store = typeof window !== "undefined" ? window.FirebaseStore : null;
      const why =
        store && typeof store.reason === "function" ? String(store.reason() || "") : "";

      // Kalau masalahnya konfigurasi, JANGAN sarankan Google — jalur itu butuh
      // konfigurasi yang sama, jadi sarannya menyesatkan.
      const masalahConfig = /firebase-config\.js|Konfigurasi Firebase|FIREBASE_|npm run config/i.test(
        why
      );

      throw new Error(
        "Tidak dapat terhubung ke Firebase, jadi login admin dinonaktifkan." +
          (why ? ` Penyebab: ${why}` : " Periksa koneksi internet lalu coba lagi.") +
          (masalahConfig
            ? ""
            : " Kalau tombol Masuk dengan Google tersedia, coba jalur itu.")
      );
    }

    // Kata sandi demo TIDAK ditulis di kode — dibaca dari js/firebase-config.js
    // yang dihasilkan dari .env. Kalau tidak diisi, login demo mati.
    const demo = demoPassword();
    if (!demo) {
      throw new Error(
        "Login demo belum diatur. Isi FIREBASE_DEMO_PASSWORD di .env lalu jalankan npm run config."
      );
    }

    if (String(password) !== demo) {
      throw new Error("Kata sandi salah. Coba lagi.");
    }
    LocalStore.setAdminSession(true);
    return { email: "demo@local" };
  },

  async signOutAdmin() {
    const remote = fbAuth() || fb();
    if (remote) await remote.signOut();
    LocalStore.setAdminSession(false);
  },

  /** Login admin dengan Google (hanya kalau Firebase aktif). */
  async signInAdminWithGoogle() {
    const authOk = await firebaseAuthReady();
    const remote = authOk ? fbAuth() : null;
    if (!remote || typeof remote.signInWithGoogle !== "function") {
      throw new Error("Login Google hanya tersedia saat Firebase aktif.");
    }
    return remote.signInWithGoogle();
  },

  /** Apakah login Google bisa ditawarkan di halaman ini. */
  canUseGoogle() {
    return Boolean(fbAuth() || fb());
  },

  /** Apakah ada admin yang sedang login. */
  isAdmin() {
    // Jalur Auth dulu: sesi admin tidak boleh hilang gara-gara Firestore degraded.
    const remote = fbAuth() || fb();
    if (remote) return Boolean(remote.currentUser());
    return LocalStore.isAdmin();
  },

  /**
   * Tunggu sampai status login diketahui (penting saat Firebase memulihkan sesi).
   *
   * Batasnya lebih pendek daripada signInAdmin: di sini kita hanya memulihkan
   * sesi lama, dan formulir login sudah tampil. Menunggu terlalu lama membuat
   * halaman terasa menggantung.
   */
  async waitAdmin(timeoutMs = 8000) {
    await firebaseAuthReady(timeoutMs);
    const remote = fbAuth() || fb();
    if (remote && typeof remote.waitAdmin === "function") {
      await remote.waitAdmin();
    }
    return this.isAdmin();
  },

  /** Email admin yang login, atau null. */
  adminEmail() {
    const remote = fbAuth() || fb();
    if (remote) {
      const user = remote.currentUser();
      return user ? user.email || "admin" : null;
    }
    return LocalStore.isAdmin() ? "demo@local" : null;
  },

  /**
   * Pantau perubahan status login.
   * Langsung memanggil callback dengan keadaan sekarang, lalu setiap berubah.
   */
  onAdminChange(callback) {
    let unsubscribe = () => {};
    let stopped = false;

    firebaseAuthReady().then(() => {
      if (stopped) return;
      const remote = fbAuth() || fb();

      if (remote && typeof remote.onAuth === "function") {
        callback(Boolean(remote.currentUser()), remote.currentUser()?.email || null);
        unsubscribe = remote.onAuth(() => {
          const user = remote.currentUser();
          callback(Boolean(user), user ? user.email || "admin" : null);
        });
      } else {
        callback(LocalStore.isAdmin(), LocalStore.isAdmin() ? "demo@local" : null);
      }
    });

    return () => {
      stopped = true;
      unsubscribe();
    };
  },

  /**
   * Versi progresif untuk halaman detail.
   *
   * 1. Tampilkan dari data lokal secepatnya (kalau ada).
   * 2. Tunggu Firebase; kalau datanya ada di sana, tampilkan versi terbaru.
   *
   * @param {string} id
   * @param {(report: any, source: "local"|"firebase") => void} onData
   * @returns {Promise<any|null>} hasil akhir
   */
  async getByIdProgressive(id, onData) {
    let local = null;
    try {
      local = await LocalStore.getById(id);
    } catch {
      /* abaikan */
    }
    if (local) onData(local, "local");

    const store = typeof window !== "undefined" ? window.FirebaseStore : null;
    if (!store || typeof store.ready !== "function") return local;

    const ok = await firebaseReady(FIREBASE_TIMEOUT_MS);
    const remote = fb();
    if (!ok || !remote) return local;

    try {
      const fresh = await remote.getById(id);
      if (fresh) onData(fresh, "firebase");
      return fresh || local;
    } catch (err) {
      console.warn("[store] gagal ambil detail dari Firebase:", err && err.message);
      return local;
    }
  },

  /** true kalau Firebase yang dipakai (bukan localStorage). */
  usingFirebase() {
    return Boolean(fb());
  },

  /**
   * true kalau Firebase AUTH aktif (untuk form login admin).
   *
   * Dipisah dari usingFirebase(): saat Firestore bermasalah tetapi Auth sehat,
   * form login tetap harus memperlakukan email sebagai wajib.
   */
  usingAuth() {
    return Boolean(fbAuth() || fb());
  },

  /**
   * Tampilkan data lokal dulu supaya halaman langsung terisi, lalu panggil
   * `onData` lagi dengan data Firebase begitu siap.
   *
   * Dipakai halaman daftar/beranda agar tidak menunggu jaringan.
   * @param {(rows: any[], source: "local"|"firebase") => void} onData
   */
  /**
   * Tampilkan data cepat, lalu lengkapi dari Firebase.
   *
   * PENTING: hasil Firebase DIGABUNG dengan data lokal, bukan menggantinya.
   * Versi lama memanggil onData(local) lalu onData(remote) — karena remote
   * menggantikan seluruh daftar, 10 laporan contoh langsung hilang begitu
   * Firestore (yang mungkin masih kosong) menjawab.
   *
   * Urutan hasil: laporan Firebase lebih dulu (paling baru), lalu sisanya.
   * Laporan contoh tetap diberi penanda `_contoh` agar bisa dilabeli.
   */
  async getAllProgressive(onData) {
    // 1) Tampilkan cepat dari cache/seed lokal.
    let localRows = [];
    try {
      localRows = await LocalStore.getAll();
      onData(localRows, "local");
    } catch {
      /* kalau seed pun gagal, biarkan lanjut */
    }

    // 2) Coba Firebase; kalau berhasil, GABUNG dengan data lokal.
    const store = typeof window !== "undefined" ? window.FirebaseStore : null;
    if (!store || typeof store.ready !== "function") return;

    const ok = await firebaseReady();
    const remote = fb();
    if (!ok || !remote) return;

    try {
      const remoteRows = await remote.getAll();
      if (!Array.isArray(remoteRows) || !remoteRows.length) return;

      // Laporan yang sudah ada di Firebase menang atas versi lokalnya.
      const remoteIds = new Set(remoteRows.map((r) => r && r.id).filter(Boolean));
      const onlyLocal = localRows.filter((r) => r && r.id && !remoteIds.has(r.id));

      const merged = [...remoteRows, ...onlyLocal].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      onData(merged, "firebase");
    } catch (err) {
      console.warn("[store] sinkronisasi Firebase gagal:", err && err.message);
    }
  },
};

/* ---------- Image helper: kompres ke base64 ---------- */
function compressImage(file, maxSize = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("File harus berupa gambar."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Gambar tidak dapat dibuka."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const scale = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          resolve(reader.result);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
