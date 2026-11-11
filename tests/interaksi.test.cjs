/* Uji interaksi nyata di Chrome: menu mobile, dark mode, lightbox, alur submit */
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const http = require("http");
const fs = require("fs");

const CHROME = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const ROOT = process.env.TB_ROOT || path.resolve(__dirname, "..");
const profile = path.join(os.tmpdir(), "tb-int-" + Date.now());
const port = 9337;

let pass = 0, fail = 0;
const check = (n, c, e = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; console.log(`  FAIL  ${n} ${e}`); }
};

const child = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  "about:blank",
]);

const get = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(d)); }).on("error", rej);
});

(async () => {
  let targets;
  for (let i = 0; i < 40; i++) {
    try { targets = JSON.parse(await get(`http://127.0.0.1:${port}/json/list`)); break; }
    catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  const page = targets.find((t) => t.type === "page");
  const WebSocket = require("ws");
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await new Promise((r) => ws.on("open", r));

  await send("Page.enable");
  await send("Runtime.enable");

  const base = "file:///" + ROOT.replace(/\\/g, "/") + "/";

  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.result && r.result.exceptionDetails) {
      return { error: r.result.exceptionDetails.text };
    }
    return r.result.result.value;
  };

  const goto = async (rel, wait = 2500) => {
    await send("Page.navigate", { url: base + rel });
    await new Promise((r) => setTimeout(r, wait));
  };

  /* -------------------------------------------------- */
  console.log("\n=== Tema: default & toggle ===");
  await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await goto("index.html");

  const theme1 = await evalJs(`document.documentElement.getAttribute('data-theme')`);
  check("tema awal ter-set", ["light", "dark"].includes(theme1), String(theme1));

  await evalJs(`document.getElementById('themeToggle').click()`);
  await new Promise((r) => setTimeout(r, 400));
  const theme2 = await evalJs(`document.documentElement.getAttribute('data-theme')`);
  check("tema berubah setelah toggle", theme2 !== theme1, `${theme1} -> ${theme2}`);

  const saved = await evalJs(`localStorage.getItem('temubalik.theme')`);
  check("tema tersimpan di localStorage", saved === theme2, String(saved));

  await goto("index.html", 1500);
  const theme3 = await evalJs(`document.documentElement.getAttribute('data-theme')`);
  check("tema bertahan setelah reload", theme3 === theme2, `${theme2} -> ${theme3}`);

  /* -------------------------------------------------- */
  console.log("\n=== Menu mobile ===");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await goto("index.html");

  const menuClosed = await evalJs(`document.getElementById('navLinks').classList.contains('open')`);
  check("menu awalnya tertutup", menuClosed === false);

  const toggleVisible = await evalJs(`getComputedStyle(document.getElementById('navToggle')).display !== 'none'`);
  check("tombol menu tampil di mobile", toggleVisible === true);

  await evalJs(`document.getElementById('navToggle').click()`);
  await new Promise((r) => setTimeout(r, 400));
  const menuOpen = await evalJs(`document.getElementById('navLinks').classList.contains('open')`);
  check("menu terbuka setelah klik", menuOpen === true);

  const ariaExp = await evalJs(`document.getElementById('navToggle').getAttribute('aria-expanded')`);
  check("aria-expanded = true", ariaExp === "true", String(ariaExp));

  const navVisible = await evalJs(`
    (() => {
      const el = document.getElementById('navLinks');
      const cs = getComputedStyle(el);
      return cs.visibility === 'visible' && parseFloat(cs.opacity) > 0.9;
    })()
  `);
  check("nav link benar-benar terlihat", navVisible === true);

  await evalJs(`document.getElementById('navToggle').click()`);
  await new Promise((r) => setTimeout(r, 400));
  const menuClosed2 = await evalJs(`!document.getElementById('navLinks').classList.contains('open')`);
  check("menu tertutup saat diklik lagi", menuClosed2 === true);

  /* -------------------------------------------------- */
  console.log("\n=== Lightbox di detail ===");
  await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await goto("detail.html?id=LPR-20260210-001");

  const lbClosed = await evalJs(`!document.getElementById('lightbox').classList.contains('open')`);
  check("lightbox awalnya tertutup", lbClosed === true);

  await evalJs(`document.getElementById('mediaBox').click()`);
  await new Promise((r) => setTimeout(r, 400));
  const lbOpen = await evalJs(`document.getElementById('lightbox').classList.contains('open')`);
  check("lightbox terbuka setelah klik foto", lbOpen === true);

  const lbImg = await evalJs(`document.getElementById('lightboxImg').getAttribute('src')`);
  check("gambar lightbox terisi", !!lbImg && lbImg.length > 5, String(lbImg).slice(0, 40));

  const bodyLocked = await evalJs(`document.body.style.overflow`);
  check("scroll body terkunci", bodyLocked === "hidden", String(bodyLocked));

  await evalJs(`document.getElementById('lightboxClose').click()`);
  await new Promise((r) => setTimeout(r, 400));
  const lbClosed2 = await evalJs(`!document.getElementById('lightbox').classList.contains('open')`);
  check("lightbox tertutup via tombol", lbClosed2 === true);
  const bodyUnlocked = await evalJs(`document.body.style.overflow === ''`);
  check("scroll body dibuka kembali", bodyUnlocked === true);

  /* -------------------------------------------------- */
  console.log("\n=== Escape menutup lightbox ===");
  await evalJs(`document.getElementById('mediaBox').click()`);
  await new Promise((r) => setTimeout(r, 300));
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await new Promise((r) => setTimeout(r, 400));
  const escClosed = await evalJs(`!document.getElementById('lightbox').classList.contains('open')`);
  check("Escape menutup lightbox", escClosed === true);

  /* -------------------------------------------------- */
  console.log("\n=== Alur submit lengkap (end-to-end) ===");
  await evalJs(`localStorage.clear()`);
  await goto("lapor.html");

  const fill = `
    (() => {
      const set = (id, val) => {
        const el = document.getElementById(id);
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('namaPelapor', 'Uji Browser Nyata');
      set('nim', '2021999001');
      set('whatsapp', '081298765432');
      set('email', 'uji.browser@mail.com');
      set('namaBarang', 'Sepatu Lari Biru');
      set('kategori', 'Pakaian');
      set('merek', 'Nike');
      set('warna', 'Biru');
      set('ciriKhusus', 'Ada tali cadangan warna putih dan sol bagian kanan sedikit aus.');
      set('tanggalHilang', new Date().toISOString().slice(0,10));
      set('jamHilang', '07:45');
      set('lokasi', 'Lapangan Olahraga');
      set('lokasiDetail', 'Dekat gawang sisi selatan');
      set('kronologi', 'Saya melepas sepatu sebelum bermain futsal dan menaruhnya di pinggir lapangan.');
      document.getElementById('setuju').checked = true;
      return true;
    })()
  `;
  await evalJs(fill);

  await evalJs(`document.getElementById('laporForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  await new Promise((r) => setTimeout(r, 2000));

  const successShown = await evalJs(`!document.getElementById('successView').classList.contains('hidden')`);
  check("halaman sukses tampil", successShown === true);

  const code = await evalJs(`document.getElementById('resultCode').textContent`);
  check("kode laporan valid", /^LPR-\d{8}-\d{3}$/.test(String(code)), String(code));

  const stored = await evalJs(`JSON.parse(localStorage.getItem('temubalik.local') || '[]').length`);
  check("1 laporan tersimpan", stored === 1, String(stored));

  /* -------------------------------------------------- */
  console.log("\n=== Laporan baru muncul di daftar & detail ===");
  await goto("daftar.html", 3000);
  const found = await evalJs(`document.body.textContent.includes('Sepatu Lari Biru')`);
  check("barang baru tampil di daftar", found === true);
  const count = await evalJs(`document.getElementById('resultCount').textContent`);
  check("total jadi 11 laporan", /11 laporan/.test(String(count)), String(count));

  await goto("detail.html?id=" + code, 3000);
  const detailOk = await evalJs(`document.body.textContent.includes('Sepatu Lari Biru')`);
  check("detail laporan baru terbuka", detailOk === true);
  const detailPhone = await evalJs(`document.body.textContent.includes('0812*****432')`);
  check("kontak tersensor di detail", detailPhone === true);

  /* -------------------------------------------------- */
  console.log("\n=== Cek status via kode ===");
  await goto("status.html?kode=" + code, 3200);
  const statusOk = await evalJs(`document.body.textContent.includes('Sepatu Lari Biru')`);
  check("status menemukan laporan", statusOk === true);
  const mineOk = await evalJs(`document.body.textContent.includes('Laporan Saya') && document.querySelectorAll('#mineList tbody tr').length === 1`);
  check("laporan saya berisi 1 baris", mineOk === true);

  /* -------------------------------------------------- */
  console.log("\n=== Admin: login, ubah status, hapus ===");
  await goto("admin.html", 2500);
  await evalJs(`document.getElementById('password').value = 'admin123'`);
  await evalJs(`document.getElementById('loginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  await new Promise((r) => setTimeout(r, 2500));

  const panelOpen = await evalJs(`!document.getElementById('adminPanel').classList.contains('hidden')`);
  check("panel admin terbuka", panelOpen === true);

  const rowCount = await evalJs(`document.querySelectorAll('#adminTable tbody tr').length`);
  check("11 baris di tabel admin", rowCount === 11, String(rowCount));

  const totalStat = await evalJs(`document.getElementById('aTotal').textContent`);
  check("stat total = 11", totalStat === "11", String(totalStat));

  // ubah status laporan pertama
  await evalJs(`document.querySelector('#adminTable [data-act="toggle"]').click()`);
  await new Promise((r) => setTimeout(r, 1800));
  const selesaiCount = await evalJs(`document.getElementById('aSelesai').textContent`);
  check("stat selesai bertambah", Number(selesaiCount) >= 3, String(selesaiCount));

  // hapus satu laporan
  await evalJs(`document.querySelector('#adminTable [data-act="delete"]').click()`);
  await new Promise((r) => setTimeout(r, 500));
  const modalShown = await evalJs(`!!document.querySelector('.modal.open')`);
  check("modal konfirmasi hapus muncul", modalShown === true);

  await evalJs(`document.querySelector('.modal.open [data-act="ok"]').click()`);
  await new Promise((r) => setTimeout(r, 2000));
  const afterDel = await evalJs(`document.getElementById('aTotal').textContent`);
  check("total berkurang jadi 10", afterDel === "10", String(afterDel));

  /* -------------------------------------------------- */
  console.log("\n=== Sesi admin bertahan ===");
  await goto("admin.html", 2500);
  const stillLoggedIn = await evalJs(`!document.getElementById('adminPanel').classList.contains('hidden')`);
  check("tetap login setelah reload", stillLoggedIn === true);

  await evalJs(`document.getElementById('logoutBtn').click()`);
  await new Promise((r) => setTimeout(r, 500));
  await evalJs(`document.querySelector('.modal.open [data-act="ok"]').click()`);
  await new Promise((r) => setTimeout(r, 600));
  const loggedOut = await evalJs(`!document.getElementById('loginGate').classList.contains('hidden')`);
  check("logout mengembalikan ke login", loggedOut === true);

  console.log(`\n===== HASIL INTERAKSI: ${pass} pass, ${fail} fail =====\n`);

  ws.close();
  child.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); child.kill(); process.exit(1); });
