(() => {
  const key = "sc-color-theme";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference;
  try { preference = localStorage.getItem(key); } catch { /* Storage is optional. */ }
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#050810" : "#f3f7fc");
    document.querySelectorAll(".theme-toggle").forEach((button) => {
      button.setAttribute("aria-pressed", String(theme === "dark"));
      button.setAttribute("aria-label", theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro");
      button.querySelector("[data-theme-label]").textContent = theme === "dark" ? "Claro" : "Escuro";
    });
  };
  // Save Concept identity is black + electric blue: default to dark whenever
  // the visitor hasn't explicitly chosen a theme, regardless of OS preference.
  const current = () => preference === "light" || preference === "dark" ? preference : "dark";
  apply(current());
  document.addEventListener("DOMContentLoaded", () => {
    apply(current());
    document.querySelectorAll(".theme-toggle").forEach((button) => button.addEventListener("click", () => {
      preference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(key, preference); } catch { /* Keep the theme for this visit. */ }
      apply(preference);
    }));
  });
  system.addEventListener("change", () => apply(current()));
  window.addEventListener("storage", (event) => { if (event.key === key) { preference = event.newValue; apply(current()); } });
})();
