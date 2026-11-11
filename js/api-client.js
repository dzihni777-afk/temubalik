/* ==========================================================================
   TemuBalik — Klien API (opsional, BELUM DISAMBUNG ke halaman)

   File ini belum dipakai oleh halaman mana pun. Halaman masih memakai
   js/storage.js + localStorage seperti sebelumnya, jadi situs tetap jalan
   walau server backend tidak dinyalakan.

   Kalau nanti mau memindahkan halaman ke backend, ganti isi fungsi di
   js/storage.js agar memanggil Api.* di bawah — nama fungsinya sudah
   dibuat sama (getAll, getById, create, updateStatus, remove) supaya
   file lain tidak perlu diubah.
   ========================================================================== */

(function (global) {
  "use strict";

  const BASE = global.TEMUBALIK_API_BASE || "/api";

  async function request(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      /* respons bukan JSON */
    }

    if (!res.ok) {
      const err = new Error(payload?.error?.message || `Permintaan gagal (${res.status}).`);
      err.status = res.status;
      err.code = payload?.error?.code;
      err.fields = payload?.error?.fields || null;
      throw err;
    }

    return payload;
  }

  const Api = {
    /** [SELESAI] Ambil daftar laporan. */
    async list({ q = "", kategori = "", status = "", lokasi = "", sort = "terbaru", limit = 9, offset = 0 } = {}) {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (kategori) params.set("kategori", kategori);
      if (status) params.set("status", status);
      if (lokasi) params.set("lokasi", lokasi);
      if (sort) params.set("sort", sort);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const { data, meta } = await request("GET", `/reports?${params}`);
      return { data, meta };
    },

    /** [SELESAI] Ambil satu laporan; null kalau tidak ada (bukan error). */
    async getById(id) {
      try {
        const { data } = await request("GET", `/reports/${encodeURIComponent(id)}`);
        return data;
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },

    /** [SELESAI] Buat laporan baru. Melempar err.fields kalau validasi gagal. */
    async create(payload) {
      const { data } = await request("POST", "/reports", payload);
      return data;
    },

    /* ------------------------------------------------------------------
       TODO: dua fungsi di bawah belum jalan karena endpoint-nya masih stub
       di server (selalu membalas 501). Kerjakan endpoint dulu di
       server/routes/reports.js, baru buka komentar di sini.
       ------------------------------------------------------------------ */

    /** [BELUM] Ubah status laporan. */
    async updateStatus(id, status) {
      void id;
      void status;
      throw new Error("Api.updateStatus belum diimplementasikan.");
      // const { data } = await request("PATCH", `/reports/${encodeURIComponent(id)}/status`, { status });
      // return data;
    },

    /** [BELUM] Hapus laporan. */
    async remove(id) {
      void id;
      throw new Error("Api.remove belum diimplementasikan.");
      // return request("DELETE", `/reports/${encodeURIComponent(id)}`);
    },
  };

  global.Api = Api;
})(window);
