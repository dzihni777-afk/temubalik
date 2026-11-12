/* ==========================================================================
   Uji integrasi Firebase (fallback & wiring)

   Fokus: memastikan situs TIDAK rusak saat Firebase tidak tersedia
   (offline / Firestore belum diaktifkan / rules menolak), dan memastikan
   wiring-nya benar saat Firebase dianggap tersedia.

   Jalankan:
     node -e "..." (server statis) lalu node tests/firebase.test.cjs
   ========================================================================== */

"use strict";

const { JSDOM, VirtualConsole, ResourceLoader } = require("jsdom");

const BASE = process.env.TB_BASE || "http://127.0.0.1:3200/";

/**
 * Kata sandi demo dibaca dari js/firebase-config.js (hasil generate .env),
 * BUKAN di-hardcode. Kalau FIREBASE_DEMO_PASSWORD diubah, tes ikut menyesuaikan.
 */
function readDemoPassword() {
  try {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "js", "firebase-config.js"),
      "utf8"
    );
    const m = src.match(/demoPassword\s*:\s*"((?:[^"\\]|\\.)*)"/);
    return m ? JSON.parse(`"${m[1]}"`) : "";
  } catch {
    return "";
  }
}

const DEMO_PASSWORD = readDemoPassword();

let pass = 0;
let fail = 0;

const check = (name, cond, extra = "") => {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Error yang memang diharapkan saat simulasi offline:
 * resource (CDN/Google Fonts) gagal dimuat. Bukan bug aplikasi.
 */
const isExpectedOfflineError = (msg) =>
  /offline \(uji\)|Could not load (script|link|stylesheet)|Failed to load resource/i.test(msg);

const realErrors = (errors) => errors.filter((e) => !isExpectedOfflineError(e));

/**
 * Jalankan ekspresi di dalam window halaman.
 * `Store` dideklarasikan dengan `const` di skrip, jadi tidak menempel di
 * window — harus dievaluasi lewat eval, bukan window.Store.
 */
async function run(dom, expr) {
  return dom.window.eval(`(async () => (${expr}))()`);
}

/** Loader yang menolak semua permintaan ke gstatic (simulasi offline). */
class OfflineLoader extends ResourceLoader {
  fetch(url, options) {
    if (/gstatic\.com|firebaseio\.com|googleapis\.com/.test(url)) {
      return Promise.reject(new Error("offline (uji)"));
    }
    return super.fetch(url, options);
  }
}

async function loadPage(page, { url = "", seedLocal = null, blockFirebase = true } = {}) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => errors.push(e.message));
  vc.on("error", (...a) => errors.push(a.join(" ")));

  const dom = await JSDOM.fromURL(BASE + page + url, {
    runScripts: "dangerously",
    resources: blockFirebase ? new OfflineLoader() : "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      if (seedLocal) {
        for (const [k, v] of Object.entries(seedLocal)) {
          window.localStorage.setItem(k, v);
        }
      }
    },
  });

  await new Promise((r) => {
    if (dom.window.document.readyState === "complete") r();
    else dom.window.addEventListener("load", r);
  });

  // Beri waktu adapter menyerah & fallback.
  await sleep(2600);

  return { dom, errors };
}

(async () => {
  /* ------------------------------------------------------------------ */
  console.log("\n=== Adapter: perilaku saat Firebase gagal ===");
  {
    const { dom, errors } = await loadPage("index.html");
    const w = dom.window;

    check("tidak ada error JS fatal", realErrors(errors).length === 0, realErrors(errors).join(" | "));
    check("window.FirebaseStore ada", typeof w.FirebaseStore === "object");
    check("adapter melaporkan tidak siap", w.FirebaseStore.isReady() === false);
    check("mode jatuh ke local", w.FirebaseStore.mode() === "local");
    check("alasan kegagalan tercatat", String(w.FirebaseStore.reason()).length > 0);

    // Halaman tetap terisi dari localStorage/seed
    check("statistik tetap terisi", w.document.getElementById("statTotal").textContent === "10",
      w.document.getElementById("statTotal").textContent);
    check("kartu terbaru tetap render",
      w.document.querySelectorAll("#latestGrid .report-card").length === 6,
      String(w.document.querySelectorAll("#latestGrid .report-card").length));

    check("Store.mode() = local", (await run(dom, "Store.mode()")) === "local");
    check("Store.usingFirebase() = false", (await run(dom, "Store.usingFirebase()")) === false);

    const all = await run(dom, "Store.getAll()");
    check("Store.getAll tetap mengembalikan 10 laporan", all.length === 10, String(all.length));

    dom.window.close();
  }

  /* ------------------------------------------------------------------ */
  console.log("\n=== Semua halaman tetap hidup tanpa Firebase ===");
  for (const page of ["daftar.html", "lapor.html", "status.html", "tentang.html"]) {
    const { dom, errors } = await loadPage(page);
    const fatal = realErrors(errors);
    check(`${page} tanpa error fatal`, fatal.length === 0, fatal.join(" | "));
    check(`${page} punya konten`, dom.window.document.body.textContent.length > 500);
    dom.window.close();
  }

  /* ------------------------------------------------------------------ */
  console.log("\n=== Form tetap bisa submit (mode lokal) ===");
  {
    const { dom, errors } = await loadPage("lapor.html");
    const w = dom.window;
    const d = w.document;

    const fatal = realErrors(errors);
    check("tidak ada error fatal", fatal.length === 0, fatal.join(" | "));

    const set = (name, value) => {
      const el = d.querySelector(`[name="${name}"]`);
      el.value = value;
      el.dispatchEvent(new w.Event("input", { bubbles: true }));
      el.dispatchEvent(new w.Event("change", { bubbles: true }));
    };

    set("namaPelapor", "Uji Firebase");
    set("whatsapp", "081234567890");
    set("namaBarang", "Tas Uji Integrasi");
    set("kategori", "Dompet & Tas");
    set("warna", "Hitam");
    set("ciriKhusus", "Ada bordir nama di bagian depan tas ini");
    set("tanggalHilang", "2026-02-01");
    set("lokasi", "Kantin");
    set("kronologi", "Tas ditinggal di kursi kantin lalu hilang saat kembali.");
    d.querySelector('[name="setuju"]').checked = true;

    d.getElementById("laporForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await sleep(1200);

    const code = d.getElementById("resultCode").textContent;
    check("laporan berhasil dibuat", /^LPR-\d{8}-\d{3}$/.test(code), code);
    check("halaman sukses tampil", !d.getElementById("successView").classList.contains("hidden"));

    dom.window.close();
  }

  /* ------------------------------------------------------------------ */
  console.log("\n=== Admin: login demo saat Firebase mati ===");
  {
    const { dom, errors } = await loadPage("admin.html");
    const w = dom.window;
    const d = w.document;

    const fatal = realErrors(errors);
    check("tidak ada error fatal", fatal.length === 0, fatal.join(" | "));
    check("login gate tampil", !d.getElementById("loginGate").classList.contains("hidden"));
    check("field email tersedia", !!d.getElementById("email"));
    check("petunjuk mode lokal muncul", /mode demo lokal/i.test(d.getElementById("loginHint").textContent),
      d.getElementById("loginHint").textContent);
    check("sandi demo ditampilkan",
      DEMO_PASSWORD !== "" && d.getElementById("loginNote").textContent.includes(DEMO_PASSWORD));

    // sandi salah
    d.getElementById("password").value = "salah";
    d.getElementById("loginForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await sleep(400);
    check("sandi salah ditolak", /salah/i.test(d.querySelector('[data-error-for="password"]').textContent),
      d.querySelector('[data-error-for="password"]').textContent);

    // sandi benar
    d.getElementById("password").value = DEMO_PASSWORD;
    d.getElementById("loginForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await sleep(1600);
    check("panel terbuka", !d.getElementById("adminPanel").classList.contains("hidden"));
    check("tabel admin terisi 10 baris",
      d.querySelectorAll("#adminTable tbody tr").length === 10,
      String(d.querySelectorAll("#adminTable tbody tr").length));

    // ubah status
    const toggle = d.querySelector('#adminTable [data-act="toggle"]');
    check("tombol toggle ada", !!toggle);
    toggle.click();
    await sleep(1200);
    check("status berubah", d.querySelectorAll("#adminTable .badge-selesai").length >= 1,
      String(d.querySelectorAll("#adminTable .badge-selesai").length));

    dom.window.close();
  }

  /* ------------------------------------------------------------------ */
  console.log("\n=== Detail: tombol status tetap ada di mode lokal ===");
  {
    const { dom } = await loadPage("detail.html", { url: "?id=LPR-20260210-001" });
    const d = dom.window.document;
    const btn = d.getElementById("toggleStatusBtn");
    check("tombol ubah status tampil", !!btn && !btn.classList.contains("hidden"));
    check("laporan tampil", /Dompet Kulit Cokelat/.test(d.body.textContent));
    dom.window.close();
  }

  console.log(`\n${"-".repeat(52)}`);
  console.log(`Hasil: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  console.log("-".repeat(52));
  process.exit(fail === 0 ? 0 : 1);
})();
