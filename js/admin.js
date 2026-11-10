/* ==========================================================================
   TemuBalik — Panel admin (demo, bukan keamanan sungguhan)
   ========================================================================== */

(function () {
  "use strict";

  const loginGate = document.getElementById("loginGate");
  if (!loginGate) return;

  // Catatan: pada front-end murni, "kata sandi" ini hanya pembatas UI.
  // Jangan gunakan pola ini untuk aplikasi produksi.
  const DEMO_PASSWORD = "admin123";

  const loginForm = document.getElementById("loginForm");
  const passwordInput = document.getElementById("password");
  const panel = document.getElementById("adminPanel");
  const logoutBtn = document.getElementById("logoutBtn");

  const searchInput = document.getElementById("adminSearch");
  const statusSelect = document.getElementById("adminStatus");
  const countEl = document.getElementById("adminCount");
  const tableBox = document.getElementById("adminTable");

  let allReports = [];

  initSharedUI();

  /* ---------------------------------------------------------------- */
  /* Auth gate                                                         */
  /* ---------------------------------------------------------------- */
  function showPanel() {
    loginGate.classList.add("hidden");
    panel.classList.remove("hidden");
    loadReports();
  }

  function showLogin() {
    panel.classList.add("hidden");
    loginGate.classList.remove("hidden");
    passwordInput.value = "";
  }

  if (Store.isAdmin()) showPanel();

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const wrap = document.querySelector('[data-field="password"]');
    const msg = document.querySelector('[data-error-for="password"]');
    wrap.classList.remove("invalid");

    if (!passwordInput.value.trim()) {
      wrap.classList.add("invalid");
      msg.textContent = "Kata sandi wajib diisi.";
      return;
    }

    if (passwordInput.value !== DEMO_PASSWORD) {
      wrap.classList.add("invalid");
      msg.textContent = "Kata sandi salah. Coba lagi.";
      passwordInput.select();
      return;
    }

    Store.setAdminSession(true);
    showPanel();
    toast("Berhasil masuk sebagai admin.", "success");
  });

  logoutBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Keluar dari panel admin?",
      message: "Anda perlu memasukkan kata sandi kembali untuk mengakses panel ini.",
      confirmText: "Ya, keluar",
    });
    if (!ok) return;

    Store.setAdminSession(false);
    showLogin();
    toast("Anda telah keluar.", "info");
  });

  /* ---------------------------------------------------------------- */
  /* Data                                                              */
  /* ---------------------------------------------------------------- */
  async function loadReports() {
    tableBox.innerHTML = `<div class="skeleton" style="height:220px; border-radius:14px;"></div>`;

    try {
      allReports = await Store.getAll();
      updateStats();
      renderTable();
    } catch (err) {
      tableBox.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>Gagal memuat</h3><p>${escapeHtml(err.message)}</p></div>`;
      countEl.textContent = "Terjadi kesalahan";
    }
  }

  function updateStats() {
    const aktif = allReports.filter((r) => r.status === "Aktif").length;
    const selesai = allReports.filter((r) => r.status === "Selesai").length;
    document.getElementById("aTotal").textContent = allReports.length;
    document.getElementById("aAktif").textContent = aktif;
    document.getElementById("aSelesai").textContent = selesai;
  }

  function getFiltered() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const status = statusSelect.value;

    return allReports.filter((r) => {
      if (status && r.status !== status) return false;
      if (!q) return true;
      return [r.id, r.namaBarang, r.namaPelapor, r.lokasi, r.kategori, r.whatsapp]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Render tabel                                                      */
  /* ---------------------------------------------------------------- */
  function renderTable() {
    const rows = getFiltered();

    countEl.textContent = `${rows.length} dari ${allReports.length} laporan`;

    if (!rows.length) {
      tableBox.innerHTML = `
        <div class="empty-state">
          <div class="emoji">📭</div>
          <h3>Tidak ada laporan</h3>
          <p>Belum ada laporan yang cocok dengan filter saat ini.</p>
        </div>`;
      return;
    }

    tableBox.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Barang</th>
              <th>Kode</th>
              <th>Pelapor</th>
              <th>Lokasi</th>
              <th>Tanggal</th>
              <th>Status</th>
              <th style="text-align:right;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr data-id="${escapeHtml(r.id)}">
                <td>
                  <div class="cell-item">
                    <img class="cell-thumb" src="${escapeHtml(r.foto || "assets/img/placeholder.svg")}" alt="" loading="lazy" />
                    <div>
                      <strong>${escapeHtml(r.namaBarang)}</strong>
                      <small>${escapeHtml(r.kategori)}</small>
                    </div>
                  </div>
                </td>
                <td><span class="mono">${escapeHtml(r.id)}</span></td>
                <td>
                  ${escapeHtml(r.namaPelapor)}
                  <br /><small class="muted">${escapeHtml(maskPhone(r.whatsapp))}</small>
                </td>
                <td>${escapeHtml(r.lokasi)}</td>
                <td style="white-space:nowrap;">${formatTanggalSingkat(r.createdAt)}</td>
                <td>
                  <span class="badge ${r.status === "Selesai" ? "badge-selesai" : "badge-aktif"}">
                    <span class="dot"></span>${escapeHtml(r.status)}
                  </span>
                </td>
                <td>
                  <div class="row" style="gap:6px; justify-content:flex-end; flex-wrap:nowrap;">
                    <a href="detail.html?id=${encodeURIComponent(r.id)}" class="btn btn-ghost btn-sm">Lihat</a>
                    <button class="btn btn-soft btn-sm" data-act="toggle" data-id="${escapeHtml(r.id)}" type="button">
                      ${r.status === "Selesai" ? "Aktifkan" : "Selesaikan"}
                    </button>
                    <button class="btn btn-danger btn-sm" data-act="delete" data-id="${escapeHtml(r.id)}" type="button" aria-label="Hapus laporan ${escapeHtml(r.id)}">
                      ${ICON.trash}
                    </button>
                  </div>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  /* ---------------------------------------------------------------- */
  /* Aksi tabel (delegasi event)                                       */
  /* ---------------------------------------------------------------- */
  tableBox.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;

    const { act, id } = btn.dataset;
    const report = allReports.find((r) => r.id === id);
    if (!report) return;

    if (act === "toggle") {
      const next = report.status === "Selesai" ? "Aktif" : "Selesai";
      try {
        await Store.updateStatus(id, next);
        toast(`Status ${id} diubah menjadi ${next}.`, "success");
        await loadReports();
      } catch (err) {
        toast(err.message || "Gagal mengubah status.", "error");
      }
      return;
    }

    if (act === "delete") {
      const ok = await confirmDialog({
        title: "Hapus laporan ini?",
        message: `Laporan "${report.namaBarang}" (${id}) akan dihapus permanen dari daftar. Tindakan ini tidak dapat dibatalkan.`,
        confirmText: "Ya, hapus",
        danger: true,
      });
      if (!ok) return;

      try {
        await Store.remove(id);
        toast("Laporan berhasil dihapus.", "success");
        await loadReports();
      } catch (err) {
        toast(err.message || "Gagal menghapus laporan.", "error");
      }
    }
  });

  /* ---------------------------------------------------------------- */
  /* Filter events                                                     */
  /* ---------------------------------------------------------------- */
  searchInput.addEventListener("input", debounce(renderTable, 220));
  statusSelect.addEventListener("change", renderTable);
})();
