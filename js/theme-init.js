/* Terapkan tema sebelum paint pertama untuk mencegah flash tema yang salah (FOUC) */
(function () {
  try {
    var saved = localStorage.getItem("temubalik.theme");
    var theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    /* localStorage bisa diblokir; biarkan default */
  }
})();
