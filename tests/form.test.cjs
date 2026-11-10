/* Uji alur form pengajuan: validasi, submit, kode, draft */
const { JSDOM, VirtualConsole } = require("jsdom");

const BASE = "http://localhost:8899/";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

async function load() {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => errors.push(e.message));

  const dom = await JSDOM.fromURL(BASE + "lapor.html", {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });

  await new Promise((r) => {
    if (dom.window.document.readyState === "complete") r();
    else dom.window.addEventListener("load", r);
  });
  await new Promise((r) => setTimeout(r, 900));
  return { dom, errors };
}

(async () => {
  console.log("\n=== lapor.html: inisialisasi ===");
  {
    const { dom, errors } = await load();
    const d = dom.window.document;

    check("tidak ada error JS", errors.length === 0, errors.join(" | "));
    check("dropdown kategori terisi", d.getElementById("kategori").options.length === 8, String(d.getElementById("kategori").options.length));
    check("dropdown lokasi terisi", d.getElementById("lokasi").options.length === 12, String(d.getElementById("lokasi").options.length));
    check("tanggal max = hari ini", !!d.getElementById("tanggalHilang").max, d.getElementById("tanggalHilang").max);
    check("form terlihat, success tersembunyi",
      !d.getElementById("formView").classList.contains("hidden") &&
      d.getElementById("successView").classList.contains("hidden"));
    dom.window.close();
  }

  console.log("\n=== lapor.html: validasi kosong ===");
  let createdId = "";
  {
    const { dom } = await load();
    const d = dom.window.document;

    d.getElementById("laporForm").dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true })
    );
    await new Promise((r) => setTimeout(r, 500));

    const invalidCount = d.querySelectorAll(".field.invalid").length;
    check("field invalid ditandai", invalidCount >= 7, `dapat ${invalidCount}`);
    check("error nama tampil", d.querySelector('[data-error-for="namaPelapor"]').textContent.length > 0, d.querySelector('[data-error-for="namaPelapor"]').textContent);
    check("error setuju tampil", d.querySelector('[data-error-for="setuju"]').textContent.length > 0);
    check("masih di form view", d.getElementById("successView").classList.contains("hidden"));
    dom.window.close();
  }

  console.log("\n=== lapor.html: validasi format salah ===");
  {
    const { dom } = await load();
    const d = dom.window.document;
    const f = d.getElementById("laporForm");

    d.getElementById("namaPelapor").value = "Ab";
    d.getElementById("whatsapp").value = "123";
    d.getElementById("email").value = "bukan-email";
    d.getElementById("namaBarang").value = "HP";
    d.getElementById("warna").value = "";
    d.getElementById("ciriKhusus").value = "pendek";
    d.getElementById("kronologi").value = "singkat";
    d.getElementById("kategori").value = "";
    d.getElementById("lokasi").value = "";
    d.getElementById("tanggalHilang").value = "";

    f.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 500));

    check("nama terlalu pendek ditolak", /minimal 3/.test(d.querySelector('[data-error-for="namaPelapor"]').textContent), d.querySelector('[data-error-for="namaPelapor"]').textContent);
    check("whatsapp tidak valid ditolak", /tidak valid/.test(d.querySelector('[data-error-for="whatsapp"]').textContent), d.querySelector('[data-error-for="whatsapp"]').textContent);
    check("email tidak valid ditolak", /tidak valid/.test(d.querySelector('[data-error-for="email"]').textContent), d.querySelector('[data-error-for="email"]').textContent);
    check("ciri khusus min 15 ditolak", /minimal 15/.test(d.querySelector('[data-error-for="ciriKhusus"]').textContent), d.querySelector('[data-error-for="ciriKhusus"]').textContent);
    check("kronologi min 20 ditolak", /minimal 20/.test(d.querySelector('[data-error-for="kronologi"]').textContent), d.querySelector('[data-error-for="kronologi"]').textContent);
    dom.window.close();
  }

  console.log("\n=== lapor.html: tanggal masa depan ditolak ===");
  {
    const { dom } = await load();
    const d = dom.window.document;
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const iso = future.toISOString().slice(0, 10);

    d.getElementById("namaPelapor").value = "Penguji Otomatis";
    d.getElementById("whatsapp").value = "081234567890";
    d.getElementById("namaBarang").value = "Barang Uji";
    d.getElementById("kategori").value = "Elektronik";
    d.getElementById("warna").value = "Hitam";
    d.getElementById("ciriKhusus").value = "Ada ciri khusus yang cukup panjang untuk lolos validasi";
    d.getElementById("tanggalHilang").value = iso;
    d.getElementById("lokasi").value = "Gedung A";
    d.getElementById("kronologi").value = "Kronologi pengujian otomatis dengan panjang memadai.";
    d.getElementById("setuju").checked = true;

    d.getElementById("laporForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 500));

    check("tanggal masa depan ditolak", /tidak boleh melebihi/.test(d.querySelector('[data-error-for="tanggalHilang"]').textContent), d.querySelector('[data-error-for="tanggalHilang"]').textContent);
    dom.window.close();
  }

  console.log("\n=== lapor.html: submit valid ===");
  {
    const { dom } = await load();
    const d = dom.window.document;
    const w = dom.window;

    d.getElementById("namaPelapor").value = "Penguji Otomatis";
    d.getElementById("nim").value = "2021999999";
    d.getElementById("whatsapp").value = "081234567890";
    d.getElementById("email").value = "uji@mail.com";
    d.getElementById("namaBarang").value = "Powerbank Putih";
    d.getElementById("kategori").value = "Elektronik";
    d.getElementById("merek").value = "Anker";
    d.getElementById("warna").value = "Putih";
    d.getElementById("ciriKhusus").value = "Ada stiker bintang di bagian belakang, kabel tertinggal di dalam tas.";
    d.getElementById("tanggalHilang").value = new Date().toISOString().slice(0, 10);
    d.getElementById("jamHilang").value = "10:30";
    d.getElementById("lokasi").value = "Perpustakaan";
    d.getElementById("lokasiDetail").value = "Meja nomor 5 lantai 2";
    d.getElementById("kronologi").value = "Saya menaruh powerbank di meja perpustakaan dan lupa membawanya saat pulang.";
    d.getElementById("setuju").checked = true;

    d.getElementById("laporForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 1200));

    check("tidak ada field invalid tersisa", d.querySelectorAll(".field.invalid").length === 0, `${d.querySelectorAll(".field.invalid").length} invalid`);
    check("success view tampil", !d.getElementById("successView").classList.contains("hidden"));
    check("form view tersembunyi", d.getElementById("formView").classList.contains("hidden"));

    const code = d.getElementById("resultCode").textContent;
    createdId = code;
    check("kode laporan berformat benar", /^LPR-\d{8}-\d{3}$/.test(code), code);

    const saved = JSON.parse(w.localStorage.getItem("temubalik.local") || "[]");
    check("tersimpan di localStorage", saved.length === 1, `dapat ${saved.length}`);
    check("data barang benar", saved[0] && saved[0].namaBarang === "Powerbank Putih", saved[0] && saved[0].namaBarang);
    check("status default Aktif", saved[0] && saved[0].status === "Aktif");
    check("draft dibersihkan", w.localStorage.getItem("temubalik.draft") === null);

    const mine = JSON.parse(w.localStorage.getItem("temubalik.mine") || "[]");
    check("masuk daftar laporan saya", mine.includes(code), JSON.stringify(mine));

    dom.window.close();
  }

  console.log("\n=== draft autosave & restore ===");
  {
    const vc = new VirtualConsole();
    const dom = await JSDOM.fromURL(BASE + "lapor.html", {
      runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
    });
    await new Promise((r) => {
      if (dom.window.document.readyState === "complete") r();
      else dom.window.addEventListener("load", r);
    });
    await new Promise((r) => setTimeout(r, 800));

    const d = dom.window.document;
    const w = dom.window;
    d.getElementById("namaBarang").value = "Barang Draft Uji";
    d.getElementById("namaBarang").dispatchEvent(new w.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1200));

    const draft = JSON.parse(w.localStorage.getItem("temubalik.draft") || "null");
    check("draft tersimpan otomatis", draft && draft.namaBarang === "Barang Draft Uji", JSON.stringify(draft));
    dom.window.close();
  }

  console.log("\n=== draft dipulihkan saat reload ===");
  {
    const vc = new VirtualConsole();
    const dom = await JSDOM.fromURL(BASE + "lapor.html", {
      runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(window) {
        window.localStorage.setItem("temubalik.draft", JSON.stringify({ namaBarang: "Pulihkan Saya", warna: "Merah" }));
      },
    });
    await new Promise((r) => {
      if (dom.window.document.readyState === "complete") r();
      else dom.window.addEventListener("load", r);
    });
    await new Promise((r) => setTimeout(r, 900));

    const d = dom.window.document;
    check("nama barang dipulihkan", d.getElementById("namaBarang").value === "Pulihkan Saya", d.getElementById("namaBarang").value);
    check("warna dipulihkan", d.getElementById("warna").value === "Merah", d.getElementById("warna").value);
    dom.window.close();
  }

  console.log("\n=== laporan baru muncul di daftar ===");
  if (createdId) {
    const vc = new VirtualConsole();
    const dom = await JSDOM.fromURL(BASE + "daftar.html", {
      runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(window) {
        window.localStorage.setItem("temubalik.local", JSON.stringify([{
          id: createdId,
          namaBarang: "Powerbank Putih",
          kategori: "Elektronik",
          merek: "Anker",
          warna: "Putih",
          ciriKhusus: "Stiker bintang",
          tanggalHilang: new Date().toISOString().slice(0, 10),
          jamHilang: "10:30",
          lokasi: "Perpustakaan",
          lokasiDetail: "Meja 5",
          kronologi: "Lupa dibawa",
          foto: "assets/img/placeholder.svg",
          namaPelapor: "Penguji Otomatis",
          nim: "2021999999",
          whatsapp: "081234567890",
          email: "uji@mail.com",
          status: "Aktif",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]));
      },
    });
    await new Promise((r) => {
      if (dom.window.document.readyState === "complete") r();
      else dom.window.addEventListener("load", r);
    });
    await new Promise((r) => setTimeout(r, 1400));

    const d = dom.window.document;
    check("total jadi 11 laporan", /11 laporan/.test(d.getElementById("resultCount").textContent), d.getElementById("resultCount").textContent);
    check("laporan baru tampil paling atas", /Powerbank Putih/.test(d.querySelector("#grid .report-card").textContent), d.querySelector("#grid .report-card").textContent.slice(0, 60));
    dom.window.close();
  }

  console.log(`\n===== HASIL FORM: ${pass} pass, ${fail} fail =====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
