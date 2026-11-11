/* ==========================================================================
   TemuBalik — Klien API (opsional, BELUM DISAMBUNG ke halaman)

   File ini belum dipakai oleh halaman mana pun. Halaman masih memakai
   js/storage.js + localStorage seperti sebelumnya, jadi situs tetap jalan
   walau server backend tidak dinyalakan.

   Kalau nanti mau memindahkan halaman ke backend, ganti isi fungsi di
   js/storage.js agar memanggil Api.* di bawah — nama fungsinya sudah
   dibuat sama (getAll, getById, create, updateStatus, remove, stats)
   supaya file lain tidak perlu diubah.

   Endpoint ubah status / hapus / cek sesi butuh token admin.
   Pakai Api.adminLogin("sandi") dulu; token disimpan di memori modul ini
   (bukan localStorage) supaya tidak ikut terbaca skrip lain.
   ========================================================================== */

(function (global) {
  "use strict";

  const BASE = global.TEMUBALIK_API_BASE || "/api";
  const TOKEN_KEY = "temubalik.api.token";

  let token = null;

  /* Token disimpan di sessionStorage kalau ada, supaya tidak hilang saat
     pindah halaman tapi tetap hilang ketika tab ditutup. */
  function readStoredToken() {
    try {
      return global.sessionStorage?.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  }

  function writeStoredToken(value) {
    token = value || null;
    try {
      if (value) global.sessionStorage?.setItem(TOKEN_KEY, value);
      else global.sessionStorage?.removeItem(TOKEN_KEY);
    } catch {
      /* sessionStorage bisa diblokir (mode privat) — token tetap di memori */
    }
  }

  token = readStoredToken();

  async function request(method, path, body) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(BASE + path, {
      method,
      headers,
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
      // Token tidak berlaku lagi: buang supaya tidak dipakai terus.
      if (res.status === 401) writeStoredToken(null);
      throw err;
    }

    return payload;
  }

  const Api = {
    /** Ambil daftar laporan. */
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

    /** Ambil satu laporan; null kalau tidak ada (bukan error). */
    async getById(id) {
      try {
        const { data } = await request("GET", `/reports/${encodeURIComponent(id)}`);
        return data;
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },

    /** Buat laporan baru. Melempar err.fields kalau validasi gagal. */
    async create(payload) {
      const { data } = await request("POST", "/reports", payload);
      return data;
    },

    /** Ringkasan jumlah laporan. */
    async stats() {
      const { data } = await request("GET", "/stats");
      return data;
    },

    /** Ubah status laporan (butuh token admin). */
    async updateStatus(id, status) {
      const { data } = await request("PATCH", `/reports/${encodeURIComponent(id)}/status`, { status });
      return data;
    },

    /** Hapus laporan (butuh token admin). */
    async remove(id) {
      const { data } = await request("DELETE", `/reports/${encodeURIComponent(id)}`);
      return data;
    },

    /* ----------------------------- Admin ----------------------------- */

    /** Tukar kata sandi dengan token; token disimpan untuk request berikutnya. */
    async adminLogin(password) {
      const { data } = await request("POST", "/admin/login", { password });
      writeStoredToken(data.token);
      return data;
    },

    /** Cek token masih berlaku; null kalau belum/tidak lagi login. */
    async adminMe() {
      if (!token) return null;
      try {
        const { data } = await request("GET", "/admin/me");
        return data;
      } catch (err) {
        if (err.status === 401) return null;
        throw err;
      }
    },

    /** Cabut token di server lalu lupakan di klien. */
    async adminLogout() {
      if (!token) return false;
      try {
        await request("POST", "/admin/logout");
      } finally {
        writeStoredToken(null);
      }
      return true;
    },

    /** true kalau klien sedang memegang token. */
    hasToken() {
      return Boolean(token);
    },
  };

  global.Api = Api;
})(window);
