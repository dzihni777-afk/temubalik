/* ==========================================================================
   TemuBalik — Cek status & laporan saya
   ========================================================================== */

(function () {
  "use strict";

  const form = document.getElementById("statusForm");
  if (!form) return;

  const input = document.getElementById("kode");
  const resultBox = document.getElementById("statusResult");
  const mineList = document.getElementById("mineList");

  initSharedUI();

  // Prefill dari ?kode=
  const params = new URLSearchParams(location.search);
  if (params.get("kode")) {
    input.value = params.get("kode");
    setTimeout(() => form.requestSubmit(), 220);
  }

  /* ---------------------------------------------------------------- */
  /* Render hasil pencarian                                            */
  /* ---------------------------------------------------------------- */
  function renderResult(report) {
    if (!report) {
      resultBox.innerHTML = `
        <div class="result-panel">
          <div class="result-icon err">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
          </div>
          <h2>Kode tidak ditemukan</h2>
          <p>Periksa kembali kode laporan Anda. Pastikan formatnya seperti <span class="mono">LPR-20260214-001</span>.</p>
          <div class="result-actions">
            <a href="lapor.html" class="btn btn-primary">Buat Laporan Baru</a>
            <a href="daftar.html" class="btn btn-ghost">Lihat Semua Laporan</a>
          </div>
        </div>`;
      return;
    }

    const badgeClass = report.status === "Selesai" ? "badge-selesai" : "badge-aktif";

    resultBox.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>Hasil Pencarian</h3>
          <div class="spacer"></div>
          <span class="badge ${badgeClass}"><span class="dot"></span>${escapeHtml(report.status)}</span>
        </div>
        <div class="card-body">
          <div class="row" style="gap:16px; align-items:flex-start;">
            <img src="${escapeHtml(report.foto || "assets/img/placeholder.svg")}"
                 alt="Foto ${escapeHtml(report.namaBarang)}"
                 style="width:104px;height:104px;object-fit:cover;border-radius:12px;border:1px solid var(--border);flex-shrink:0;" />
            <div style="flex:1 1 240px; min-width:0;">
              <span class="report-cat">${escapeHtml(report.kategori)}</span>
              <h3 style="font-size:1.08rem; font-weight:750; letter-spacing:-0.02em; margin:3px 0 8px;">${escapeHtml(report.namaBarang)}</h3>
              <div class="report-meta">
                <span>${ICON.pin}${escapeHtml(report.lokasi)}</span>
                <span>${ICON.calendar}${formatTanggal(report.tanggalHilang)}</span>
                <span class="report-code">${escapeHtml(report.id)}</span>
              </div>
            </div>
          </div>

          <div class="alert ${report.status === "Selesai" ? "alert-info" : "alert-warn"} mt-16" style="font-size:0.85rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg>
            <span>${report.status === "Selesai"
              ? "Barang pada laporan ini sudah ditandai ditemukan."
              : "Laporan ini masih aktif. Tim akan menghubungi Anda jika barang ditemukan."}</span>
          </div>

          <div class="row mt-16" style="gap:10px;">
            <a href="detail.html?id=${encodeURIComponent(report.id)}" class="btn btn-primary" style="flex:1 1 auto;">Lihat Detail Lengkap</a>
          </div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- */
  /* Laporan saya                                                      */
  /* ---------------------------------------------------------------- */
  async function renderMine() {
    const mine = await Store.getMine();

    if (!mine.length) {
      mineList.innerHTML = `
        <div class="empty-state">
          <div class="emoji">📋</div>
          <h3>Belum ada laporan dari perangkat ini</h3>
          <p>Laporan yang Anda buat di browser ini akan muncul di sini untuk memudahkan pemantauan.</p>
          <a href="lapor.html" class="btn btn-primary">Buat Laporan Pertama</a>
        </div>`;
      return;
    }

    mineList.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Barang</th>
              <th>Kode</th>
              <th>Lokasi</th>
              <th>Tanggal Lapor</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${mine.map((r) => `
              <tr>
                <td>
                  <div class="cell-item">
                    <img class="cell-thumb" src="${escapeHtml(r.foto || "assets/img/placeholder.svg")}" alt="" />
                    <div>
                      <strong>${escapeHtml(r.namaBarang)}</strong>
                      <small>${escapeHtml(r.kategori)}</small>
                    </div>
                  </div>
                </td>
                <td><span class="mono">${escapeHtml(r.id)}</span></td>
                <td>${escapeHtml(r.lokasi)}</td>
                <td>${formatTanggalSingkat(r.createdAt)}</td>
                <td>
                  <span class="badge ${r.status === "Selesai" ? "badge-selesai" : "badge-aktif"}">
                    <span class="dot"></span>${escapeHtml(r.status)}
                  </span>
                </td>
                <td><a href="detail.html?id=${encodeURIComponent(r.id)}" class="btn btn-ghost btn-sm">Detail</a></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  /* ---------------------------------------------------------------- */
  /* Events                                                            */
  /* ---------------------------------------------------------------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const wrap = document.querySelector('[data-field="kode"]');
    const msg = document.querySelector('[data-error-for="kode"]');
    wrap.classList.remove("invalid");

    const kode = input.value.trim().toUpperCase();

    if (!kode) {
      wrap.classList.add("invalid");
      msg.textContent = "Masukkan kode laporan terlebih dahulu.";
      input.focus();
      return;
    }

    try {
      const report = await Store.getById(kode);
      renderResult(report);

      if (!report) {
        wrap.classList.add("invalid");
        msg.textContent = "Kode laporan tidak ditemukan.";
      }

      safeScroll(resultBox, { behavior: "smooth", block: "nearest" });
    } catch (err) {
      toast(err.message || "Gagal mencari laporan.", "error");
    }
  });

  input.addEventListener("input", () => {
    const wrap = document.querySelector('[data-field="kode"]');
    wrap.classList.remove("invalid");
  });

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */
  renderMine();
})();
