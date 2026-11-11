/* ==========================================================================
   TemuBalik — Validasi input (sisi server)

   Aturan di sini sengaja dibuat sama dengan js/form.js. Validasi front-end
   hanya untuk kenyamanan; validasi di sini yang menentukan data masuk atau
   tidak, karena request bisa dikirim tanpa lewat browser.
   ========================================================================== */

"use strict";

/* Salinan dari js/utils.js. Kalau daftar di sana berubah, ubah juga di sini
   (atau nanti pindahkan ke satu file bersama). */
const KATEGORI = [
  "Elektronik",
  "Dompet & Tas",
  "Dokumen",
  "Kunci",
  "Pakaian",
  "Aksesoris",
  "Lainnya",
];

const LOKASI = [
  "Gedung A",
  "Gedung B",
  "Gedung C",
  "Gedung Utama",
  "Perpustakaan",
  "Kantin",
  "Lab Komputer",
  "Ruang Kelas",
  "Lapangan Olahraga",
  "Parkiran",
  "Lainnya",
];

const STATUS = ["Aktif", "Selesai"];

function str(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

/** "2026-02-30" lolos regex tapi bukan tanggal nyata — cek dengan Date. */
function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const back = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return back === value;
}

/**
 * Validasi payload laporan baru.
 * @returns {{ ok: boolean, errors: Record<string,string>, value: object }}
 */
function validateCreate(input) {
  const body = input && typeof input === "object" ? input : {};
  const errors = {};

  const namaPelapor = str(body.namaPelapor);
  const nim = str(body.nim);
  const whatsapp = str(body.whatsapp);
  const email = str(body.email);
  const namaBarang = str(body.namaBarang);
  const kategori = str(body.kategori);
  const merek = str(body.merek);
  const warna = str(body.warna);
  const ciriKhusus = str(body.ciriKhusus);
  const tanggalHilang = str(body.tanggalHilang);
  const jamHilang = str(body.jamHilang);
  const lokasi = str(body.lokasi);
  const lokasiDetail = str(body.lokasiDetail);
  const kronologi = str(body.kronologi);
  const foto = str(body.foto);

  if (!namaPelapor) errors.namaPelapor = "Nama lengkap wajib diisi.";
  else if (namaPelapor.length < 3) errors.namaPelapor = "Nama minimal 3 karakter.";
  else if (namaPelapor.length > 80) errors.namaPelapor = "Nama maksimal 80 karakter.";

  const waDigits = whatsapp.replace(/[\s\-()]/g, "");
  if (!waDigits) errors.whatsapp = "Nomor WhatsApp wajib diisi.";
  else if (!/^(0|62)\d{8,14}$/.test(waDigits)) {
    errors.whatsapp = "Format nomor tidak valid (contoh: 081234567890).";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.email = "Format email tidak valid.";
  }

  if (!namaBarang) errors.namaBarang = "Nama barang wajib diisi.";
  else if (namaBarang.length < 3) errors.namaBarang = "Nama barang minimal 3 karakter.";
  else if (namaBarang.length > 120) errors.namaBarang = "Nama barang maksimal 120 karakter.";

  if (!kategori) errors.kategori = "Pilih salah satu kategori.";
  else if (!KATEGORI.includes(kategori)) errors.kategori = "Kategori tidak dikenali.";

  if (!warna) errors.warna = "Warna barang wajib diisi.";

  if (!ciriKhusus) errors.ciriKhusus = "Ciri khusus wajib diisi.";
  else if (ciriKhusus.length < 15) {
    errors.ciriKhusus = "Tuliskan ciri khusus minimal 15 karakter agar mudah dikenali.";
  } else if (ciriKhusus.length > 500) errors.ciriKhusus = "Ciri khusus maksimal 500 karakter.";

  if (!tanggalHilang) errors.tanggalHilang = "Tanggal kehilangan wajib diisi.";
  else if (!isRealDate(tanggalHilang)) errors.tanggalHilang = "Format tanggal harus YYYY-MM-DD.";
  else {
    const picked = new Date(`${tanggalHilang}T00:00:00`);
    const limit = new Date();
    limit.setHours(23, 59, 59, 999);
    if (picked > limit) errors.tanggalHilang = "Tanggal tidak boleh melebihi hari ini.";
  }

  if (jamHilang && !/^([01]\d|2[0-3]):[0-5]\d$/.test(jamHilang)) {
    errors.jamHilang = "Format jam harus HH:MM.";
  }

  if (!lokasi) errors.lokasi = "Pilih lokasi kehilangan.";
  else if (!LOKASI.includes(lokasi)) errors.lokasi = "Lokasi tidak dikenali.";

  if (!kronologi) errors.kronologi = "Kronologi wajib diisi.";
  else if (kronologi.length < 20) errors.kronologi = "Ceritakan kronologi minimal 20 karakter.";
  else if (kronologi.length > 2000) errors.kronologi = "Kronologi maksimal 2000 karakter.";

  const ok = Object.keys(errors).length === 0;

  return {
    ok,
    errors,
    value: {
      namaPelapor,
      nim,
      whatsapp: waDigits,
      email,
      namaBarang,
      kategori,
      merek,
      warna,
      ciriKhusus,
      tanggalHilang,
      jamHilang,
      lokasi,
      lokasiDetail,
      kronologi,
      foto,
    },
  };
}

/** Validasi body untuk PATCH /api/reports/:id/status. */
function validateStatus(input) {
  const status = str(input && input.status);
  if (!STATUS.includes(status)) {
    return {
      ok: false,
      errors: { status: 'Status harus "Aktif" atau "Selesai".' },
      value: null,
    };
  }
  return { ok: true, errors: {}, value: { status } };
}

module.exports = { KATEGORI, LOKASI, STATUS, validateCreate, validateStatus };
