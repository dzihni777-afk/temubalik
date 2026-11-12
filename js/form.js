/* ==========================================================================
   TemuBalik â€” Form pengajuan barang hilang
   ========================================================================== */

(function () {
  "use strict";

  const form = document.getElementById("laporForm");
  if (!form) return;

  const formView = document.getElementById("formView");
  const successView = document.getElementById("successView");
  const submitBtn = document.getElementById("submitBtn");
  const draftNote = document.getElementById("draftNote");

  const dropzone = document.getElementById("dropzone");
  const fotoInput = document.getElementById("fotoInput");
  const previewWrap = document.getElementById("previewWrap");

  const MAX_FILE_BYTES = 5 * 1024 * 1024;

  // Batas aman untuk satu dokumen Firestore: 1 MiB (1.048.576 byte) untuk
  // SELURUH dokumen, bukan hanya foto. Base64 membengkak ~33% dari ukuran
  // biner, dan masih ada field teks lain. Nilai ini HARUS sama atau lebih
  // kecil dari batas di firestore.rules (700000) — kalau lebih besar,
  // pengguna bisa lolos di frontend tapi ditolak server.
  const MAX_FOTO_DATAURL = 700000;

  /** Foto yang sudah dikompres (data URL) */
  let fotoDataUrl = "";

  /* ---------------------------------------------------------------- */
  /* Inisialisasi                                                      */
  /* ---------------------------------------------------------------- */
  initSharedUI();

  // Isi dropdown kategori & lokasi
  const kategoriSelect = document.getElementById("kategori");
  KATEGORI.forEach((k) => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    kategoriSelect.appendChild(opt);
  });

  const lokasiSelect = document.getElementById("lokasi");
  LOKASI.forEach((l) => {
    const opt = document.createElement("option");
    opt.value = l;
    opt.textContent = l;
    lokasiSelect.appendChild(opt);
  });

  // Batas tanggal maksimal = hari ini
  const tanggalInput = document.getElementById("tanggalHilang");
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  tanggalInput.max = `${yyyy}-${mm}-${dd}`;

  /* ---------------------------------------------------------------- */
  /* Draft                                                             */
  /* ---------------------------------------------------------------- */
  const DRAFT_FIELDS = [
    "namaPelapor", "nim", "whatsapp", "email",
    "namaBarang", "kategori", "merek", "warna", "ciriKhusus",
    "tanggalHilang", "jamHilang", "lokasi", "lokasiDetail", "kronologi",
  ];

  function collectDraft() {
    const data = {};
    DRAFT_FIELDS.forEach((name) => {
      const el = form.elements[name];
      if (el) data[name] = el.value;
    });
    return data;
  }

  function restoreDraft() {
    const draft = Store.loadDraft();
    if (!draft) return;
    let restored = 0;
    DRAFT_FIELDS.forEach((name) => {
      const el = form.elements[name];
      if (el && draft[name]) {
        el.value = draft[name];
        restored += 1;
      }
    });
    if (restored > 0) {
      toast("Isian sebelumnya dipulihkan dari draft.", "info", 3000);
    }
  }

  const saveDraftDebounced = debounce(() => {
    Store.saveDraft(collectDraft());
    if (draftNote) {
      draftNote.style.display = "inline";
      draftNote.textContent = "Draft tersimpan otomatis";
    }
  }, 700);

  form.addEventListener("input", (e) => {
    // Hapus state invalid saat user memperbaiki isian
    const fieldWrap = e.target.closest(".field");
    if (fieldWrap) clearFieldError(fieldWrap);

    saveDraftDebounced();
  });

  form.addEventListener("change", (e) => {
    const fieldWrap = e.target.closest(".field");
    if (fieldWrap) clearFieldError(fieldWrap);
    saveDraftDebounced();
  });

  restoreDraft();

  /* ---------------------------------------------------------------- */
  /* Upload foto                                                       */
  /* ---------------------------------------------------------------- */
  function renderPreview() {
    previewWrap.innerHTML = "";
    if (!fotoDataUrl) return;

    const item = document.createElement("div");
    item.className = "preview-item";
    item.innerHTML = `
      <img src="${fotoDataUrl}" alt="Pratinjau foto barang" />
      <button type="button" aria-label="Hapus foto">Ã—</button>`;
    item.querySelector("button").addEventListener("click", () => {
      fotoDataUrl = "";
      fotoInput.value = "";
      renderPreview();
    });
    previewWrap.appendChild(item);
  }

  async function handleFile(file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("File harus berupa gambar (JPG, PNG, atau WEBP).", "error");
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      toast("Ukuran foto melebihi 5MB. Silakan pilih foto lain.", "error");
      return;
    }

    try {
      // Kompres bertahap: kalau hasilnya masih terlalu besar untuk satu
      // dokumen Firestore (1 MiB), turunkan mutu & ukuran lalu coba lagi.
      // Tanpa ini, foto besar akan ditolak Firestore dengan pesan teknis
      // yang membingungkan pengguna.
      const attempts = [
        [1000, 0.72],
        [900, 0.62],
        [800, 0.52],
        [640, 0.45],
      ];

      let compressed = "";
      for (const [maxSize, quality] of attempts) {
        compressed = await compressImage(file, maxSize, quality);
        if (compressed.length <= MAX_FOTO_DATAURL) break;
      }

      if (compressed.length > MAX_FOTO_DATAURL) {
        toast(
          "Foto masih terlalu besar setelah dikompres. Coba foto lain atau perkecil resolusinya.",
          "error"
        );
        return;
      }

      fotoDataUrl = compressed;
      renderPreview();
      toast("Foto berhasil dilampirkan.", "success", 2400);
    } catch (err) {
      toast(err.message || "Gagal memproses foto.", "error");
    }
  }

  dropzone.addEventListener("click", () => fotoInput.click());

  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fotoInput.click();
    }
  });

  fotoInput.addEventListener("change", () => {
    handleFile(fotoInput.files && fotoInput.files[0]);
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });

  /* ---------------------------------------------------------------- */
  /* Validasi                                                          */
  /* ---------------------------------------------------------------- */
  function setFieldError(name, message) {
    const wrap = document.querySelector(`[data-field="${name}"]`);
    if (!wrap) return;
    wrap.classList.add("invalid");
    const msg = wrap.querySelector(`[data-error-for="${name}"]`);
    if (msg) msg.textContent = message;
  }

  function clearFieldError(wrap) {
    wrap.classList.remove("invalid");
    const name = wrap.dataset.field;
    const msg = wrap.querySelector(`[data-error-for="${name}"]`);
    if (msg) msg.textContent = "";
  }

  function validate() {
    let ok = true;
    let firstInvalid = null;

    const errors = {};

    const v = (name) => (form.elements[name]?.value || "").trim();

    if (!v("namaPelapor")) errors.namaPelapor = "Nama lengkap wajib diisi.";
    else if (v("namaPelapor").length < 3) errors.namaPelapor = "Nama minimal 3 karakter.";

    const wa = v("whatsapp").replace(/[\s\-()]/g, "");
    if (!wa) errors.whatsapp = "Nomor WhatsApp wajib diisi.";
    else if (!/^(0|62)\d{8,14}$/.test(wa)) errors.whatsapp = "Format nomor tidak valid (contoh: 081234567890).";

    const email = v("email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      errors.email = "Format email tidak valid.";
    }

    if (!v("namaBarang")) errors.namaBarang = "Nama barang wajib diisi.";
    else if (v("namaBarang").length < 3) errors.namaBarang = "Nama barang minimal 3 karakter.";

    if (!v("kategori")) errors.kategori = "Pilih salah satu kategori.";
    if (!v("warna")) errors.warna = "Warna barang wajib diisi.";

    if (!v("ciriKhusus")) errors.ciriKhusus = "Ciri khusus wajib diisi.";
    else if (v("ciriKhusus").length < 15) errors.ciriKhusus = "Tuliskan ciri khusus minimal 15 karakter agar mudah dikenali.";

    if (!v("tanggalHilang")) errors.tanggalHilang = "Tanggal kehilangan wajib diisi.";
    else {
      const picked = new Date(v("tanggalHilang") + "T00:00:00");
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      if (picked > now) errors.tanggalHilang = "Tanggal tidak boleh melebihi hari ini.";
    }

    if (!v("lokasi")) errors.lokasi = "Pilih lokasi kehilangan.";
    if (!v("kronologi")) errors.kronologi = "Kronologi wajib diisi.";
    else if (v("kronologi").length < 20) errors.kronologi = "Ceritakan kronologi minimal 20 karakter.";

    if (!form.elements.setuju.checked) errors.setuju = "Anda harus menyetujui pernyataan sebelum mengirim.";

    // Bersihkan semua error dulu
    document.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));

    Object.entries(errors).forEach(([name, message]) => {
      setFieldError(name, message);
      if (!firstInvalid) firstInvalid = document.querySelector(`[data-field="${name}"]`);
      ok = false;
    });

    if (firstInvalid) {
      safeScroll(firstInvalid, { behavior: "smooth", block: "center" });
      const input = firstInvalid.querySelector("input, select, textarea");
      if (input) setTimeout(() => input.focus({ preventScroll: true }), 320);
    }

    return ok;
  }

  /* ---------------------------------------------------------------- */
  /* Submit                                                            */
  /* ---------------------------------------------------------------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validate()) {
      toast("Periksa kembali isian yang ditandai merah.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Mengirim...";

    try {
      const payload = {
        namaPelapor: form.elements.namaPelapor.value.trim(),
        nim: form.elements.nim.value.trim(),
        whatsapp: form.elements.whatsapp.value.trim(),
        email: form.elements.email.value.trim(),
        namaBarang: form.elements.namaBarang.value.trim(),
        kategori: form.elements.kategori.value,
        merek: form.elements.merek.value.trim(),
        warna: form.elements.warna.value.trim(),
        ciriKhusus: form.elements.ciriKhusus.value.trim(),
        tanggalHilang: form.elements.tanggalHilang.value,
        jamHilang: form.elements.jamHilang.value,
        lokasi: form.elements.lokasi.value,
        lokasiDetail: form.elements.lokasiDetail.value.trim(),
        kronologi: form.elements.kronologi.value.trim(),
        foto: fotoDataUrl || "assets/img/placeholder.svg",
      };

      const report = await Store.create(payload);

      Store.clearDraft();
      form.reset();
      fotoDataUrl = "";
      renderPreview();

      // Tampilkan halaman sukses
      formView.classList.add("hidden");
      successView.classList.remove("hidden");
      document.getElementById("resultCode").textContent = report.id;
      safeScrollTo(0);

      document.getElementById("copyCodeBtn").onclick = async () => {
        const ok = await copyText(report.id);
        toast(ok ? "Kode laporan disalin." : "Gagal menyalin. Salin manual ya.", ok ? "success" : "error");
      };

      document.getElementById("printBtn").onclick = () => window.print();

      toast("Laporan berhasil dibuat.", "success");
    } catch (err) {
      const message = String((err && err.message) || "");
      if (/permission|insufficient/i.test(message)) {
        toast("Server menolak penyimpanan. Periksa Security Rules Firestore Anda.", "error");
      } else if (/invalid-argument|too large|maximum.*size|exceeds/i.test(message)) {
        // Firestore menolak dokumen > 1 MiB. Pesan aslinya teknis, jadi
        // diterjemahkan supaya pengguna tahu apa yang harus dilakukan.
        toast(
          "Laporan terlalu besar untuk disimpan. Coba lampirkan foto yang lebih kecil.",
          "error"
        );
      } else {
        toast(message || "Terjadi kesalahan saat menyimpan laporan.", "error");
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Kirim Laporan";
    }
  });

  /* ---------------------------------------------------------------- */
  /* Hapus isian                                                       */
  /* ---------------------------------------------------------------- */
  document.getElementById("clearDraftBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Hapus semua isian?",
      message: "Seluruh data yang sudah Anda ketik pada formulir ini akan dihapus permanen.",
      confirmText: "Ya, hapus",
      danger: true,
    });

    if (!ok) return;

    form.reset();
    fotoDataUrl = "";
    renderPreview();
    Store.clearDraft();
    document.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
    if (draftNote) draftNote.style.display = "none";
    toast("Isian formulir telah dihapus.", "info");
    safeScrollTo(0);
  });
})();
