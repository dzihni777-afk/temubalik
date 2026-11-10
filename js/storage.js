/* ==========================================================================
   TemuBalik — Storage Layer
   Semua akses data lewat modul ini.

   Sumber data:
   1. data/data.json          → data awal (seed), read-only
   2. localStorage            → laporan baru, perubahan status, penghapusan

   Kalau nanti mau disambung ke backend asli, cukup ganti isi fungsi-fungsi
   di bawah dengan pemanggilan fetch() ke API.
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

/* ---------- Public API ---------- */
const Store = {
  /** Semua laporan (seed + lokal), sudah difilter yang dihapus. */
  async getAll() {
    const seed = await getSeed();
    const local = readJSON(KEYS.LOCAL, []);
    const overrides = readJSON(KEYS.OVERRIDES, {});
    const deleted = new Set(readJSON(KEYS.DELETED, []));

    const merged = [...seed, ...local]
      .filter((r) => r && r.id && !deleted.has(r.id))
      .map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r));

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

  /* ---------- Admin session (demo saja) ---------- */
  setAdminSession(on) {
    if (on) localStorage.setItem(KEYS.ADMIN, "1");
    else localStorage.removeItem(KEYS.ADMIN);
  },

  isAdmin() {
    return localStorage.getItem(KEYS.ADMIN) === "1";
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
