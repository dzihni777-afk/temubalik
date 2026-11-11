/* ==========================================================================
   TemuBalik — Daftar laporan (search, filter, sort, load more)
   ========================================================================== */

(function () {
  "use strict";

  const grid = document.getElementById("grid");
  if (!grid) return;

  const PAGE_SIZE = 9;

  const qInput = document.getElementById("q");
  const fKategori = document.getElementById("fKategori");
  const fStatus = document.getElementById("fStatus");
  const fLokasi = document.getElementById("fLokasi");
  const fUrut = document.getElementById("fUrut");
  const resetBtn = document.getElementById("resetBtn");
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  const resultCount = document.getElementById("resultCount");
  const activeChips = document.getElementById("activeChips");

  let allReports = [];
  let filtered = [];
  let shown = PAGE_SIZE;

  initSharedUI();

  /* ---------------------------------------------------------------- */
  /* Isi dropdown dari data                                            */
  /* ---------------------------------------------------------------- */
  function populateFilters() {
    const kategoriSet = new Set(KATEGORI);
    const lokasiSet = new Set(LOKASI);

    allReports.forEach((r) => {
      if (r.kategori) kategoriSet.add(r.kategori);
      if (r.lokasi) lokasiSet.add(r.lokasi);
    });

    [...kategoriSet].sort().forEach((k) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = k;
      fKategori.appendChild(o);
    });

    [...lokasiSet].sort().forEach((l) => {
      const o = document.createElement("option");
      o.value = l;
      o.textContent = l;
      fLokasi.appendChild(o);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Skeleton                                                          */
  /* ---------------------------------------------------------------- */
  function showSkeleton() {
    grid.innerHTML = Array.from({ length: 6 }).map(() => `
      <div class="sk-card">
        <div class="skeleton sk-thumb"></div>
        <div class="skeleton sk-line w40"></div>
        <div class="skeleton sk-line w60"></div>
        <div class="skeleton sk-line w40" style="margin-bottom:18px"></div>
      </div>`).join("");
  }

  /* ---------------------------------------------------------------- */
  /* Filter & render                                                   */
  /* ---------------------------------------------------------------- */
  function applyFilters() {
    const q = (qInput.value || "").trim().toLowerCase();
    const kategori = fKategori.value;
    const status = fStatus.value;
    const lokasi = fLokasi.value;

    filtered = allReports.filter((r) => {
      if (kategori && r.kategori !== kategori) return false;
      if (status && r.status !== status) return false;
      if (lokasi && r.lokasi !== lokasi) return false;

      if (q) {
        const haystack = [
          r.namaBarang, r.lokasi, r.id, r.kategori,
          r.merek, r.warna, r.ciriKhusus, r.namaPelapor, r.lokasiDetail,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const sort = fUrut.value;
    if (sort === "terbaru") {
      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === "terlama") {
      filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sort === "nama") {
      filtered.sort((a, b) => String(a.namaBarang).localeCompare(String(b.namaBarang), "id"));
    }

    shown = PAGE_SIZE;
    render(true);
    renderChips();
  }

  function render(reset) {
    if (reset) grid.innerHTML = "";

    const slice = filtered.slice(0, shown);

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="emoji">🔍</div>
          <h3>Tidak ada laporan yang cocok</h3>
          <p>Coba ubah kata kunci atau reset filter untuk melihat semua laporan.</p>
          <button class="btn btn-ghost" type="button" id="emptyReset">Reset Filter</button>
        </div>`;
      const btn = document.getElementById("emptyReset");
      if (btn) btn.addEventListener("click", resetAll);
      loadMoreBtn.style.display = "none";
      resultCount.textContent = "0 laporan ditemukan";
      return;
    }

    grid.innerHTML = slice.map(cardHtml).join("");

    resultCount.textContent = `Menampilkan ${slice.length} dari ${filtered.length} laporan`;

    if (shown >= filtered.length) {
      loadMoreBtn.style.display = "none";
    } else {
      loadMoreBtn.style.display = "inline-flex";
      loadMoreBtn.textContent = `Muat Lebih Banyak (${filtered.length - shown} lagi)`;
    }
  }

  function cardHtml(r) {
    const badgeClass = r.status === "Selesai" ? "badge-selesai" : "badge-aktif";
    return `
      <a class="report-card" href="detail.html?id=${encodeURIComponent(r.id)}">
        <div class="report-thumb">
          <img src="${escapeHtml(r.foto || "assets/img/placeholder.svg")}" alt="Foto ${escapeHtml(r.namaBarang)}" loading="lazy" />
          <span class="badge ${badgeClass}"><span class="dot"></span>${escapeHtml(r.status)}</span>
        </div>
        <div class="report-body">
          <span class="report-cat">${escapeHtml(r.kategori)}</span>
          <h3 class="report-title">${escapeHtml(r.namaBarang)}</h3>
          <div class="report-meta">
            <span>${ICON.pin}${escapeHtml(r.lokasi)}</span>
            <span>${ICON.calendar}${formatTanggalSingkat(r.tanggalHilang)}</span>
          </div>
          <span class="report-code">${escapeHtml(r.id)}</span>
        </div>
      </a>`;
  }

  /* ---------------------------------------------------------------- */
  /* Chips filter aktif                                                */
  /* ---------------------------------------------------------------- */
  function renderChips() {
    const chips = [];
    if (qInput.value.trim()) chips.push({ key: "q", label: `"${qInput.value.trim()}"` });
    if (fKategori.value) chips.push({ key: "kategori", label: fKategori.value });
    if (fStatus.value) chips.push({ key: "status", label: fStatus.value });
    if (fLokasi.value) chips.push({ key: "lokasi", label: fLokasi.value });

    activeChips.innerHTML = chips
      .map(
        (c) => `<span class="chip">${escapeHtml(c.label)}
          <button type="button" data-chip="${c.key}" aria-label="Hapus filter ${escapeHtml(c.label)}">×</button>
        </span>`
      )
      .join("");

    activeChips.querySelectorAll("[data-chip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.chip;
        if (key === "q") qInput.value = "";
        if (key === "kategori") fKategori.value = "";
        if (key === "status") fStatus.value = "";
        if (key === "lokasi") fLokasi.value = "";
        applyFilters();
      });
    });
  }

  function resetAll() {
    qInput.value = "";
    fKategori.value = "";
    fStatus.value = "";
    fLokasi.value = "";
    fUrut.value = "terbaru";
    applyFilters();
  }

  /* ---------------------------------------------------------------- */
  /* Events                                                            */
  /* ---------------------------------------------------------------- */
  qInput.addEventListener("input", debounce(applyFilters, 250));
  [fKategori, fStatus, fLokasi, fUrut].forEach((el) => el.addEventListener("change", applyFilters));
  resetBtn.addEventListener("click", resetAll);

  loadMoreBtn.addEventListener("click", () => {
    shown += PAGE_SIZE;
    render(false);
    resultCount.textContent = `Menampilkan ${Math.min(shown, filtered.length)} dari ${filtered.length} laporan`;
    if (shown >= filtered.length) loadMoreBtn.style.display = "none";
    else loadMoreBtn.textContent = `Muat Lebih Banyak (${filtered.length - shown} lagi)`;
  });

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */
  (async function boot() {
    showSkeleton();

    // Prefill dari query string (?q=...&kategori=...)
    const params = new URLSearchParams(location.search);
    if (params.get("q")) qInput.value = params.get("q");

    try {
      // Tampil cepat dari data lokal, lalu diperbarui dari Firebase bila siap.
      let populated = false;

      await Store.getAllProgressive((rows) => {
        allReports = rows;

        if (!populated) {
          populateFilters();
          populated = true;

          if (params.get("kategori")) fKategori.value = params.get("kategori");
          if (params.get("status")) fStatus.value = params.get("status");
          if (params.get("lokasi")) fLokasi.value = params.get("lokasi");
        }

        applyFilters();
      });
    } catch (err) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="emoji">⚠️</div>
          <h3>Gagal memuat data</h3>
          <p>${escapeHtml(err.message)}</p>
          <button class="btn btn-primary" onclick="location.reload()">Muat Ulang</button>
        </div>`;
      resultCount.textContent = "Terjadi kesalahan";
    }
  })();
})();
