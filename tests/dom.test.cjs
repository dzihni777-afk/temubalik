/* Uji render halaman nyata dengan jsdom */
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/ian/Documents/temubalik";
const BASE = "http://localhost:8899/";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

async function loadPage(page, { seedLocal = null, url = "" } = {}) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => errors.push(e.message));
  vc.on("error", (...a) => errors.push(a.join(" ")));

  const dom = await JSDOM.fromURL(BASE + page + url, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });

  if (seedLocal) {
    for (const [k, v] of Object.entries(seedLocal)) {
      dom.window.localStorage.setItem(k, v);
    }
  }

  await new Promise((r) => {
    if (dom.window.document.readyState === "complete") r();
    else dom.window.addEventListener("load", r);
  });
  await new Promise((r) => setTimeout(r, 1400));

  return { dom, errors };
}

(async () => {
  console.log("\n=== index.html ===");
  {
    const { dom, errors } = await loadPage("index.html");
    const d = dom.window.document;
    check("tidak ada error JS", errors.length === 0, errors.join(" | "));
    check("stat total terisi", d.getElementById("statTotal").textContent !== "—", d.getElementById("statTotal").textContent);
    check("stat total = 10", d.getElementById("statTotal").textContent === "10", d.getElementById("statTotal").textContent);
    const cards = d.querySelectorAll("#latestGrid .report-card");
    check("6 kartu terbaru", cards.length === 6, String(cards.length));
    check("hero judul terisi", d.getElementById("heroTitle").textContent.length > 3, d.getElementById("heroTitle").textContent);
    check("footer tahun terisi", d.getElementById("year").textContent.length === 4);
    check("nav link beranda aktif", !!d.querySelector('.nav-links a.active[href="index.html"]'));
    dom.window.close();
  }

  console.log("\n=== daftar.html ===");
  {
    const { dom, errors } = await loadPage("daftar.html");
    const d = dom.window.document;
    check("tidak ada error JS", errors.length === 0, errors.join(" | "));
    check("grid terisi", d.querySelectorAll("#grid .report-card").length === 9, String(d.querySelectorAll("#grid .report-card").length));
    check("result count terisi", /10 laporan/.test(d.getElementById("resultCount").textContent), d.getElementById("resultCount").textContent);
    check("load more tampil", d.getElementById("loadMoreBtn").style.display !== "none");
    check("dropdown kategori terisi", d.getElementById("fKategori").options.length > 5, String(d.getElementById("fKategori").options.length));

    // uji search
    const q = d.getElementById("q");
    q.value = "dompet";
    q.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    const n = d.querySelectorAll("#grid .report-card").length;
    check("search 'dompet' menyaring (nama + kategori)", n === 2, `dapat ${n}`);
    check("chip filter muncul", d.querySelectorAll("#activeChips .chip").length === 1);

    // reset
    d.getElementById("resetBtn").click();
    await new Promise((r) => setTimeout(r, 400));
    check("reset mengembalikan 9 kartu", d.querySelectorAll("#grid .report-card").length === 9, String(d.querySelectorAll("#grid .report-card").length));

    // load more
    d.getElementById("loadMoreBtn").click();
    await new Promise((r) => setTimeout(r, 300));
    check("load more -> 10 kartu", d.querySelectorAll("#grid .report-card").length === 10, String(d.querySelectorAll("#grid .report-card").length));

    // filter status
    const fs2 = d.getElementById("fStatus");
    fs2.value = "Selesai";
    fs2.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const selesai = d.querySelectorAll("#grid .report-card").length;
    check("filter Selesai = 2", selesai === 2, `dapat ${selesai}`);
    dom.window.close();
  }

  console.log("\n=== detail.html ===");
  {
    const { dom, errors } = await loadPage("detail.html", { url: "?id=LPR-20260210-001" });
    const d = dom.window.document;
    check("tidak ada error JS", errors.length === 0, errors.join(" | "));
    check("judul barang tampil", /Dompet Kulit Cokelat/.test(d.body.textContent));
    check("kode laporan tampil", /LPR-20260210-001/.test(d.body.textContent));
    check("nomor WA tersensor", /0812\*+890/.test(d.body.textContent), "tidak ketemu pola sensor");

    const reveal = d.getElementById("revealBtn");
    check("tombol reveal ada", !!reveal);
    reveal.click();
    check("nomor terbuka setelah reveal", /081234567890/.test(d.getElementById("phoneText").textContent), d.getElementById("phoneText").textContent);

    const toggle = d.getElementById("toggleStatusBtn");
    check("tombol toggle status ada", !!toggle);
    toggle.click();
    await new Promise((r) => setTimeout(r, 250));
    const okBtn = d.querySelector('.modal.open [data-act="ok"]');
    check("modal konfirmasi muncul", !!okBtn);
    if (okBtn) {
      okBtn.click();
      await new Promise((r) => setTimeout(r, 900));
      check("status berubah ke Selesai", /Selesai/.test(d.querySelector(".badge").textContent), d.querySelector(".badge").textContent);
    }
    dom.window.close();
  }

  console.log("\n=== detail.html (id tidak ada) ===");
  {
    const { dom } = await loadPage("detail.html", { url: "?id=LPR-00000000-000" });
    const d = dom.window.document;
    check("tampil pesan tidak ditemukan", /Laporan tidak ditemukan/.test(d.body.textContent));
    dom.window.close();
  }

  console.log("\n=== status.html ===");
  {
    const { dom, errors } = await loadPage("status.html", { url: "?kode=LPR-20260211-001" });
    const d = dom.window.document;
    check("tidak ada error JS", errors.length === 0, errors.join(" | "));
    check("hasil pencarian tampil", /iPhone 13 Pro/.test(d.body.textContent));
    check("empty state laporan saya", /Belum ada laporan/.test(d.body.textContent));
    dom.window.close();
  }

  console.log("\n=== admin.html ===");
  {
    const { dom, errors } = await loadPage("admin.html");
    const d = dom.window.document;
    check("tidak ada error JS", errors.length === 0, errors.join(" | "));
    check("login gate tampil", !d.getElementById("loginGate").classList.contains("hidden"));
    check("panel tersembunyi", d.getElementById("adminPanel").classList.contains("hidden"));

    // login salah
    const pw = d.getElementById("password");
    pw.value = "salah";
    d.getElementById("loginForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 200));
    check("password salah ditolak", /salah/i.test(d.querySelector('[data-error-for="password"]').textContent));

    // login benar
    pw.value = "admin123";
    d.getElementById("loginForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 1400));
    check("panel terbuka setelah login", !d.getElementById("adminPanel").classList.contains("hidden"));
    check("tabel admin terisi", d.querySelectorAll("#adminTable tbody tr").length === 10, String(d.querySelectorAll("#adminTable tbody tr").length));
    check("stat total = 10", d.getElementById("aTotal").textContent === "10", d.getElementById("aTotal").textContent);
    check("stat aktif = 8", d.getElementById("aAktif").textContent === "8", d.getElementById("aAktif").textContent);

    // hapus laporan
    const delBtn = d.querySelector('#adminTable [data-act="delete"]');
    check("tombol hapus ada", !!delBtn);
    delBtn.click();
    await new Promise((r) => setTimeout(r, 250));
    const okDel = d.querySelector('.modal.open [data-act="ok"]');
    check("modal hapus muncul", !!okDel);
    if (okDel) {
      okDel.click();
      await new Promise((r) => setTimeout(r, 1000));
      check("tabel berkurang jadi 9", d.querySelectorAll("#adminTable tbody tr").length === 9, String(d.querySelectorAll("#adminTable tbody tr").length));
      check("stat total jadi 9", d.getElementById("aTotal").textContent === "9", d.getElementById("aTotal").textContent);
    }
    dom.window.close();
  }

  console.log("\n=== tentang.html ===");
  {
    const { dom, errors } = await loadPage("tentang.html");
    const d = dom.window.document;
    check("tidak ada error JS", errors.length === 0, errors.join(" | "));
    check("5 item FAQ", d.querySelectorAll(".acc-item").length === 5, String(d.querySelectorAll(".acc-item").length));
    const btn = d.querySelector(".acc-btn");
    btn.click();
    await new Promise((r) => setTimeout(r, 400));
    check("accordion terbuka", d.querySelector(".acc-item").classList.contains("open"));
    check("aria-expanded true", btn.getAttribute("aria-expanded") === "true");
    dom.window.close();
  }

  console.log(`\n===== HASIL DOM: ${pass} pass, ${fail} fail =====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
