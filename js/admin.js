/* ==========================================================================
   TemuBalik — Panel admin

   Login memakai Firebase Auth (email + kata sandi) kalau Firebase aktif.
   Kalau Firebase tidak aktif, otomatis kembali ke mode demo lokal supaya
   situs tetap bisa dipakai. Kata sandi demo TIDAK ditulis di file ini —
   nilainya berasal dari .env lewat js/firebase-config.js.
   ========================================================================== */

(function () {
  "use strict";

  const loginGate = document.getElementById("loginGate");
  if (!loginGate) return;

  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const googleWrap = document.getElementById("googleWrap");
  const googleBtn = document.getElementById("googleBtn");
  const loginHint = document.getElementById("loginHint");
  const loginNote = document.getElementById("loginNote");

  const panel = document.getElementById("adminPanel");
  const logoutBtn = document.getElementById("logoutBtn");

  const searchInput = document.getElementById("adminSearch");
  const statusSelect = document.getElementById("adminStatus");
  const countEl = document.getElementById("adminCount");
  const tableBox = document.getElementById("adminTable");

  let allReports = [];

  initSharedUI();

  /* ---------------------------------------------------------------- */
  /* Penanda mode penyimpanan                                          */
  /* ---------------------------------------------------------------- */
  async function showStorageMode() {
    const mode = await Store.mode();

    // Tombol Google hanya berguna kalau Firebase Auth aktif.
    // Auth bisa baru siap setelah mode() selesai, jadi periksa ulang nanti.
    const revealGoogle = () => {
      if (googleWrap && Store.canUseGoogle()) googleWrap.classList.remove("hidden");
    };
    revealGoogle();
    if (!Store.canUseGoogle()) setTimeout(revealGoogle, 3000);

    if (mode === "firebase") return;

    // Mode lokal. Bedakan TIGA sebab yang sangat berbeda:
    //  (a) konfigurasi belum diatur → tampilkan langkah perbaikan, jangan
    //      menawarkan sandi demo (itu akan menyesatkan)
    //  (b) Auth hidup, hanya Firestore bermasalah → login tetap lewat Firebase
    //  (c) Auth juga mati → memang mode demo lokal
    const alasan = String(
      (window.FirebaseStore && window.FirebaseStore.reason && window.FirebaseStore.reason()) || ""
    );
    const masalahConfig = /firebase-config\.js|Konfigurasi Firebase|FIREBASE_|npm run config/i.test(
      alasan
    );

    if (masalahConfig) {
      if (loginHint) {
        loginHint.textContent =
          "Konfigurasi Firebase belum diatur di server ini, jadi login admin " +
          "belum bisa dipakai. Jalankan: cp .env.example .env → isi FIREBASE_* → npm run config.";
      }
      if (loginNote) loginNote.textContent = "";
      return;
    }

    if (Store.usingAuth()) {
      if (loginHint) {
        loginHint.textContent =
          "Tersambung ke Firebase Auth. Data laporan sedang memakai salinan lokal.";
      }
      if (loginNote) loginNote.textContent = "";
      return;
    }

    // Mode lokal: jelaskan ke pengguna, jangan diam-diam.
    if (loginHint) {
      loginHint.textContent =
        "Firebase tidak aktif, panel berjalan dalam mode demo lokal.";
    }
    if (loginNote) {
      // Kata sandi demo dibaca dari konfigurasi (berasal dari .env).
      // Kalau kosong, jangan tampilkan apa pun — login demo memang mati.
      const demo = String((window.TEMUBALIK_FIREBASE || {}).demoPassword || "");
      if (demo) {
        const safe = demo.replace(/[&<>"']/g, (c) => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[c]));
        loginNote.innerHTML =
          `Kata sandi demo: <span class="mono" style="font-weight:700; color: var(--primary);">${safe}</span>`;
      } else {
        loginNote.textContent = "Login demo belum diatur di .env.";
      }
    }
  }

  showStorageMode();

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

  function setError(field, message) {
    const wrap = document.querySelector(`[data-field="${field}"]`);
    const msg = document.querySelector(`[data-error-for="${field}"]`);
    if (wrap) wrap.classList.add("invalid");
    if (msg) msg.textContent = message;
  }

  function clearErrors() {
    document.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
    document.querySelectorAll(".error-msg").forEach((m) => (m.textContent = ""));
  }

  // Sesi Firebase dipulihkan otomatis; sesi demo dibaca dari localStorage.
  // Tunggu dulu supaya panel tidak "berkedip" ke halaman login.
  (async function restoreSession() {
    const loggedIn = await Store.waitAdmin();
    if (loggedIn) showPanel();
    else showLogin();
  })();

  Store.onAdminChange((loggedIn) => {
    if (loggedIn) showPanel();
    else showLogin();
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const email = (emailInput.value || "").trim();
    const password = passwordInput.value || "";

    // Email wajib saat Firebase Auth aktif. Pakai usingAuth(), bukan
    // usingFirebase(): saat Firestore bermasalah tapi Auth sehat, email tetap wajib.
    if (Store.usingAuth()) {
      if (!email) {
        setError("email", "Email wajib diisi.");
        emailInput.focus();
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        setError("email", "Format email tidak valid.");
        emailInput.focus();
        return;
      }
    }

    if (!password.trim()) {
      setError("password", "Kata sandi wajib diisi.");
      passwordInput.focus();
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Memeriksa...";

    try {
      await Store.signInAdmin(email, password);
      showPanel();
      toast("Berhasil masuk sebagai admin.", "success");
    } catch (err) {
      const code = err && err.code ? String(err.code) : "";
      const message = String((err && err.message) || "");

      // Empat kondisi berbeda, jangan disamakan:
      //  (0) konfigurasi belum diatur → beri langkah persis, bukan "coba lagi"
      //  (1) Firebase masih menyiapkan koneksi → minta tunggu, bukan salah sandi
      //  (2) Firebase benar-benar gagal → tampilkan alasan aslinya
      //  (3) kredensial salah / batasan lain → pesan spesifik
      const masalahConfig =
        /firebase-config\.js|Konfigurasi Firebase|FIREBASE_[A-Z_]+|npm run config/i.test(
          message
        );
      const masihMemuat = /memuat|menyiapkan|belum siap|timeout menunggu/i.test(message);
      const gagalKonek =
        /tidak dapat dihubungi|tidak dapat terhubung|network-request-failed/i.test(
          code + " " + message
        );

      if (masalahConfig) {
        // JANGAN menyarankan "coba Masuk dengan Google" di sini: jalur Google
        // butuh konfigurasi yang sama, jadi sarannya menyesatkan.
        setError(
          "password",
          "Konfigurasi Firebase belum diatur di server ini. Jalankan " +
            '"cp .env.example .env", isi variabel FIREBASE_*, lalu "npm run config". ' +
            "Penjelasan: README-firebase.md Langkah 1."
        );
      } else if (
        code.includes("invalid-credential") ||
        code.includes("wrong-password") ||
        code.includes("user-not-found") ||
        code.includes("invalid-email") ||
        /salah|invalid/i.test(message)
      ) {
        setError("password", "Email atau kata sandi salah. Coba lagi.");
      } else if (code.includes("too-many-requests")) {
        setError("password", "Terlalu banyak percobaan. Coba lagi beberapa saat.");
      } else if (code.includes("operation-not-allowed")) {
        setError(
          "password",
          "Login email/kata sandi belum diaktifkan di Firebase Console."
        );
      } else if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) {
        setError("password", "Jendela login Google ditutup. Coba lagi bila perlu.");
      } else if (code.includes("popup-blocked")) {
        setError(
          "password",
          "Jendela Google diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi."
        );
      } else if (gagalKonek) {
        // Didahulukan: pesan gagal konek memuat alasan asli yang bisa saja
        // mengandung kata "memuat", jadi jangan sampai tertangkap pola di atas.
        setError("password", message);
      } else if (masihMemuat) {
        setError(
          "password",
          "Firebase masih menyiapkan koneksi. Tunggu sebentar lalu tekan Masuk lagi."
        );
      } else {
        setError("password", message || "Gagal masuk. Coba lagi.");
      }

      passwordInput.select();
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Masuk";
    }
  });

  logoutBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Keluar dari panel admin?",
      message: "Anda perlu masuk kembali untuk mengakses panel ini.",
      confirmText: "Ya, keluar",
    });
    if (!ok) return;

    try {
      await Store.signOutAdmin();
    } catch {
      /* tetap keluar dari tampilan walau permintaan gagal */
    }
    showLogin();
    toast("Anda telah keluar.", "info");
  });

  /* ---------------------------------------------------------------- */
  /* Login dengan Google                                              */
  /* ---------------------------------------------------------------- */
  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      clearErrors();
      googleBtn.disabled = true;

      try {
        await Store.signInAdminWithGoogle();
        showPanel();
        toast("Berhasil masuk dengan Google.", "success");
      } catch (err) {
        const code = String((err && err.code) || "");
        const message = String((err && err.message) || "");

        if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) {
          toast("Jendela login Google ditutup. Coba lagi bila perlu.", "info");
        } else if (code.includes("popup-blocked")) {
          toast("Popup diblokir browser. Izinkan popup untuk situs ini.", "error");
        } else if (code.includes("unauthorized-domain")) {
          toast("Domain ini belum didaftarkan di Firebase Authentication → Settings → Authorized domains.", "error");
        } else if (code.includes("operation-not-allowed")) {
          toast("Provider Google belum diaktifkan di Firebase Console.", "error");
        } else if (/permission|insufficient/i.test(message)) {
          toast("Akun Google ini bukan admin. Daftarkan emailnya di firestore.rules.", "error");
        } else {
          toast(message || "Gagal masuk dengan Google.", "error");
        }
      } finally {
        googleBtn.disabled = false;
      }
    });
  }

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
      btn.disabled = true;
      try {
        await Store.updateStatus(id, next);
        toast(`Status ${id} diubah menjadi ${next}.`, "success");
        await loadReports();
      } catch (err) {
        toast(friendlyError(err, "Gagal mengubah status."), "error");
        btn.disabled = false;
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

      btn.disabled = true;
      try {
        await Store.remove(id);
        toast("Laporan berhasil dihapus.", "success");
        await loadReports();
      } catch (err) {
        toast(friendlyError(err, "Gagal menghapus laporan."), "error");
        btn.disabled = false;
      }
    }
  });

  /** Terjemahkan error Firestore yang umum jadi pesan yang bisa dimengerti. */
  function friendlyError(err, fallback) {
    const message = String((err && err.message) || "");
    if (/permission|insufficient/i.test(message)) {
      return "Ditolak oleh Security Rules. Pastikan akun ini terdaftar sebagai admin.";
    }
    if (/network|offline|unavailable/i.test(message)) {
      return "Tidak ada koneksi ke Firebase. Periksa internet Anda.";
    }
    return message || fallback;
  }

  /* ---------------------------------------------------------------- */
  /* Filter events                                                     */
  /* ---------------------------------------------------------------- */
  searchInput.addEventListener("input", debounce(renderTable, 220));
  statusSelect.addEventListener("change", renderTable);
})();