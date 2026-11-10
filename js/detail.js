/* ==========================================================================
   TemuBalik — Detail laporan
   ========================================================================== */

(function () {
  "use strict";

  const root = document.getElementById("detailRoot");
  if (!root) return;

  initSharedUI();

  const params = new URLSearchParams(location.search);
  const id = params.get("id");

  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxClose = document.getElementById("lightboxClose");

  function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
    lightboxClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
    lightboxImg.src = "";
  }

  lightboxClose.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox.classList.contains("open")) closeLightbox();
  });

  /* ---------------------------------------------------------------- */
  /* Render error                                                      */
  /* ---------------------------------------------------------------- */
  function renderNotFound(message) {
    root.innerHTML = `
      <div class="result-panel">
        <div class="result-icon err">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
        </div>
        <h2>Laporan tidak ditemukan</h2>
        <p>${escapeHtml(message || "Kode laporan mungkin salah atau laporan sudah dihapus.")}</p>
        <div class="result-actions">
          <a href="daftar.html" class="btn btn-primary">Lihat Daftar Laporan</a>
          <a href="index.html" class="btn btn-ghost">Kembali ke Beranda</a>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- */
  /* Render detail                                                     */
  /* ---------------------------------------------------------------- */
  function render(r) {
    const badgeClass = r.status === "Selesai" ? "badge-selesai" : "badge-aktif";
    const foto = r.foto || "assets/img/placeholder.svg";

    const statusStep2 = r.status === "Selesai"
      ? `<div class="tl-item done">
           <div class="tl-title">Barang ditemukan</div>
           <div class="tl-time">${formatTanggalJam(r.updatedAt)}</div>
         </div>`
      : `<div class="tl-item current">
           <div class="tl-title">Masih dalam pencarian</div>
           <div class="tl-time">Menunggu informasi dari penemu</div>
         </div>`;

    document.title = `${r.namaBarang} — TemuBalik`;

    root.innerHTML = `
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="index.html">Beranda</a>
        <span class="sep">/</span>
        <a href="daftar.html">Daftar Laporan</a>
        <span class="sep">/</span>
        <span>${escapeHtml(r.id)}</span>
      </nav>

      <div class="row mb-24" style="align-items:flex-start; gap:14px;">
        <div style="flex:1 1 auto; min-width:0;">
          <h1 style="font-size: clamp(1.45rem, 3.4vw, 2rem); letter-spacing:-0.03em; line-height:1.2; margin-bottom:8px;">
            ${escapeHtml(r.namaBarang)}
          </h1>
          <div class="row" style="gap:10px;">
            <span class="badge ${badgeClass}"><span class="dot"></span>${escapeHtml(r.status)}</span>
            <span class="badge badge-neutral">${escapeHtml(r.kategori)}</span>
            <span class="report-code">${escapeHtml(r.id)}</span>
          </div>
        </div>
        <div class="row" style="gap:8px; flex-shrink:0;">
          <button class="btn btn-ghost btn-sm" id="shareBtn" type="button">
            ${ICON.share} Bagikan
          </button>
          <a class="btn btn-ghost btn-sm" href="daftar.html">Kembali</a>
        </div>
      </div>

      <div class="detail-grid">
        <!-- Media -->
        <div>
          <div class="detail-media" id="mediaBox" tabindex="0" role="button" aria-label="Perbesar foto">
            <img src="${escapeHtml(foto)}" alt="Foto ${escapeHtml(r.namaBarang)}" />
            <span class="zoom-hint">Klik untuk perbesar</span>
          </div>

          <div class="card card-pad mt-16">
            <h3 style="font-size:0.95rem; font-weight:750; margin-bottom:14px;">Status Laporan</h3>
            <div class="timeline">
              <div class="tl-item done">
                <div class="tl-title">Laporan dibuat</div>
                <div class="tl-time">${formatTanggalJam(r.createdAt)}</div>
              </div>
              ${statusStep2}
            </div>
          </div>
        </div>

        <!-- Data -->
        <div>
          <div class="card">
            <div class="card-head">
              <h3>Informasi Barang</h3>
            </div>
            <div class="card-body" style="padding-top:8px;">
              <dl class="data-list">
                <div class="data-row"><dt>Nama Barang</dt><dd>${escapeHtml(r.namaBarang)}</dd></div>
                <div class="data-row"><dt>Kategori</dt><dd>${escapeHtml(r.kategori)}</dd></div>
                <div class="data-row"><dt>Merek / Tipe</dt><dd>${escapeHtml(r.merek || "-")}</dd></div>
                <div class="data-row"><dt>Warna</dt><dd>${escapeHtml(r.warna || "-")}</dd></div>
                <div class="data-row"><dt>Ciri Khusus</dt><dd>${escapeHtml(r.ciriKhusus || "-")}</dd></div>
                <div class="data-row"><dt>Tanggal Hilang</dt><dd>${formatTanggal(r.tanggalHilang)}${r.jamHilang ? ` · ${escapeHtml(r.jamHilang)} WIB` : ""}</dd></div>
                <div class="data-row"><dt>Lokasi</dt><dd>${escapeHtml(r.lokasi)}${r.lokasiDetail && r.lokasiDetail !== "-" ? `<br /><span class="muted small">${escapeHtml(r.lokasiDetail)}</span>` : ""}</dd></div>
                <div class="data-row"><dt>Kronologi</dt><dd>${escapeHtml(r.kronologi || "-")}</dd></div>
              </dl>
            </div>
          </div>

          <div class="card mt-16">
            <div class="card-head">
              <h3>Kontak Pelapor</h3>
            </div>
            <div class="card-body">
              <dl class="data-list">
                <div class="data-row"><dt>Nama</dt><dd>${escapeHtml(r.namaPelapor)}</dd></div>
                <div class="data-row"><dt>NIM / ID</dt><dd>${escapeHtml(r.nim || "-")}</dd></div>
                <div class="data-row">
                  <dt>WhatsApp</dt>
                  <dd>
                    <span id="phoneText" data-phone="${escapeHtml(r.whatsapp)}">${escapeHtml(maskPhone(r.whatsapp))}</span>
                    <button class="btn btn-soft btn-sm" id="revealBtn" type="button" style="margin-left:8px;">Tampilkan</button>
                  </dd>
                </div>
                ${r.email ? `<div class="data-row"><dt>Email</dt><dd>${escapeHtml(r.email)}</dd></div>` : ""}
              </dl>

              <div class="alert alert-warn mt-16" style="font-size:0.8rem;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
                <span>Kontak disensor demi privasi. Hanya gunakan untuk keperluan pengembalian barang.</span>
              </div>

              <div class="row mt-16" style="gap:10px;">
                <a class="btn btn-primary" id="waBtn" href="${waLink(r.whatsapp)}" target="_blank" rel="noopener noreferrer" style="flex:1 1 auto;">
                  Hubungi via WhatsApp
                </a>
              </div>
            </div>
          </div>

          <div class="card mt-16">
            <div class="card-head">
              <h3>Perbarui Status</h3>
            </div>
            <div class="card-body">
              <p class="muted small mb-16">
                Sudah menemukan barang Anda? Tandai laporan sebagai selesai agar tidak dicari lagi.
              </p>
              <div class="row" style="gap:10px;">
                <button class="btn ${r.status === "Selesai" ? "btn-ghost" : "btn-primary"}" id="toggleStatusBtn" type="button" style="flex:1 1 auto;">
                  ${r.status === "Selesai" ? "Tandai Masih Dicari" : "Tandai Sudah Ditemukan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    /* --- Wiring --- */
    const mediaBox = document.getElementById("mediaBox");
    mediaBox.addEventListener("click", () => openLightbox(foto));
    mediaBox.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(foto);
      }
    });

    // Reveal phone
    const revealBtn = document.getElementById("revealBtn");
    const phoneText = document.getElementById("phoneText");
    if (revealBtn && phoneText) {
      revealBtn.addEventListener("click", () => {
        const real = phoneText.dataset.phone;
        const revealed = phoneText.dataset.revealed === "1";

        if (revealed) {
          phoneText.textContent = maskPhone(real);
          phoneText.dataset.revealed = "0";
          revealBtn.textContent = "Tampilkan";
        } else {
          phoneText.textContent = real || "-";
          phoneText.dataset.revealed = "1";
          revealBtn.textContent = "Sembunyikan";
        }
      });
    }

    // Share
    document.getElementById("shareBtn").addEventListener("click", async () => {
      const url = location.href;
      if (navigator.share) {
        try {
          await navigator.share({ title: r.namaBarang, text: `Laporan ${r.id}`, url });
          return;
        } catch {
          /* user batal */
        }
      }
      const ok = await copyText(url);
      toast(ok ? "Tautan disalin ke clipboard." : "Gagal menyalin tautan.", ok ? "success" : "error");
    });

    // Toggle status
    document.getElementById("toggleStatusBtn").addEventListener("click", async () => {
      const next = r.status === "Selesai" ? "Aktif" : "Selesai";
      const ok = await confirmDialog({
        title: next === "Selesai" ? "Tandai barang ditemukan?" : "Batalkan status selesai?",
        message: next === "Selesai"
          ? "Status laporan akan diubah menjadi Selesai dan tidak lagi muncul sebagai barang yang dicari."
          : "Status laporan akan dikembalikan menjadi Aktif.",
        confirmText: "Ya, ubah status",
      });

      if (!ok) return;

      try {
        const updated = await Store.updateStatus(r.id, next);
        toast(`Status diubah menjadi ${next}.`, "success");
        render(updated);
      } catch (err) {
        toast(err.message || "Gagal mengubah status.", "error");
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */
  (async function boot() {
    if (!id) {
      renderNotFound("Parameter kode laporan tidak ada pada URL.");
      return;
    }

    try {
      const report = await Store.getById(id);
      if (!report) {
        renderNotFound(`Laporan dengan kode "${id}" tidak ditemukan.`);
        return;
      }
      render(report);
    } catch (err) {
      renderNotFound(err.message);
    }
  })();
})();
