/* Uji mode file:// memakai Chrome headless asli (bukan jsdom) */
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT = "C:/Users/ian/Documents/temubalik";
const CHROME = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

function dumpDom(relPath, query = "", profileSuffix = "a") {
  const profile = path.join(os.tmpdir(), `tb-profile-${profileSuffix}`);
  const url = "file:///" + path.join(ROOT, relPath).replace(/\\/g, "/") + query;

  const out = execFileSync(
    CHROME,
    [
      "--headless=new", "--disable-gpu", "--no-sandbox",
      `--user-data-dir=${profile}`,
      "--virtual-time-budget=9000",
      "--dump-dom",
      url,
    ],
    { encoding: "utf8", maxBuffer: 40 * 1024 * 1024, timeout: 90000 }
  );
  return out;
}

/** Ambil isi elemen by id dari string HTML */
function byId(html, id) {
  const m = html.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)<\\/`));
  return m ? m[1] : "";
}

function countIn(html, marker) {
  return (html.match(new RegExp(marker, "g")) || []).length;
}

/** Ambil hanya isi elemen container (untuk hitung kartu tanpa terpengaruh template JS) */
function innerOf(html, id) {
  const start = html.indexOf(`id="${id}"`);
  if (start === -1) return "";
  // cari tag penutup terdekat setelah container ini dengan menghitung kedalaman div
  const openIdx = html.indexOf(">", start) + 1;
  let depth = 1;
  let i = openIdx;
  const re = /<(\/?)div\b/gi;
  re.lastIndex = openIdx;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] === "/") {
      depth--;
      if (depth === 0) return html.slice(openIdx, m.index);
    } else {
      depth++;
    }
    i = m.index;
  }
  return html.slice(openIdx);
}

/* ------------------------------------------------------------------ */
console.log("\n=== file:// index.html ===");
{
  const html = dumpDom("index.html", "", "idx");
  check("statTotal = 10", byId(html, "statTotal").trim() === "10", byId(html, "statTotal"));
  check("statAktif = 8", byId(html, "statAktif").trim() === "8", byId(html, "statAktif"));
  check("statSelesai = 2", byId(html, "statSelesai").trim() === "2", byId(html, "statSelesai"));
  check("heroCode terisi", /^LPR-\d{8}-\d{3}$/.test(byId(html, "heroCode").trim()), byId(html, "heroCode"));
  check("heroTitle terisi", byId(html, "heroTitle").trim().length > 3, byId(html, "heroTitle"));
  check("6 kartu laporan", countIn(innerOf(html, "latestGrid"), 'class="report-card"') === 6, String(countIn(innerOf(html, "latestGrid"), 'class="report-card"')));
  check("tidak ada pesan gagal muat", !/Gagal memuat data/.test(innerOf(html, "latestGrid")));
}

console.log("\n=== file:// daftar.html ===");
{
  const html = dumpDom("daftar.html", "", "dft");
  check("9 kartu tampil", countIn(innerOf(html, "grid"), 'class="report-card"') === 9, String(countIn(innerOf(html, "grid"), 'class="report-card"')));
  check("result count terisi", /Menampilkan 9 dari 10 laporan/.test(html), byId(html, "resultCount"));
  check("tidak ada pesan gagal", !/Gagal memuat data/.test(html));
}

console.log("\n=== file:// detail.html ===");
{
  const html = dumpDom("detail.html", "?id=LPR-20260212-001", "det");
  check("nama barang tampil", /Tas Ransel Hitam/.test(html));
  check("kode tampil", /LPR-20260212-001/.test(html));
  check("kontak tersensor", /0813\*+899/.test(html), "pola sensor tidak ditemukan");
  check("tidak ada 'tidak ditemukan'", !/Laporan tidak ditemukan/.test(html));
}

console.log("\n=== file:// status.html ===");
{
  const html = dumpDom("status.html", "?kode=LPR-20260213-001", "stt");
  check("hasil pencarian tampil", /Jam Tangan G-Shock/.test(html));
  check("status Selesai tampil", /Selesai/.test(html));
}

console.log("\n=== file:// tentang.html ===");
{
  const html = dumpDom("tentang.html", "", "ttg");
  check("FAQ ada 5 item", countIn(html, 'class="acc-item"') === 5, String(countIn(html, 'class="acc-item"')));
  check("judul halaman benar", /Tentang TemuBalik/.test(html));
}

console.log("\n=== file:// admin.html ===");
{
  const html = dumpDom("admin.html", "", "adm");
  check("login gate tampil", /Masuk sebagai Admin/.test(html));
  check("kata sandi demo ditampilkan", /admin123/.test(html));
}

console.log(`\n===== HASIL BROWSER file://: ${pass} pass, ${fail} fail =====\n`);
process.exit(fail ? 1 : 0);

